import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import sharp from 'sharp'
import type { TextOverlayConfig } from '../../types/video-script.types'
import type { WordTiming } from '../audio'

/** Approximate average character width relative to font size for bold sans-serif. */
const AVG_CHAR_WIDTH_RATIO = 0.6
/** Approximate space character width relative to font size. */
const SPACE_WIDTH_RATIO = 0.3

export class AnimatedCaptionRenderer {
  private width: number
  private height: number
  private fps: number
  private config: TextOverlayConfig
  private fontPath: string
  private embeddedFontBase64: string | null = null
  private embeddedFontMime: string = 'font/truetype'
  private embeddedFontWeight: number = 900

  constructor(width: number, height: number, fps: number, config: TextOverlayConfig) {
    this.width = width
    this.height = height
    this.fps = fps
    this.config = config

    // Try to find a good bold font
    const fontPaths = [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      '/System/Library/Fonts/Helvetica-Bold.ttf',
      String.raw`C:\Windows\Fonts\arialbd.ttf`,
      '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
    ]
    this.fontPath = fontPaths.find((p) => fs.existsSync(p)) || ''
  }

  /** Returns the MIME type for a font file based on its URL extension. */
  private fontMimeFromUrl(url: string): string {
    const lower = url.toLowerCase().split('?')[0]
    if (lower.endsWith('.woff2')) return 'font/woff2'
    if (lower.endsWith('.woff')) return 'font/woff'
    if (lower.endsWith('.otf')) return 'font/opentype'
    return 'font/truetype' // .ttf or unknown
  }

  /**
   * Parses the font weight from a Google Fonts URL parameter such as
   * `family=Roboto:wght@700` or `family=Roboto:ital,wght@0,900`.
   * Falls back to 900 if not found.
   */
  private fontWeightFromGoogleUrl(url: string): number {
    const match = url.match(/wght@(?:\d+,)?(\d+)/)
    if (match) {
      const w = Number.parseInt(match[1], 10)
      if (!isNaN(w)) return w
    }
    return 900
  }

  /**
   * Follows HTTP/HTTPS redirects (up to maxRedirects hops) and resolves
   * with the final response.
   */
  private fetchWithRedirects(
    url: string,
    options: { headers?: Record<string, string> } = {},
    maxRedirects: number = 5
  ): Promise<{ res: any; finalUrl: string }> {
    return new Promise((resolve, reject) => {
      const attempt = (currentUrl: string, remaining: number) => {
        const mod = currentUrl.startsWith('https') ? https : http
        mod
          .get(currentUrl, { headers: options.headers ?? {} }, (res) => {
            if (
              remaining > 0 &&
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              const location = res.headers.location
              // Consume and discard the redirect body
              res.resume()
              attempt(location, remaining - 1)
            } else {
              resolve({ res, finalUrl: currentUrl })
            }
          })
          .on('error', reject)
      }
      attempt(url, maxRedirects)
    })
  }

  /**
   * Downloads a font from a URL and returns it as a base64-encoded string.
   * Supports Google Fonts CSS URLs by first fetching the CSS to extract the
   * actual font file URL, then downloading the binary font file.
   * Also detects MIME type and font weight from the URL.
   */
  private async downloadFontAsBase64(url: string): Promise<string | null> {
    try {
      let fontFileUrl = url
      // Parse the URL to check the hostname safely (avoid substring confusion)
      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
      } catch {
        console.warn(`[AnimatedCaptionRenderer] Invalid font URL: ${url}`)
        return null
      }
      if (parsedUrl.hostname === 'fonts.googleapis.com') {
        // Detect requested font weight from the Fonts URL before fetching CSS
        this.embeddedFontWeight = this.fontWeightFromGoogleUrl(url)

        const css = await this.fetchTextWithRedirects(url)
        // Extract first src url(...) from the CSS
        const match = css.match(/src:\s*url\(([^)]+)\)/)
        if (!match) {
          console.warn('[AnimatedCaptionRenderer] Could not parse Google Fonts CSS')
          return null
        }
        fontFileUrl = match[1].replaceAll(/['"]/g, '')
      }

      this.embeddedFontMime = this.fontMimeFromUrl(fontFileUrl)
      const data = await this.fetchBinaryWithRedirects(fontFileUrl)
      return data.toString('base64')
    } catch (error: any) {
      console.warn(`[AnimatedCaptionRenderer] Failed to download font from ${url}: ${error.message}`)
      return null
    }
  }

  /** Fetch a URL as text, following redirects. */
  private async fetchTextWithRedirects(url: string): Promise<string> {
    const { res } = await this.fetchWithRedirects(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    return new Promise((resolve, reject) => {
      let data = ''
      res.on('data', (chunk: string) => {
        data += chunk
      })
      res.on('end', () => resolve(data))
      res.on('error', reject)
    })
  }

  /** Fetch a URL as a binary buffer, following redirects. */
  private async fetchBinaryWithRedirects(url: string): Promise<Buffer> {
    const { res } = await this.fetchWithRedirects(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
  }

  private easeOutElastic(x: number): number {
    const c4 = (2 * Math.PI) / 3
    return x === 0 ? 0 : x === 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1
  }

  private easeOutQuart(x: number): number {
    return 1 - (1 - x) ** 4
  }

  private measureTextApprox(text: string, fontSize: number): { width: number; height: number } {
    // Average character width is typically ~0.6 of font size for sans-serif bold
    return {
      width: text.length * (fontSize * AVG_CHAR_WIDTH_RATIO),
      height: fontSize * 1.2
    }
  }

  /**
   * Returns the largest font size (starting from config.fontSize) at which all
   * words on the given page fit within maxWidth over at most maxLines lines.
   * Font size is reduced in steps of 2px until it fits or reaches a minimum of 12px.
   */
  private getAdaptiveFontSize(page: WordTiming[], maxWidth: number, maxLines: number = 2): number {
    let fontSize = this.config.fontSize
    const minFontSize = 12

    while (fontSize > minFontSize) {
      const spaceWidth = fontSize * SPACE_WIDTH_RATIO
      let lineCount = 1
      let lineWidth = 0
      let fits = true

      for (const w of page) {
        const wordWidth = w.word.length * (fontSize * AVG_CHAR_WIDTH_RATIO)
        if (lineWidth + wordWidth > maxWidth) {
          lineCount++
          lineWidth = 0
        }
        if (lineCount > maxLines) {
          fits = false
          break
        }
        lineWidth += wordWidth + spaceWidth
      }

      if (fits) break
      fontSize -= 2
    }

    return Math.max(fontSize, minFontSize)
  }

  private paginateWords(words: WordTiming[], maxWidth: number, maxLines: number = 2): WordTiming[][] {
    const pages: WordTiming[][] = []
    let currentPage: WordTiming[] = []
    let currentLineWidth = 0
    let lineCount = 1

    const spaceWidth = this.measureTextApprox(' ', this.config.fontSize).width

    for (const w of words) {
      const wordWidth = this.measureTextApprox(w.word, this.config.fontSize).width

      if (currentLineWidth + wordWidth > maxWidth) {
        lineCount++
        currentLineWidth = 0
      }

      if (lineCount > maxLines) {
        // Start a new page
        pages.push(currentPage)
        currentPage = []
        lineCount = 1
        currentLineWidth = 0
      }

      currentPage.push(w)
      currentLineWidth += wordWidth + spaceWidth
    }

    if (currentPage.length > 0) {
      pages.push(currentPage)
    }

    return pages
  }

  private getLayoutForPage(page: WordTiming[]): any[] {
    const maxWidth = this.width * 0.9
    // Auto-shrink: find the font size that fits the page
    const fontSize = this.getAdaptiveFontSize(page, maxWidth)
    const lineSpacing = fontSize * 1.5
    const spaceWidth = this.measureTextApprox(' ', fontSize).width

    const layout: any[] = []
    let currentX = 0
    let currentY = 0
    let currentLine: any[] = []
    const lines: any[][] = []

    // Distribute into lines
    for (const w of page) {
      const wordWidth = this.measureTextApprox(w.word, fontSize).width
      if (currentX + wordWidth > maxWidth && currentLine.length > 0) {
        lines.push(currentLine)
        currentLine = []
        currentX = 0
        currentY += lineSpacing
      }
      currentLine.push({ word: w, x: currentX, y: currentY, width: wordWidth, height: fontSize, fontSize })
      currentX += wordWidth + spaceWidth
    }
    if (currentLine.length > 0) lines.push(currentLine)

    // Center lines
    const totalHeight = lines.length * lineSpacing
    const position = this.config.position ?? 'bottom'
    let startY: number
    if (position === 'top' || position === 'top-left' || position === 'top-right') {
      startY = fontSize + Math.round(this.height * 0.05)
    } else if (position === 'center') {
      startY = Math.round((this.height + fontSize) / 2) - Math.round(totalHeight / 2)
    } else {
      startY = this.height - totalHeight - Math.round(this.height * 0.1) // Bottom (default)
    }

    for (const line of lines) {
      const lineWidth = line.at(-1).x + line.at(-1).width
      const startX = (this.width - lineWidth) / 2

      for (const item of line) {
        layout.push({
          word: item.word,
          x: startX + item.x,
          y: startY + item.y,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize
        })
      }
    }

    return layout
  }

  /** Builds the SVG <defs> block with an embedded @font-face if a font has been loaded. */
  private buildFontDefs(): string {
    const fontFamily = this.config.fontFamily || 'Arial'
    if (!this.embeddedFontBase64) {
      return ''
    }
    const mime = this.embeddedFontMime
    const weight = this.embeddedFontWeight
    // Derive format hint from MIME type
    const formatHint =
      mime === 'font/woff2'
        ? 'woff2'
        : mime === 'font/woff'
          ? 'woff'
          : mime === 'font/opentype'
            ? 'opentype'
            : 'truetype'
    return `<defs><style>
@font-face {
  font-family: '${fontFamily}';
  font-weight: ${weight};
  src: url('data:${mime};base64,${this.embeddedFontBase64}') format('${formatHint}');
}
</style></defs>`
  }

  private renderSVGFrame(layout: any[], activeIndex: number, progress: number, prevLayoutIndex: number): string {
    const { style, fontColor } = this.config
    const highlightColor = this.config.highlightColor ?? '#00E676'
    const fontFamily = this.config.fontFamily ?? 'Arial'
    const fontWeight = this.embeddedFontBase64 ? String(this.embeddedFontWeight) : '900'
    const fontDefs = this.buildFontDefs()

    const activeItem = layout[activeIndex]
    const prevItem = prevLayoutIndex >= 0 ? layout[prevLayoutIndex] : activeItem
    // Use per-item fontSize (set by auto-shrink) or fall back to config
    const fontSize = activeItem?.fontSize ?? this.config.fontSize

    // Animated Background
    let bgRect = ''
    if (style === 'animated-background' && activeItem && prevItem) {
      const ease = this.easeOutElastic(progress)

      const currentX = prevItem.x + (activeItem.x - prevItem.x) * ease
      const currentY = prevItem.y + (activeItem.y - prevItem.y) * ease
      const currentW = prevItem.width + (activeItem.width - prevItem.width) * ease
      const padding = 20

      bgRect = `<rect x="${currentX - padding / 2}" y="${currentY - fontSize + 5}" width="${currentW + padding}" height="${fontSize + 10}" rx="15" ry="15" fill="${highlightColor}" />`
    }

    // Neon glow filter (only emitted when style === 'neon')
    let neonFilterDef = ''
    if (style === 'neon') {
      neonFilterDef =
        `<defs><filter id="neon-glow" x="-40%" y="-40%" width="180%" height="180%">` +
        `<feGaussianBlur stdDeviation="5" result="blur"/>` +
        `<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>` +
        `</filter></defs>`
    }

    let wordsSvg = ''
    for (const [i, item] of layout.entries()) {
      const itemFontSize = item.fontSize ?? this.config.fontSize
      const isActive = i === activeIndex
      const isPast = i <= activeIndex

      let color = fontColor
      let scale = 1
      let opacity = 1
      let stroke = 'stroke="black" stroke-width="8" stroke-linejoin="round"'
      let yOffset = 0
      let filterAttr = ''

      if (style === 'colored-words' || style === 'scaling-words') {
        if (isActive) {
          color = highlightColor
          if (style === 'scaling-words') {
            scale = 1 + 0.2 * this.easeOutElastic(Math.min(1, progress * 4))
          }
        } else if (isPast) {
          color = 'white'
        } else {
          // Not spoken yet — dim both stroke and fill uniformly
          color = 'white'
          opacity = 0.4
        }
      } else if (style === 'animated-background') {
        if (isActive) {
          color = 'white' // text over colored background
          stroke = '' // no stroke over bg
        } else {
          color = 'white'
        }
      } else if (style === 'vibrant' || style === 'remotion') {
        // Vibrant fallback styling but in individual words
        color = isActive ? highlightColor : 'white'
      } else if (style === 'bounce') {
        if (isActive) {
          color = highlightColor
          const bounceOffset = itemFontSize * 1.5
          yOffset = Math.round(-bounceOffset * (1 - this.easeOutElastic(Math.min(1, progress))))
        } else {
          color = 'white'
          if (!isPast) opacity = 0.4
        }
      } else if (style === 'neon') {
        if (isActive) {
          color = highlightColor
          stroke = '' // glow handled by filter
          filterAttr = 'filter="url(#neon-glow)"'
        } else {
          color = 'white'
          opacity = isPast ? 0.7 : 0.4
        }
      } else if (style === 'typewriter') {
        if (isActive) {
          color = highlightColor
          opacity = this.easeOutQuart(Math.min(1, progress * 3))
        } else {
          color = 'white'
          if (!isPast) opacity = 0
        }
      }

      // Apply scale or Y-offset transform around the centre of the word
      const cx = item.x + item.width / 2
      const cy = item.y - item.height / 3
      let transform = ''
      if (scale !== 1) {
        transform = `transform="translate(${cx}, ${cy}) scale(${scale}) translate(${-cx}, ${-cy})"`
      } else if (yOffset !== 0) {
        transform = `transform="translate(0, ${yOffset})"`
      }

      const opacityAttr = opacity < 1 ? `opacity="${opacity}"` : ''

      // Wrap stroke + fill in a group so opacity/filter applies to both uniformly
      const needsGroup = !!(stroke || opacityAttr || filterAttr)
      if (needsGroup) {
        wordsSvg += `<g${opacityAttr ? ` ${opacityAttr}` : ''}${filterAttr ? ` ${filterAttr}` : ''}>`
      }
      if (stroke) {
        wordsSvg += `<text x="${item.x}" y="${item.y}" font-family="${fontFamily}, sans-serif" font-weight="${fontWeight}" font-size="${itemFontSize}" fill="none" ${stroke} ${transform}>${item.word.word}</text>\n`
      }
      wordsSvg += `<text x="${item.x}" y="${item.y}" font-family="${fontFamily}, sans-serif" font-weight="${fontWeight}" font-size="${itemFontSize}" fill="${color}" ${transform}>${item.word.word}</text>\n`
      if (needsGroup) {
        wordsSvg += `</g>`
      }
    }

    return `
        <svg width="${this.width}" height="${this.height}" xmlns="http://www.w3.org/2000/svg">
            ${fontDefs}
            ${neonFilterDef}
            ${bgRect}
            ${wordsSvg}
        </svg>`
  }

  public async renderFrames(wordTimings: WordTiming[], duration: number, outputDir: string): Promise<string> {
    if (!wordTimings || wordTimings.length === 0) {
      throw new Error('wordTimings is empty or not provided')
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // Load Google Font once before rendering all frames
    if (this.config.googleFontUrl && !this.embeddedFontBase64) {
      console.log(`[AnimatedCaptionRenderer] Downloading font from ${this.config.googleFontUrl}...`)
      this.embeddedFontBase64 = await this.downloadFontAsBase64(this.config.googleFontUrl)
      if (this.embeddedFontBase64) {
        console.log('[AnimatedCaptionRenderer] Font downloaded and embedded successfully.')
      }
    }

    const totalFrames = Math.ceil(duration * this.fps)
    const pages = this.paginateWords(wordTimings, this.width * 0.9, 2)

    if (pages.length === 0) {
      throw new Error('No pages generated from word timings')
    }

    const currentPageIndex = 0
    let layout: any[] = []

    // Find which page we are on based on time
    const getPageForTime = (time: number) => {
      for (const [i, page] of pages.entries()) {
        if (time <= page[page.length - 1].end + 0.5) return i // Give it a 0.5s linger
      }
      return pages.length - 1
    }

    const renderPromises: Promise<any>[] = []

    console.log(`[AnimatedCaptionRenderer] Rendering ${totalFrames} frames...`)

    for (let frame = 0; frame < totalFrames; frame++) {
      const time = frame / this.fps
      const pageIndex = getPageForTime(time)
      const page = pages[pageIndex]
      layout = this.getLayoutForPage(page)

      // Find active word
      let activeIndex = -1
      let prevIndex = -1
      let progress = 0 // 0 to 1 progress for the current word's animation

      for (const [i, w] of page.entries()) {
        if (time >= w.start && time <= w.end) {
          activeIndex = i
          prevIndex = Math.max(0, i - 1)
          progress = (time - w.start) / (w.end - w.start)
          break
        }
      }

      // Between words, stick to the last spoken word until the next one starts
      if (activeIndex === -1) {
        for (let i = page.length - 1; i >= 0; i--) {
          if (time > page[i].end) {
            activeIndex = i
            prevIndex = i
            progress = 1
            break
          }
        }
      }

      // If still -1, haven't started first word yet
      if (activeIndex === -1) {
        activeIndex = 0
        prevIndex = 0
        progress = 0
      }

      const svg = this.renderSVGFrame(layout, activeIndex, progress, prevIndex)

      // Pad frame number with zeros
      const frameName = `frame_${String(frame).padStart(5, '0')}.png`
      const framePath = path.join(outputDir, frameName)

      // Batch generation
      const p = sharp(Buffer.from(svg)).png().toFile(framePath)
      renderPromises.push(p)

      // Throttle to avoid out of memory
      if (renderPromises.length >= 50) {
        await Promise.all(renderPromises)
        renderPromises.length = 0
      }
    }

    if (renderPromises.length > 0) {
      await Promise.all(renderPromises)
    }

    console.log(`[AnimatedCaptionRenderer] Rendered ${totalFrames} frames to ${outputDir}`)

    return path.join(outputDir, 'frame_%05d.png')
  }
}
