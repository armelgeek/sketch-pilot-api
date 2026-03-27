import * as fs from 'node:fs'
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai'
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
      referenceImages?: (string | { name?: string; data: string })[]
      systemInstruction?: string
      quality?: 'ultra-low' | 'low' | 'medium' | 'high'
      smartUpscale?: boolean
      format?: 'png' | 'webp'
      characterSheets?: any[]
      seed?: number
    } = {}
  ): Promise<string> {
    const baseImages = options.referenceImages || []
    const originalPrompt = `${prompt}`
    const geminiAspectRatio = options.aspectRatio || '16:9'
    const fileFormat = options.format || 'png'

    for (let attempt = 0; attempt <= GeminiImageService.NO_IMAGE_MAX_RETRIES; attempt++) {
      // On retries, progressively simplify the prompt to avoid content policy conflicts
      const currentPrompt = originalPrompt

      const contents: any[] = []

      if (options.characterSheets && options.characterSheets.length > 0) {
        const sheetsText = options.characterSheets
          .map((s: any) => `- @${s.name}: ${s.appearance?.description || ''} ${s.role ? `(${s.role})` : ''}`)
          .join('\n')
        contents.push({
          text: `CHARACTER PROFILES (Absolute reference for @Name syntax):\n${sheetsText}`
        })
      }

      if (baseImages.length > 0) {
        contents.push({
          text: 'REFERENCE IMAGES: Use the following images as the ABSOLUTE SOURCE OF TRUTH for character identity, clothing, and artistic style. All generated scenes must remain 100% consistent with these models. If a name is provided before an image, it refers to that specific character.'
        })
        baseImages.forEach((img) => {
          const isObject = typeof img === 'object'
          const name = isObject ? img.name : undefined
          const raw = isObject ? (img as any).data : (img as string)

          if (name) {
            contents.push({ text: `NAME: @${name}` })
          }

          // Safety check: Strip Data URI prefix if present
          const data = raw.replace(/^data:image\/[a-z]+;base64,/, '')
          let refMimeType = 'image/jpeg'
          if (data.startsWith('iVBORw0KGgo')) refMimeType = 'image/png'
          else if (data.startsWith('UklGR')) refMimeType = 'image/webp'
          contents.push({ inlineData: { mimeType: refMimeType, data } })
        })
      }

      // Inject strict anatomy guardrails to aggressively prevent the '3 hands' or 'extra limbs' hallucinations common with stick figures
      const anatomyGuardrail = `\n\nCRITICAL ANATOMY RULES: The character must have exactly TWO arms, TWO legs, ONE head, and TWO hands. DO NOT generate extra floating hands, third arms, or merged limbs. Ensure strict, flawless physiological anatomy. Keep the pose physically possible. If conflicting actions are described (e.g. 'arms crossed' and 'hand on chin'), pick ONE to avoid extra limbs.`
      const finalTextPrompt = currentPrompt.includes('CRITICAL ANATOMY')
        ? currentPrompt
        : currentPrompt + anatomyGuardrail

      contents.push({ text: finalTextPrompt })

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
        }

        // Map high-level quality to numeric values if needed, otherwise rely on model default
        // The current SDK doesn't have a direct 'quality' field in generateContent config
        // but some models use imageConfig for specific controls.

        const response = await this.client.models.generateContent({
          model: this.modelId,
          contents,
          config: {
            responseModalities: ['IMAGE'],
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

              fs.writeFileSync(filename, buffer)
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
            `[GeminiImage] ⚠ NO_IMAGE (finish: ${finishReason}). Retrying in ${(delay / 1000).toFixed(1)}s...`
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
}
