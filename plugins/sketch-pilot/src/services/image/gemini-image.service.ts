import * as fs from 'node:fs'
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai'
import sharp from 'sharp'
import type { ImageService, ImageServiceConfig } from './index'

/**
 * Implementation using Google Gemini Image Generation.
 */
export class GeminiImageService implements ImageService {
  private client: GoogleGenAI
  private modelId: string = 'gemini-2.5-flash-image' // Correct model for multimodal image generation
  private styleSuffix: string
  private systemPrompt: string
  private defaultQuality: 'ultra-low' | 'low' | 'medium' | 'high'

  constructor(config: ImageServiceConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey })
    this.styleSuffix = config.styleSuffix || ''
    this.systemPrompt = config.systemPrompt || ''
    this.defaultQuality = config.defaultQuality || 'medium'
  }

  /**
   * Maximum internal retries for NO_IMAGE responses before giving up.
   */
  private static readonly NO_IMAGE_MAX_RETRIES = 7
  private static readonly NO_IMAGE_BASE_DELAY_MS = 10000

  async generateImage(
    prompt: string,
    filename: string,
    options: {
      aspectRatio?: string
      removeBackground?: boolean
      skipTrim?: boolean
      referenceImages?: string[]
      systemInstruction?: string
      quality?: 'ultra-low' | 'low' | 'medium' | 'high'
      smartUpscale?: boolean
      format?: 'png' | 'webp'
      seed?: number
    } = {}
  ): Promise<string> {
    const baseImages = options.referenceImages || []
    const bgConstraint = options.removeBackground
      ? 'Isolated on a solid pure #FFFFFF white background. No shadows, no gradients.'
      : ''
    const originalPrompt = `${prompt} ${bgConstraint} ${this.styleSuffix}`.trim()
    const dynamicSystemInstruction = options.systemInstruction || this.systemPrompt
    const geminiAspectRatio = options.aspectRatio || '16:9'
    const fileFormat = options.format || 'png'
    const mimeType = fileFormat === 'webp' ? 'image/webp' : 'image/png'

    for (let attempt = 0; attempt <= GeminiImageService.NO_IMAGE_MAX_RETRIES; attempt++) {
      // On retries, progressively simplify the prompt to avoid content policy conflicts
      const currentPrompt = attempt === 0 ? originalPrompt : this.simplifyPrompt(originalPrompt, attempt)

      const contents: any[] = []

      if (baseImages.length > 0) {
        contents.push({
          text: 'REFERENCE IMAGES: Use the following images as the ABSOLUTE SOURCE OF TRUTH for character identity, clothing, and artistic style. All generated scenes must remain 100% consistent with these models.'
        })
        baseImages.forEach((raw) => {
          // Safety check: Strip Data URI prefix if present
          const data = raw.replace(/^data:image\/[a-z]+;base64,/, '')
          let refMimeType = 'image/jpeg'
          if (data.startsWith('iVBORw0KGgo')) refMimeType = 'image/png'
          else if (data.startsWith('UklGR')) refMimeType = 'image/webp'
          contents.push({ inlineData: { mimeType: refMimeType, data } })
        })
      }

      contents.push({ text: currentPrompt })

      try {
        if (attempt === 0) {
          console.log(`[GeminiImage] Generating image with model ${this.modelId}...`)
          console.log(`[GeminiImage] Prompt: ${currentPrompt}`)
          console.log(
            `[GeminiImage] Aspect Ratio: ${geminiAspectRatio}, Format: ${fileFormat}, Quality: ${options.quality || this.defaultQuality}`
          )
        } else {
          console.log(
            `[GeminiImage] Retry ${attempt}/${GeminiImageService.NO_IMAGE_MAX_RETRIES} with simplified prompt...`
          )
          console.log(`[GeminiImage] Simplified Prompt: ${currentPrompt}`)
        }

        // Map high-level quality to numeric values if needed, otherwise rely on model default
        // The current SDK doesn't have a direct 'quality' field in generateContent config
        // but some models use imageConfig for specific controls.

        const response = await this.client.models.generateContent({
          model: this.modelId,
          contents,
          config: {
            responseModalities: ['IMAGE'],
            systemInstruction: attempt < 2 ? dynamicSystemInstruction : undefined, // Drop system instruction on last retries
            imageConfig: {
              aspectRatio: geminiAspectRatio
            },
            safetySettings: [
              { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
            ]
          } as any
        })

        const finishReason = response.candidates?.[0]?.finishReason
        console.log(`[GeminiImage] Raw response received. Candidates: ${response.candidates?.length || 0}`)
        if (finishReason) {
          console.log(`[GeminiImage] Candidate 0 finish reason: ${finishReason}`)
        }

        // Extract image data if present
        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData?.data) {
              const buffer = Buffer.from(part.inlineData.data, 'base64')

              // Post-process: resize to exact aspect ratio dimensions
              const targetRes = this.getResolution(geminiAspectRatio)
              const [width, height] = targetRes.split('x').map(Number)

              console.log(`[GeminiImage] Resizing generated image to ${targetRes}...`)
              const finalBuffer = await sharp(buffer)
                .resize(width, height, {
                  fit: 'cover',
                  position: 'center'
                })
                .toBuffer()

              fs.writeFileSync(filename, finalBuffer)
              console.log(
                `[GeminiImage] ✅ Saved image to ${filename}${attempt > 0 ? ` (after ${attempt} retries)` : ''}`
              )
              return filename
            }
          }
        }

        // If we got here, no image data was returned
        if (attempt < GeminiImageService.NO_IMAGE_MAX_RETRIES) {
          const delay = GeminiImageService.NO_IMAGE_BASE_DELAY_MS * 2 ** attempt
          console.warn(
            `[GeminiImage] ⚠ NO_IMAGE (finish: ${finishReason}). Retrying in ${(delay / 1000).toFixed(1)}s with simplified prompt...`
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
        } else {
          console.warn(
            `[GeminiImage] ❌ NO_IMAGE after ${GeminiImageService.NO_IMAGE_MAX_RETRIES} retries. Returning empty string.`
          )
        }
      } catch (error) {
        // Real errors (network, auth, etc.) should not be retried here — let the outer queue handle them
        const errMsg = error instanceof Error ? error.message.slice(0, 300) : 'Unknown error'
        console.error(`[GeminiImage] Error generating image: ${errMsg}`)
        throw error
      }
    }

    return ''
  }

  /**
   * Progressively simplify a prompt to resolve NO_IMAGE responses.
   *
   * Level 1: Remove quoted text labels (e.g., 'Comfort Zone', "dollar")
   *          that conflict with "no text" instructions
   * Level 2: Also strip parenthetical descriptions, duplicate character descriptions,
   *          and shorten the prompt significantly
   * Level 3: Reduce to bare essentials
   */
  private simplifyPrompt(prompt: string, level: number): string {
    let simplified = prompt

    if (level >= 1) {
      // Remove single-quoted and double-quoted text labels
      simplified = simplified.replaceAll(/'[^']{1,50}'/g, '')
      simplified = simplified.replaceAll(/"[^"]{1,50}"/g, '')
      // Remove text/speech/thought bubble references

      // Keep only first parenthetical character description
      let firstParen = true
      simplified = simplified.replaceAll(/\([^)]{20,}\)/g, (match) => {
        if (firstParen) {
          firstParen = false
          return match
        }
        return ''
      })
    }

    if (level >= 2) {
      // Remove ALL parenthetical descriptions
      simplified = simplified.replaceAll(/\([^)]*\)/g, '')
    }

    if (level >= 3) {
      // Bare essentials: first 150 chars + quality tags
      const qualityTags =
        'consistent outfits, flat lighting, medium outlines, full frame edge-to-edge, pure solid flat background, no text, no speech bubbles, no vignette, no rounded corners, no borders, exactly 2 arms, exactly 2 legs, normal human anatomy, NO EXTRA LIMBS'
      const core = simplified.slice(0, 150).replace(/,\s*$/, '')
      simplified = `${core}, ${qualityTags}.`
    }

    // Collapse artifacts
    return simplified
      .replaceAll(/,\s*,/g, ',')
      .replaceAll(/\s{2,}/g, ' ')
      .trim()
  }

  private getResolution(aspectRatio: string): string {
    switch (aspectRatio) {
      case '9:16':
        return '720x1280'
      case '1:1':
        return '1080x1080'
      case '16:9':
      default:
        return '1280x720'
    }
  }
}
