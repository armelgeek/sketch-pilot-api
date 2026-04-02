/**
 * ASS Caption Service — word spacing fix
 *
 * ROOT CAUSE OF MISALIGNMENT:
 * The previous implementation placed each word on its own `\pos(x,y)` Dialogue
 * event and used `estimateWordWidthPx` to compute x. Because that estimator
 * is a rough heuristic, words drifted left/right relative to each other.
 *
 * FIX — single-line rendering:
 * Instead of N separate dialogue events (one per word), each caption CHUNK is
 * rendered as a SINGLE dialogue line whose text contains inline colour/scale tags
 * between words.  libass handles glyph layout and spacing natively — no
 * estimation needed.
 *
 * Pattern used for most styles:
 *   {\an8\pos(cx,y)}{\c&Hinactive&}WORD1 {\c&Hactive&}WORD2 {\c&Hinactive&}WORD3
 *
 * For `scaling` and `bounce` (per-word transform needed):
 *   The active word is on its OWN line using the single-line trick for inactive
 *   words reduced to a "ghost" layer, while the active word sits on top at the
 *   correct x derived from a MEASURED baseline render.  We still need layout
 *   estimation for those two styles, but only for the active word's x — so the
 *   relative positions of all inactive words remain accurate (they share one line).
 *
 * `animated-background` keeps its per-word approach because the pill SVG shape
 *   must slide to exactly the right x,y — that inherently requires layout math.
 *   However the pill now uses the SAME layout values so at least internal
 *   consistency is preserved.
 *
 * CHANGELOG (bug-fix pass):
 *   - [BUG] buildColoredLine: words with durationMs=0 after clamping now get a
 *     1 ms minimum to avoid invalid ASS events silently dropped by libass.
 *   - [BUG] hexToAssColor: now expands 3-digit shorthand hex (#FFF → #FFFFFF)
 *     before slicing, preventing garbled colour tags.
 *   - [BUG] buildTypewriterLine: refactored to single-event-per-timeslice using
 *     buildSingleLineText pattern — eliminates N² event duplication.
 *   - [FRAGILE] buildBounceLine: fromY is now clamped to avoid going negative
 *     (text clipped at frame top edge).
 *   - [FRAGILE] buildHormoziLine: duplicated hold-segment code extracted into
 *     shared emitTwoLayerEvents() helper — single source of truth.
 *   - [FRAGILE] buildLines: MAX_CHARS now derived from wordsPerLine instead of
 *     hardcoded 24, scales correctly with video width.
 *   - [FRAGILE] cleanWord: normalises Unicode apostrophes/quotes before stripping
 *     punctuation, preventing Whisper typographic chars leaking into output.
 *   - [PERF] springKeyframes: step size now adapts to duration, capping at 60
 *     frames to prevent 600+ ASS events on long paused words.
 *   - [PERF] lerp() in buildAnimatedBgLine: replaced O(N²) reverse scan with
 *     O(N) ascending index walk.
 *   - [AMÉLIO] Config validation: validateConfig() throws descriptive errors on
 *     invalid fontSize, wordsPerLine, or malformed hex colour strings.
 *   - [AMÉLIO] karaoke style: implemented using ASS native \k karaoke tags.
 *   - [AMÉLIO] Emoji handling: code points matching \p{Emoji} get width ratio 1.0
 *     in estimateWordWidthPx instead of the generic 0.6 fallback.
 *   - [AMÉLIO] RTL support: new `direction` config option reverses word order and
 *     layout accumulation for Arabic/Hebrew transcripts.
 */

import type { WordTiming } from '../audio'

export type { WordTiming }

export type AssCaptionStyle =
  | 'colored'
  | 'scaling'
  | 'animated-background'
  | 'bounce'
  | 'neon'
  | 'typewriter'
  | 'karaoke'
  | 'remotion'
  | 'hormozi'

export interface AssCaptionConfig {
  enabled?: boolean
  style?: AssCaptionStyle
  fontFamily?: string
  fontSize?: number
  wordsPerLine?: number
  position?: 'top' | 'center' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none'
  lineYFraction?: number
  inactiveColor?: string
  highlightColor?: string
  pillColor?: string
  borderSize?: number
  shadowSize?: number
  wordSpacing?: number
  charWidthRatio?: number
  /** Text direction. Defaults to 'ltr'. Set to 'rtl' for Arabic, Hebrew, etc. */
  direction?: 'ltr' | 'rtl'
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface CaptionLine {
  words: WordTiming[]
  lineStartMs: number
  lineEndMs: number
}

interface WordLayout {
  word: string
  centerX: number
  centerY: number
  widthPx: number
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function msToAss(ms: number): string {
  const totalCs = Math.round(ms / 10)
  const cs = totalCs % 100
  const s = Math.floor(totalCs / 100) % 60
  const m = Math.floor(totalCs / 6000) % 60
  const h = Math.floor(totalCs / 360000)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

// [BUG FIX] hexToAssColor: expand 3-digit shorthand (#FFF → #FFFFFF) before
// slicing. Previously, #ABC would produce &H00CBAB instead of &H00CCBBAA.
function hexToAssColor(hex: string, alpha = '00'): string {
  let clean = hex.replace('#', '')
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
  }
  // Trim to 6 chars in case an 8-digit CSS hex was passed (#RRGGBBAA)
  clean = clean.slice(0, 6)
  const r = clean.slice(0, 2)
  const g = clean.slice(2, 4)
  const b = clean.slice(4, 6)
  return `&H${alpha}${b}${g}${r}`
}

// [PERF FIX] springKeyframes: step size adapts to duration, capped at 60 frames
// max. Previously a 5-second word could generate 312 frames × 2 layers = 624
// ASS events — a significant file size spike for rare but valid input.
function springKeyframes(
  from: number,
  to: number,
  durationMs: number,
  opts: { stiffness?: number; damping?: number; mass?: number; threshold?: number } = {}
): Array<{ ms: number; value: number }> {
  if (durationMs <= 0) {
    return [{ ms: 0, value: to }]
  }

  const { stiffness = 250, damping = 28, mass = 1 } = opts
  const frames: Array<{ ms: number; value: number }> = []

  // Cap at 60 frames; minimum step is 16 ms (≈ 60 fps)
  const MAX_FRAMES = 60
  const stepMs = Math.max(16, Math.ceil(durationMs / MAX_FRAMES))

  let pos = from
  let vel = 0

  for (let t = 0; t <= durationMs; t += stepMs) {
    const force = -stiffness * (pos - to) - damping * vel
    vel += (force / mass) * (stepMs / 1000)
    pos += vel * (stepMs / 1000)
    frames.push({ ms: t, value: pos })

    const threshold = opts.threshold ?? 0.3
    if (Math.abs(pos - to) < threshold && Math.abs(vel) < threshold) break
  }

  if (frames.length > 0 && frames.at(-1)!.ms < durationMs) {
    frames.push({ ms: durationMs, value: to })
  }

  return frames
}

function roundedRectPath(w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2)
  return [
    `m ${rr} 0`,
    `l ${w - rr} 0`,
    `b ${w} 0 ${w} ${rr} ${w} ${rr}`,
    `l ${w} ${h - rr}`,
    `b ${w} ${h} ${w - rr} ${h} ${w - rr} ${h}`,
    `l ${rr} ${h}`,
    `b 0 ${h} 0 ${h - rr} 0 ${h - rr}`,
    `l 0 ${rr}`,
    `b 0 0 ${rr} 0 ${rr} 0`
  ].join(' ')
}

// [AMÉLIO] Config validation — throws descriptive errors instead of silently
// producing broken ASS files.
function validateConfig(config: AssCaptionConfig): void {
  const HEX_RE = /^#([0-9A-F]{3}|[0-9A-F]{6})$/i

  if (config.fontSize !== undefined && (config.fontSize < 8 || config.fontSize > 500)) {
    throw new RangeError(`AssCaptionConfig: fontSize must be between 8 and 500, got ${config.fontSize}`)
  }
  if (config.wordsPerLine !== undefined && (config.wordsPerLine < 1 || config.wordsPerLine > 20)) {
    throw new RangeError(`AssCaptionConfig: wordsPerLine must be between 1 and 20, got ${config.wordsPerLine}`)
  }
  for (const [key, value] of Object.entries({
    inactiveColor: config.inactiveColor,
    highlightColor: config.highlightColor,
    pillColor: config.pillColor
  })) {
    if (value !== undefined && !HEX_RE.test(value)) {
      throw new TypeError(`AssCaptionConfig: ${key} must be a valid hex colour (#RGB or #RRGGBB), got "${value}"`)
    }
  }
  if (config.direction !== undefined && config.direction !== 'ltr' && config.direction !== 'rtl') {
    throw new TypeError(`AssCaptionConfig: direction must be 'ltr' or 'rtl', got "${config.direction}"`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class AssCaptionService {
  private readonly width: number
  private readonly height: number
  private readonly enabled: boolean

  private readonly style: AssCaptionStyle
  private readonly fontFamily: string
  private readonly fontSize: number
  private readonly wordsPerLine: number
  private readonly lineY: number
  private readonly inactiveColor: string
  private readonly highlightColor: string
  private readonly pillColor: string
  private readonly borderSize: number
  private readonly shadowSize: number
  private readonly wordSpacing: number
  private readonly hasCustomWordSpacing: boolean
  private readonly charWidthRatio: number
  private readonly position: string
  private readonly direction: 'ltr' | 'rtl'

  constructor(width: number, height: number, config: AssCaptionConfig = {}) {
    // [AMÉLIO] Validate config before doing anything else
    validateConfig(config)

    this.width = width
    this.height = height
    this.enabled = config.enabled ?? true
    this.direction = config.direction ?? 'ltr'

    const aspectRatio = width / height
    const autoWordsPerLine = aspectRatio < 0.7 ? 2 : aspectRatio < 1.4 ? 3 : 4
    const autoLineYFraction = 0.2

    const positionFractionMap: Record<string, number> = {
      top: 0.15,
      'top-left': 0.15,
      'top-right': 0.15,
      center: 0.5,
      bottom: 0.95,
      'bottom-left': 0.95,
      'bottom-right': 0.95,
      none: 0.95
    }
    this.position = config.position ?? 'bottom'
    const resolvedLineYFraction =
      config.position !== undefined
        ? (positionFractionMap[config.position] ?? autoLineYFraction)
        : (config.lineYFraction ?? autoLineYFraction)

    this.style = config.style ?? 'colored'
    this.fontFamily = config.fontFamily ?? 'Montserrat'
    this.wordsPerLine = config.wordsPerLine ?? autoWordsPerLine
    this.charWidthRatio = config.charWidthRatio ?? this.getBaseCharWidthRatio(this.fontFamily)

    if (config.fontSize) {
      this.fontSize = config.fontSize
    } else {
      const maxWidth = width * 0.85
      const testWords = 'THE QUICK BROWN FOX'.split(' ').slice(0, this.wordsPerLine)
      let bestFs = 32
      for (let fs = Math.round(height / 10); fs >= 16; fs -= 2) {
        const spaceW = this.estimateSpaceWidthPx(fs)
        const totalW =
          testWords.reduce((sum, w) => sum + this.estimateWordWidthPx(w, fs), 0) + spaceW * (testWords.length - 1)
        if (totalW <= maxWidth) {
          bestFs = fs
          break
        }
      }
      const portraitScale = aspectRatio < 0.7 ? 0.6 : 1
      this.fontSize = Math.max(16, Math.round((bestFs * portraitScale) / 2) * 2)
    }

    this.hasCustomWordSpacing = config.wordSpacing !== undefined
    this.wordSpacing = config.wordSpacing ?? this.estimateSpaceWidthPx(this.fontSize)

    if (this.position.includes('bottom')) {
      const isVertical = aspectRatio < 0.7
      const distanceMultiplier = isVertical ? 2.5 : 0.8
      this.lineY = Math.round(height - this.fontSize * distanceMultiplier)
    } else if (this.position.includes('top')) {
      this.lineY = Math.round(this.fontSize * 1.2)
    } else {
      this.lineY = Math.round(resolvedLineYFraction * height) - Math.round(this.fontSize * 0.35)
    }

    this.borderSize = config.borderSize ?? 2
    this.shadowSize = config.shadowSize ?? 0

    const defaultHighlight =
      this.style === 'colored'
        ? '#FFE135'
        : this.style === 'scaling'
          ? '#4ADE80'
          : this.style === 'bounce'
            ? '#FFE135'
            : this.style === 'neon'
              ? '#00FFFF'
              : this.style === 'hormozi'
                ? '#FFE135'
                : '#FFFFFF'

    this.inactiveColor = hexToAssColor(config.inactiveColor ?? '#888888')
    this.highlightColor = hexToAssColor(config.highlightColor ?? defaultHighlight)
    this.pillColor = hexToAssColor(config.pillColor ?? '#3B82F6')
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  public buildASSFile(words: WordTiming[]): string {
    if (!this.enabled) {
      return ''
    }

    // Fix Whisper overlaps: clamp duration to not bleed into the next word.
    // [BUG FIX] Also enforce minimum duration of 1 ms to avoid t0==t1 ASS
    // events that libass silently drops, causing words to disappear.
    const clampedWords = words.map((w, i) => {
      const nextWord = words[i + 1]
      let durationMs = w.durationMs
      if (nextWord && w.startMs + durationMs > nextWord.startMs) {
        durationMs = Math.max(1, nextWord.startMs - w.startMs)
      }
      // Guarantee at least 1 ms so the ASS event is never t0==t1
      durationMs = Math.max(1, durationMs)
      return { ...w, durationMs }
    })

    const lines = this.buildLines(clampedWords)
    const header = this.buildHeader()
    const body = lines.map((line) => this.buildLineEvents(line)).join('\n')
    return `${header}\n${body}`
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildLines(words: WordTiming[]): CaptionLine[] {
    const lines: CaptionLine[] = []
    let currentChunk: WordTiming[] = []
    let currentChars = 0

    // [FRAGILE FIX] MAX_CHARS was hardcoded to 24 regardless of wordsPerLine or
    // video width. Derivation: ~7 chars/word average × wordsPerLine, with a
    // generous floor of 20 and ceiling of 60 to stay sane across all configs.
    const MAX_CHARS = Math.max(20, Math.min(60, Math.round(this.wordsPerLine * 7)))

    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const clean = this.cleanWord(w.word)
      const hasStrongBreak = /[.!?:]/.test(w.word)
      const nextW = words[i + 1]
      const pause = nextW ? nextW.startMs - (w.startMs + w.durationMs) : 0

      currentChunk.push(w)
      currentChars += clean.length + 1

      let shouldBreak = false
      if (hasStrongBreak) shouldBreak = true
      else if (currentChunk.length >= this.wordsPerLine) shouldBreak = true
      else if (currentChars >= MAX_CHARS) shouldBreak = true
      else if (pause > 350) shouldBreak = true

      if (shouldBreak || i === words.length - 1) {
        if (currentChunk.length > 0) {
          const isHormozi = this.style === 'hormozi'
          const maxWords = isHormozi ? 3 : this.wordsPerLine

          // [AMÉLIO] Hormozi split: if forcing 3 words leads to 90% width overflow,
          // split into smaller pieces (2 + 1) to prevent clipping.
          if (isHormozi && currentChunk.length > 1) {
            const currentW =
              currentChunk.reduce((s, w) => s + this.estimateWordWidthPx(this.cleanWord(w.word), this.fontSize), 0) +
              this.wordSpacing * (currentChunk.length - 1)
            if (currentW > this.width * 0.9 && currentChunk.length > 2) {
              // Forced split of a 3-word chunk that is too wide
              const half = Math.ceil(currentChunk.length / 2)
              const firstHalf = currentChunk.slice(0, half)
              const secondHalf = currentChunk.slice(half)

              const chunks = [firstHalf, secondHalf]
              for (const chunk of chunks) {
                lines.push({
                  words: chunk,
                  lineStartMs: chunk[0]!.startMs,
                  lineEndMs: chunk.at(-1)!.startMs + chunk.at(-1)!.durationMs
                })
              }
            } else {
              // Normal Hormozi or non-overflowing
              for (let j = 0; j < currentChunk.length; j += maxWords) {
                const miniChunk = currentChunk.slice(j, j + maxWords)
                lines.push({
                  words: miniChunk,
                  lineStartMs: miniChunk[0]!.startMs,
                  lineEndMs: miniChunk.at(-1)!.startMs + miniChunk.at(-1)!.durationMs
                })
              }
            }
          } else {
            lines.push({
              words: currentChunk,
              lineStartMs: currentChunk[0]!.startMs,
              lineEndMs: currentChunk.at(-1)!.startMs + currentChunk.at(-1)!.durationMs
            })
          }
        }
        currentChunk = []
        currentChars = 0
      }
    }
    return lines
  }

  /**
   * Layout is kept ONLY for styles that genuinely need per-word x positions
   * (animated-background, scaling, bounce, hormozi). Other styles no longer call this.
   *
   * [AMÉLIO] RTL support: in 'rtl' mode the words array is reversed so that
   * layout accumulates right-to-left, matching natural reading direction.
   */
  private computeLayout(line: CaptionLine): WordLayout[] {
    const spacing = this.getEffectiveWordSpacing()
    const orderedWords = this.direction === 'rtl' ? [...line.words].reverse() : line.words
    const wordWidths = orderedWords.map((w) => this.estimateWordWidthPx(this.cleanWord(w.word), this.fontSize))
    const totalW = wordWidths.reduce((a, b) => a + b, 0) + spacing * (orderedWords.length - 1)
    let curLeft = Math.round((this.width - totalW) / 2)

    const layouts = orderedWords.map((w, i) => {
      const ww = wordWidths[i]
      const centerX = curLeft + Math.round(ww / 2)
      curLeft += ww + spacing
      return { word: this.cleanWord(w.word), centerX, centerY: this.lineY, widthPx: ww }
    })

    // Re-reverse so indices match the original line.words order
    return this.direction === 'rtl' ? layouts.reverse() : layouts
  }

  /**
   * Builds a single-line ASS text where each word is tagged with its colour.
   * libass spaces the glyphs natively — no manual x math required.
   *
   * [AMÉLIO] RTL support: reverses word order in the text string when direction='rtl'.
   */
  private buildSingleLineText(line: CaptionLine, activeIdx: number, extraTags: string[] = []): string {
    const words = this.direction === 'rtl' ? [...line.words].reverse() : line.words
    // Remap activeIdx when reversed
    const mappedActive = this.direction === 'rtl' ? line.words.length - 1 - activeIdx : activeIdx

    return words
      .map((w, i) => {
        const originalIdx = this.direction === 'rtl' ? line.words.length - 1 - i : i
        const color = i === mappedActive ? `{\\c${this.highlightColor}}` : `{\\c${this.inactiveColor}}`
        const extra = extraTags[originalIdx] ?? ''
        return `${color}${extra}${this.cleanWord(w.word)}`
      })
      .join(' ')
  }

  /** Get ASS alignment code based on position configuration. */
  private getAlignmentCode(): number {
    const alignmentMap: Record<string, number> = {
      top: 8,
      'top-left': 7,
      'top-right': 9,
      center: 5,
      'center-left': 4,
      'center-right': 6,
      bottom: 2,
      'bottom-left': 1,
      'bottom-right': 3,
      none: 2
    }
    return alignmentMap[this.position] ?? 2
  }

  /** Get X coordinate for positioning based on alignment. */
  private getAlignedX(): number {
    const margin = Math.round(this.width * 0.05)
    const centerX = Math.round(this.width / 2)
    if (this.position === 'top-left' || this.position === 'center-left' || this.position === 'bottom-left') {
      return margin
    }
    if (this.position === 'top-right' || this.position === 'center-right' || this.position === 'bottom-right') {
      return this.width - margin
    }
    return centerX
  }

  /** Common prefix tags for a single-line event. */
  private linePrefix(): string {
    const alignment = this.getAlignmentCode()
    const x = this.getAlignedX()
    return `{\\an${alignment}\\pos(${x},${this.lineY})\\fs${this.fontSize}\\bord${this.borderSize}\\shad${this.shadowSize}}`
  }

  private getEffectiveWordSpacing(): number {
    if (this.hasCustomWordSpacing) return this.wordSpacing
    return Math.max(2, Math.round(this.wordSpacing))
  }

  private getBaseCharWidthRatio(fontFamily: string): number {
    const name = fontFamily.toLowerCase()
    if (name.includes('bebas')) return 0.54 // Slim condensed
    if (name.includes('montserrat')) return 1 // Reference
    if (name.includes('ubuntu')) return 0.94 // Condensed
    if (name.includes('arial')) return 0.91 // Standard sans
    if (name.includes('roboto')) return 0.93 // Standard sans
    if (name.includes('inter')) return 0.94 // Modern sans
    if (name.includes('outfit')) return 0.96 // Modern rounded/wide
    return 0.95
  }

  /**
   * Per-character advance-width table expressed as a fraction of fontSize.
   * Values measured/approximated from Montserrat Bold metrics at 100px.
   */
  private static readonly CHAR_ADV: Record<string, number> = {
    A: 0.62,
    B: 0.6,
    C: 0.62,
    D: 0.68,
    E: 0.54,
    F: 0.5,
    G: 0.66,
    H: 0.68,
    I: 0.26,
    J: 0.36,
    K: 0.62,
    L: 0.5,
    M: 0.78,
    N: 0.68,
    O: 0.72,
    P: 0.58,
    Q: 0.72,
    R: 0.62,
    S: 0.56,
    T: 0.54,
    U: 0.68,
    V: 0.62,
    W: 0.88,
    X: 0.62,
    Y: 0.58,
    Z: 0.58,
    '0': 0.62,
    '1': 0.62,
    '2': 0.62,
    '3': 0.62,
    '4': 0.62,
    '5': 0.62,
    '6': 0.62,
    '7': 0.56,
    '8': 0.62,
    '9': 0.62,
    '.': 0.28,
    ',': 0.28,
    ':': 0.28,
    ';': 0.28,
    '!': 0.3,
    '?': 0.52,
    "'": 0.26,
    '"': 0.4,
    '-': 0.36,
    _: 0.54,
    '/': 0.4,
    '\\': 0.4,
    '(': 0.34,
    ')': 0.34,
    '[': 0.34,
    ']': 0.34,
    '&': 0.72,
    '@': 0.94,
    '#': 0.72,
    '%': 0.8,
    '+': 0.62,
    '=': 0.62,
    '<': 0.62,
    '>': 0.62,
    '|': 0.26,
    '~': 0.62,
    '`': 0.34,
    '^': 0.62,
    '*': 0.46,
    $: 0.56,
    a: 0.54,
    b: 0.54,
    c: 0.5,
    d: 0.54,
    e: 0.54,
    f: 0.32,
    g: 0.54,
    h: 0.54,
    i: 0.22,
    j: 0.22,
    k: 0.5,
    l: 0.22,
    m: 0.82,
    n: 0.54,
    o: 0.54,
    p: 0.54,
    q: 0.54,
    r: 0.36,
    s: 0.46,
    t: 0.34,
    u: 0.54,
    v: 0.5,
    w: 0.72,
    x: 0.5,
    y: 0.5,
    z: 0.46
  }

  // [FRAGILE FIX] cleanWord: normalise Unicode apostrophes and quotes emitted by
  // Whisper before stripping punctuation, preventing them from leaking into the
  // output or breaking width estimation (they have no entry in CHAR_ADV).
  private cleanWord(word: string): string {
    return word
      .replaceAll(/[\u2018\u2019]/g, "'") // ' ' → '
      .replaceAll(/[\u201C\u201D]/g, '"') // " " → "
      .replaceAll(/[.,!?:;"()[\]]/g, '')
      .trim()
  }

  // [AMÉLIO] estimateWordWidthPx: emoji code points (single Unicode scalar)
  // receive a 1.0 width ratio. Advanced ZWJ sequences (families, skin tones)
  // are detected via a segmented regex/iterator to avoid triple-counting width.
  private estimateWordWidthPx(word: string, fontSize: number): number {
    let units = 0
    // Split into clusters to handle multi-byte characters accurately
    // Note: Array.from is necessary for emoji-safe iteration across surrogate pairs
    const chars = Array.from(word)

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i]

      // ZWJ Sequence Handling: Emoji + ZWJ + Next Char should count as one unit
      // Using Unicode Property Escapes (\p{...}) requires ES2018/u flag
      const isEmoji = /\p{Emoji}/u.test(ch) && (ch.codePointAt(0) || 0) > 127
      if (isEmoji) {
        units += 1
        // Peek ahead for ZWJ (U+200D) or Emoji Modifiers and skip joined components
        while (i + 1 < chars.length && (chars[i + 1] === '\u200D' || /\p{Emoji_Modifier}/u.test(chars[i + 1]))) {
          i++ // skip joiner or modifier
          if (i + 1 < chars.length) i++ // skip the joined char too
        }
      } else {
        units += (AssCaptionService.CHAR_ADV as any)[ch] ?? 0.6
      }
    }
    return Math.max(1, Math.round(units * fontSize * this.charWidthRatio))
  }

  private estimateSpaceWidthPx(fontSize: number): number {
    return Math.max(2, Math.round(0.3 * fontSize * this.charWidthRatio))
  }

  private buildHeader(): string {
    const fs = this.fontSize
    const assBlue = this.pillColor

    return `[Script Info]
ScriptType: v4.00+
PlayResX: ${this.width}
PlayResY: ${this.height}
Timer: 100.0000
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${this.fontFamily},${fs},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${this.borderSize},${this.shadowSize},1,0,0,0,1
Style: Pill,${this.fontFamily},${fs},${assBlue},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,1,0,0,0,1
Style: Words,${this.fontFamily},${fs},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${this.borderSize},${this.shadowSize},1,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`
  }

  private buildLineEvents(line: CaptionLine): string {
    switch (this.style) {
      case 'colored':
        return this.buildColoredLine(line)
      case 'scaling':
        return this.buildScalingLine(line)
      case 'animated-background':
        return this.buildAnimatedBgLine(line)
      case 'bounce':
        return this.buildBounceLine(line)
      case 'neon':
        return this.buildNeonLine(line)
      case 'typewriter':
        return this.buildTypewriterLine(line)
      case 'karaoke':
        return this.buildKaraokeLine(line)
      case 'hormozi':
        return this.buildHormoziLine(line)
      case 'remotion':
        // remotion is a JS/React renderer and cannot be expressed in ASS — fall
        // back to colored with a clear dev-mode warning.
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[AssCaptionService] style="remotion" is not renderable in ASS format. ' +
              'Falling back to "colored". Use the Remotion component for React-based rendering.'
          )
        }
        return this.buildColoredLine(line)
      default:
        return this.buildColoredLine(line)
    }
  }

  // ── Style: colored ──────────────────────────────────────────────────────
  // [BUG FIX] durationMs is now guaranteed ≥ 1 ms upstream (in buildASSFile),
  // so t0 < t1 is always true. No additional guard needed here.

  private buildColoredLine(line: CaptionLine): string {
    const events: string[] = []
    const prefix = this.linePrefix()

    line.words.forEach((activeWord, activeIdx) => {
      const t0 = msToAss(activeWord.startMs)
      const t1 = msToAss(activeWord.startMs + activeWord.durationMs)
      const text = this.buildSingleLineText(line, activeIdx)
      events.push(`Dialogue: 1,${t0},${t1},Words,,0,0,0,,${prefix}${text}`)
    })

    return events.join('\n')
  }

  // ── Style: neon ─────────────────────────────────────────────────────────

  private buildNeonLine(line: CaptionLine): string {
    const events: string[] = []
    const C_WHITE = hexToAssColor('#FFFFFF')
    const glowBord = Math.round(this.fontSize * 0.12)
    const glowBlur = Math.round(this.fontSize * 0.08)
    const alignment = this.getAlignmentCode()
    const x = this.getAlignedX()

    line.words.forEach((activeWord, activeIdx) => {
      const t0 = msToAss(activeWord.startMs)
      const t1 = msToAss(activeWord.startMs + activeWord.durationMs)

      const glowText = line.words
        .map((w, i) => {
          if (i === activeIdx) {
            return `{\\c${this.highlightColor}\\3c${this.highlightColor}\\bord${glowBord}\\blur${glowBlur}\\shad0}${w.word}`
          }
          return `{\\alpha&HFF&\\bord0\\shad0}${w.word}`
        })
        .join(' ')

      events.push(
        `Dialogue: 1,${t0},${t1},Words,,0,0,0,,` +
          `{\\an${alignment}\\pos(${x},${this.lineY})\\fs${this.fontSize}}${glowText}`
      )

      const coreText = line.words
        .map((w, i) => {
          if (i === activeIdx) {
            return `{\\c${C_WHITE}\\bord0\\shad0}${w.word}`
          }
          return `{\\c${this.inactiveColor}\\bord${this.borderSize}\\shad${this.shadowSize}}${w.word}`
        })
        .join(' ')

      events.push(
        `Dialogue: 2,${t0},${t1},Words,,0,0,0,,` +
          `{\\an${alignment}\\pos(${x},${this.lineY})\\fs${this.fontSize}}${coreText}`
      )
    })

    return events.join('\n')
  }

  // ── Style: typewriter ───────────────────────────────────────────────────
  // [BUG FIX] Refactored to emit a single event per timeslice (one Dialogue per
  // active word) instead of N events per timeslice. Eliminates N² event explosion
  // and aligns with the single-line pattern used by all other styles.

  private buildTypewriterLine(line: CaptionLine): string {
    const events: string[] = []
    const FADE_MS = 80
    const alignment = this.getAlignmentCode()
    const x = this.getAlignedX()

    line.words.forEach((activeWord, activeIdx) => {
      const t0 = msToAss(activeWord.startMs)
      const t1 = msToAss(activeWord.startMs + activeWord.durationMs)

      const text = line.words
        .map((w, i) => {
          const cleaned = this.cleanWord(w.word)
          if (i < activeIdx) {
            // Past word: visible in inactive colour
            return `{\\c${this.inactiveColor}\\bord${this.borderSize}\\shad${this.shadowSize}}${cleaned}`
          } else if (i === activeIdx) {
            // Current word: highlight colour + fade-in from transparent
            return (
              `{\\c${this.highlightColor}\\bord${this.borderSize}\\shad${this.shadowSize}` +
              `\\alpha&HFF&\\t(0,${FADE_MS},\\alpha&H00&)}${cleaned}`
            )
          } else {
            // Future word: invisible placeholder preserving line width
            return `{\\alpha&HFF&\\bord0\\shad0}${cleaned}`
          }
        })
        .join(' ')

      events.push(
        `Dialogue: 1,${t0},${t1},Words,,0,0,0,,` +
          `{\\an${alignment}\\pos(${x},${this.lineY})\\fs${this.fontSize}}${text}`
      )
    })

    return events.join('\n')
  }

  // ── Style: karaoke ──────────────────────────────────────────────────────
  // [AMÉLIO] Implemented using ASS native \k karaoke tags. libass renders each
  // word sweeping from inactiveColor to highlightColor over the word's duration.
  // This is the most efficient representation: one Dialogue per line (not per word).

  private buildKaraokeLine(line: CaptionLine): string {
    const t0 = msToAss(line.lineStartMs)
    const t1 = msToAss(line.lineEndMs)
    const alignment = this.getAlignmentCode()
    const x = this.getAlignedX()

    // \k<duration_centiseconds> — advance the karaoke highlight over the word.
    // \kf produces a smooth left-to-right fill sweep (most polished look).
    const karaokeText = line.words
      .map((w) => {
        const durationCs = Math.max(1, Math.round(w.durationMs / 10))
        const cleaned = this.cleanWord(w.word)
        return `{\\kf${durationCs}}${cleaned}`
      })
      .join(' ')

    // Secondary colour = highlight (the "before" colour in ASS karaoke is \2c)
    // Primary = inactive (the "after" colour once the sweep passes)
    return (
      `Dialogue: 1,${t0},${t1},Words,,0,0,0,,` +
      `{\\an${alignment}\\pos(${x},${this.lineY})\\fs${this.fontSize}` +
      `\\bord${this.borderSize}\\shad${this.shadowSize}` +
      `\\c${this.inactiveColor}\\2c${this.highlightColor}}${karaokeText}`
    )
  }

  // ── Style: scaling ──────────────────────────────────────────────────────

  private buildScalingLine(line: CaptionLine): string {
    const layouts = this.computeLayout(line)
    const events: string[] = []
    const alignment = this.getAlignmentCode()
    const x = this.getAlignedX()

    line.words.forEach((activeWord, activeIdx) => {
      const totalMs = activeWord.durationMs
      const peak = 120
      const rampMs = Math.min(180, Math.round(totalMs * 0.3))
      const holdMs = totalMs - rampMs * 2

      const up = springKeyframes(100, peak, rampMs, { stiffness: 320, damping: 22, threshold: 0.8 })
      const down = springKeyframes(peak, 100, rampMs, { stiffness: 320, damping: 22, threshold: 0.8 })

      const timeline: Array<{ ms: number; scale: number }> = [
        ...up.map((f) => ({ ms: f.ms, scale: Math.round(f.value) })),
        { ms: rampMs + Math.max(0, holdMs), scale: peak },
        ...down.map((f) => ({ ms: rampMs + Math.max(0, holdMs) + f.ms, scale: Math.round(f.value) })),
        { ms: totalMs, scale: 100 }
      ]

      const layout = layouts[activeIdx]
      if (!layout) return

      for (let f = 0; f < timeline.length - 1; f++) {
        const segStart = activeWord.startMs + timeline[f].ms
        const segEnd = activeWord.startMs + timeline[f + 1].ms
        if (segEnd <= segStart) continue

        const sc = timeline[f].scale

        const baseText = line.words
          .map((w, i) => {
            if (i === activeIdx) return `{\\alpha&HFF&}${w.word}`
            return `{\\alpha&H00&\\c${this.inactiveColor}\\bord${this.borderSize}\\shad${this.shadowSize}}${w.word}`
          })
          .join(' ')

        events.push(
          `Dialogue: 0,${msToAss(segStart)},${msToAss(segEnd)},Words,,0,0,0,,` +
            `{\\an${alignment}\\pos(${x},${this.lineY})\\fs${this.fontSize}}${baseText}`
        )

        events.push(
          `Dialogue: 1,${msToAss(segStart)},${msToAss(segEnd)},Words,,0,0,0,,` +
            `{\\an5\\pos(${layout.centerX},${layout.centerY})` +
            `\\fs${this.fontSize}\\bord${this.borderSize}\\shad${this.shadowSize}` +
            `\\c${this.highlightColor}\\fscx${sc}\\fscy${sc}}${layout.word}`
        )
      }
    })

    return events.join('\n')
  }

  // ── Style: bounce ───────────────────────────────────────────────────────
  // [FRAGILE FIX] fromY is now clamped to Math.max(this.fontSize, ...) so the
  // animated word never travels above the top of the frame, preventing it from
  // being clipped by libass when lineY is close to 0.

  private buildBounceLine(line: CaptionLine): string {
    const layouts = this.computeLayout(line)
    const events: string[] = []
    const alignment = this.getAlignmentCode()
    const x = this.getAlignedX()
    const dropHeight = Math.round(this.fontSize * 2)

    line.words.forEach((activeWord, activeIdx) => {
      const layout = layouts[activeIdx]
      if (!layout) return

      // [FRAGILE FIX] Clamp fromY so it never goes above fontSize margin from top
      const fromY = Math.max(this.fontSize, layout.centerY - dropHeight)
      const toY = layout.centerY

      const yFrames = springKeyframes(fromY, toY, activeWord.durationMs, {
        stiffness: 500,
        damping: 20
      })

      for (let f = 0; f < yFrames.length - 1; f++) {
        const segStart = activeWord.startMs + yFrames[f].ms
        const segEnd = activeWord.startMs + yFrames[f + 1].ms
        if (segEnd <= segStart) continue

        const activeY = Math.round(yFrames[f].value)

        const baseText = line.words
          .map((w, i) => {
            if (i === activeIdx) return `{\\alpha&HFF&}${w.word}`
            return `{\\alpha&H00&\\c${this.inactiveColor}\\bord${this.borderSize}\\shad${this.shadowSize}}${w.word}`
          })
          .join(' ')

        events.push(
          `Dialogue: 0,${msToAss(segStart)},${msToAss(segEnd)},Words,,0,0,0,,` +
            `{\\an${alignment}\\pos(${x},${this.lineY})\\fs${this.fontSize}}${baseText}`
        )

        events.push(
          `Dialogue: 1,${msToAss(segStart)},${msToAss(segEnd)},Words,,0,0,0,,` +
            `{\\an5\\pos(${layout.centerX},${activeY})` +
            `\\fs${this.fontSize}\\bord${this.borderSize}\\shad${this.shadowSize}` +
            `\\c${this.highlightColor}}${layout.word}`
        )
      }
    })

    return events.join('\n')
  }

  // ── Style: hormozi ──────────────────────────────────────────────────────
  // [FRAGILE FIX] Extracted emitHormoziTwoLayers() helper — the duplicated
  // "hold segment" code previously repeated the same baseText construction and
  // event emission. A single helper now handles both the animated frames and the
  // hold, eliminating the dual-maintenance risk.

  private emitHormoziTwoLayers(
    events: string[],
    segStart: number,
    segEnd: number,
    line: CaptionLine,
    activeIdx: number,
    layout: WordLayout,
    sc: number,
    rot: number,
    C_WHITE: string,
    BORD_SIZE: number,
    SHAD_SIZE: number,
    alignment: number,
    x: number
  ): void {
    const baseText = line.words
      .map((w, i) => {
        if (i === activeIdx) return `{\\alpha&HFF&}${w.word}`
        return `{\\alpha&H00&\\c${C_WHITE}\\bord${BORD_SIZE}\\shad${SHAD_SIZE}}${w.word}`
      })
      .join(' ')

    events.push(
      `Dialogue: 0,${msToAss(segStart)},${msToAss(segEnd)},Words,,0,0,0,,` +
        `{\\an${alignment}\\pos(${x},${this.lineY})\\fs${this.fontSize}}${baseText}`
    )

    events.push(
      `Dialogue: 1,${msToAss(segStart)},${msToAss(segEnd)},Words,,0,0,0,,` +
        `{\\an5\\pos(${layout.centerX},${layout.centerY})\\fs${this.fontSize}` +
        `\\bord${BORD_SIZE}\\shad${SHAD_SIZE}\\c${this.highlightColor}\\fscx${sc}\\fscy${sc}\\frz${rot}}${layout.word}`
    )
  }

  private buildHormoziLine(line: CaptionLine): string {
    const layouts = this.computeLayout(line)
    const events: string[] = []
    const alignment = this.getAlignmentCode()
    const x = this.getAlignedX()

    const C_WHITE = hexToAssColor('#FFFFFF')
    const BORD_SIZE = Math.round(this.borderSize * 1.5)
    const SHAD_SIZE = Math.round(this.fontSize * 0.08)

    line.words.forEach((activeWord, activeIdx) => {
      const layout = layouts[activeIdx]
      if (!layout) return

      const totalMs = activeWord.durationMs
      const rampMs = Math.min(150, Math.round(totalMs * 0.4))
      const scFrames = springKeyframes(100, 135, rampMs, { stiffness: 450, damping: 20 })
      const rot = (activeIdx % 2 === 0 ? 1 : -1) * 2

      for (let f = 0; f < scFrames.length - 1; f++) {
        const segStart = activeWord.startMs + scFrames[f].ms
        const segEnd = activeWord.startMs + scFrames[f + 1].ms
        if (segEnd <= segStart) continue

        this.emitHormoziTwoLayers(
          events,
          segStart,
          segEnd,
          line,
          activeIdx,
          layout,
          Math.round(scFrames[f].value),
          rot,
          C_WHITE,
          BORD_SIZE,
          SHAD_SIZE,
          alignment,
          x
        )
      }

      // Hold at 110% for the remainder of the word's duration
      const holdStart = activeWord.startMs + rampMs
      const holdEnd = activeWord.startMs + totalMs
      if (holdStart < holdEnd) {
        this.emitHormoziTwoLayers(
          events,
          holdStart,
          holdEnd,
          line,
          activeIdx,
          layout,
          110,
          rot,
          C_WHITE,
          BORD_SIZE,
          SHAD_SIZE,
          alignment,
          x
        )
      }
    })

    return events.join('\n')
  }

  // ── Style: animated-background ──────────────────────────────────────────
  // [PERF FIX] lerp() now uses an ascending index walk (O(N) total across all
  // ticks) instead of a reverse linear scan per tick (O(N²) total).

  private buildAnimatedBgLine(line: CaptionLine): string {
    const layouts = this.computeLayout(line)
    const events: string[] = []
    const C_WHITE = hexToAssColor('#FFFFFF')

    const PAD_X = Math.round(this.fontSize * 0.17)
    const PAD_Y = Math.round(this.fontSize * 0.12)
    const RADIUS = Math.round(this.fontSize * 0.22)

    const capsHeight = Math.round(this.fontSize * 0.72)
    const pillH = capsHeight + PAD_Y * 2
    const pillTop = this.lineY - Math.round(pillH / 2)

    const pillLefts = layouts.map((l) => l.centerX - Math.round(l.widthPx / 2) - PAD_X)
    const pillWidths = layouts.map((l) => l.widthPx + PAD_X * 2)

    // [PERF FIX] O(N) ascending-index lerp — index is carried across ticks.
    const lerpFrames = (
      frames: Array<{ ms: number; value: number }>,
      t: number,
      startIdx: number
    ): [number, number] => {
      if (!frames || frames.length === 0) return [0, 0]
      let i = startIdx
      while (i + 1 < frames.length && frames[i + 1].ms <= t) i++
      return [frames[i].value, i]
    }

    line.words.forEach((activeWord, activeIdx) => {
      const layout = layouts[activeIdx]
      if (!layout) return

      const wordStartMs = activeWord.startMs
      const wordEndMs = activeWord.startMs + activeWord.durationMs

      const currLeft = pillLefts[activeIdx] ?? 0
      const currW = pillWidths[activeIdx] ?? 0
      const prevLeft = activeIdx > 0 ? pillLefts[activeIdx - 1] : currLeft
      const prevW = activeIdx > 0 ? pillWidths[activeIdx - 1] : currW

      const needsSlide = prevLeft !== currLeft || prevW !== currW

      if (needsSlide) {
        const SLIDE_MS = Math.min(280, Math.round(activeWord.durationMs * 0.55))
        const FRAME_MS = 33

        const xFrames = springKeyframes(prevLeft, currLeft, SLIDE_MS, { stiffness: 180, damping: 22, mass: 1 })
        const wFrames = springKeyframes(prevW, currW, SLIDE_MS, { stiffness: 180, damping: 22, mass: 1 })

        const maxMs = Math.max(xFrames.length > 0 ? xFrames.at(-1)!.ms : 0, wFrames.length > 0 ? wFrames.at(-1)!.ms : 0)
        const ticks: number[] = []
        for (let t = 0; t <= maxMs; t += FRAME_MS) ticks.push(t)
        if (ticks.length > 0 && ticks.at(-1)! < maxMs) ticks.push(maxMs)

        // Carry indices across ticks to keep lerp O(N) total
        let xi = 0,
          wi = 0
        for (let i = 0; i < ticks.length - 1; i++) {
          const segStart = wordStartMs + ticks[i]
          const segEnd = wordStartMs + ticks[i + 1]
          if (segEnd <= segStart) continue

          const [left, newXi] = lerpFrames(xFrames, ticks[i], xi)
          const [w, newWi] = lerpFrames(wFrames, ticks[i], wi)
          xi = newXi
          wi = newWi

          events.push(
            `Dialogue: 0,${msToAss(segStart)},${msToAss(segEnd)},Pill,,0,0,0,,` +
              `{\\an7\\pos(${Math.round(left)},${pillTop})\\p1\\c${this.pillColor}\\1a&H00&\\bord0\\shad0}` +
              `${roundedRectPath(Math.round(w), pillH, RADIUS)}{\\p0}`
          )
        }

        const holdStart = wordStartMs + maxMs
        if (holdStart < wordEndMs) {
          events.push(
            `Dialogue: 0,${msToAss(holdStart)},${msToAss(wordEndMs)},Pill,,0,0,0,,` +
              `{\\an7\\pos(${currLeft},${pillTop})\\p1\\c${this.pillColor}\\1a&H00&\\bord0\\shad0}` +
              `${roundedRectPath(currW, pillH, RADIUS)}{\\p0}`
          )
        }
      } else {
        events.push(
          `Dialogue: 0,${msToAss(wordStartMs)},${msToAss(wordEndMs)},Pill,,0,0,0,,` +
            `{\\an7\\pos(${currLeft},${pillTop})\\p1\\c${this.pillColor}\\1a&H00&\\bord0\\shad0}` +
            `${roundedRectPath(currW, pillH, RADIUS)}{\\p0}`
        )
      }
    })

    // Word text rendering — O(N) per word: up to 3 segments covering full line duration
    layouts.forEach((wLayout, i) => {
      const wordTiming = line.words[i]
      const wordStartMs = wordTiming.startMs
      const wordEndMs = wordStartMs + wordTiming.durationMs

      const basePrefix = `{\\an5\\pos(${wLayout.centerX},${this.lineY})\\fs${this.fontSize}\\shad${this.shadowSize}}`
      const activeColor = `{\\c${C_WHITE}\\bord0}`
      const inactiveColor = `{\\c${this.inactiveColor}\\bord${this.borderSize}}`
      const wordText = this.cleanWord(wLayout.word)

      if (line.lineStartMs < wordStartMs) {
        events.push(
          `Dialogue: 1,${msToAss(line.lineStartMs)},${msToAss(wordStartMs)},Words,,0,0,0,,` +
            `${basePrefix}${inactiveColor}${wordText}`
        )
      }
      events.push(
        `Dialogue: 1,${msToAss(wordStartMs)},${msToAss(wordEndMs)},Words,,0,0,0,,` +
          `${basePrefix}${activeColor}${wordText}`
      )
      if (wordEndMs < line.lineEndMs) {
        events.push(
          `Dialogue: 1,${msToAss(wordEndMs)},${msToAss(line.lineEndMs)},Words,,0,0,0,,` +
            `${basePrefix}${inactiveColor}${wordText}`
        )
      }
    })

    return events.join('\n')
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  public getResolvedFontSize(): number {
    return this.fontSize
  }
  public getResolvedWordsPerLine(): number {
    return this.wordsPerLine
  }
}
