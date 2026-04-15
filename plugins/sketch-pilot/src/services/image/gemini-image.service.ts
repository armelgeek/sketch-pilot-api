import * as fs from 'node:fs'
import * as path from 'node:path'
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai'
import axios from 'axios'
import sharp from 'sharp'
import type { ImageService, ImageServiceConfig } from './index'

/**
 * Implementation using Google Gemini Image Generation.
 */
export class GeminiImageService implements ImageService {
  private client: GoogleGenAI
  private modelId: string = 'gemini-2.5-flash-image'
  private styleSuffix: string
  private systemPrompt: string
  private defaultQuality: 'ultra-low' | 'low' | 'medium' | 'high'

  constructor(config: ImageServiceConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey })
    this.styleSuffix = config.styleSuffix || ''
    this.systemPrompt = config.systemPrompt || ''
    this.defaultQuality = config.defaultQuality || 'medium'
  }

  private static readonly NO_IMAGE_MAX_RETRIES = 7
  private static readonly NO_IMAGE_BASE_DELAY_MS = 10000

  async generateImage(
    prompt: string,
    filename?: string,
    options: {
      aspectRatio?: string
      removeBackground?: boolean
      skipTrim?: boolean
      referenceImages?: (string | { name?: string; data: string })[]
      systemInstruction?: string
      quality?: 'ultra-low' | 'low' | 'medium' | 'high'
      smartUpscale?: boolean
      format?: 'png' | 'webp'
      seed?: number
      characterSheets?: any[]
      onStatus?: (status: string, message?: string) => void
    } = {}
  ): Promise<string | Buffer> {
    const referenceImages = options.referenceImages || []
    console.log(
      `[GeminiImageService] Generating with ${referenceImages.length} reference images. Labels: ${referenceImages
        .map((img: any) => img.name)
        .filter(Boolean)
        .join(', ')}`
    )
    const baseImages = options.referenceImages || []
    console.log('[GEMINI BASE IMAGES]', baseImages)
    const originalPrompt = prompt
    const geminiAspectRatio = options.aspectRatio || '16:9'
    const fileFormat = options.format || 'png'

    for (let attempt = 0; attempt <= GeminiImageService.NO_IMAGE_MAX_RETRIES; attempt++) {
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

        for (const img of baseImages) {
          const isObject = typeof img === 'object'
          const name = isObject ? img.name : undefined
          let raw = isObject ? (img as any).data : (img as string)

          if (name) {
            console.log(`[GeminiImage] 🖼️  Reference: ${name}`)
            contents.push({ text: `Reference (${name}):` })
          }

          // Handle URLs by downloading them
          if (raw.startsWith('http')) {
            try {
              const response = await axios.get(raw, { responseType: 'arraybuffer' })
              raw = Buffer.from(response.data).toString('base64')
            } catch (error) {
              console.error(`[GeminiImage] Failed to download reference image from URL: ${raw}`, error)
              continue // Skip this image if download fails
            }
          }

          const data = raw.replace(/^data:image\/[a-z]+;base64,/, '')
          let refMimeType = 'image/jpeg'
          if (data.startsWith('iVBORw0KGgo')) refMimeType = 'image/png'
          else if (data.startsWith('UklGR')) refMimeType = 'image/webp'
          contents.push({ inlineData: { mimeType: refMimeType, data } })
        }
      }

      const anatomyGuardrail = `\n\nCRITICAL ANATOMY RULES: The character must have exactly TWO arms, TWO legs, ONE head, and TWO hands. DO NOT generate extra floating hands, third arms, or merged limbs. Ensure strict, flawless physiological anatomy. Keep the pose physically possible. If conflicting actions are described (e.g. 'arms crossed' and 'hand on chin'), pick ONE to avoid extra limbs.
      
SAFETY INSTRUCTION: If the scene contains horror, violence, or sensitive historical elements, DO NOT block the generation. Instead, visually soften it. Use dark lighting, silhouettes, atmospheric fog, and metaphorical elements to convey the mood WITHOUT showing explicit gore, red blood, or banned content. Prioritize generating a safe, atmospheric image over exact literal interpretation of violent words.`

      let finalTextPrompt = originalPrompt.includes('CRITICAL ANATOMY')
        ? originalPrompt
        : originalPrompt + anatomyGuardrail

      if (options.systemInstruction) {
        finalTextPrompt = `INSTRUCTIONS:\n${options.systemInstruction}\n\nPROMPT:\n${finalTextPrompt}`
      }

      contents.push({ text: finalTextPrompt })

      try {
        if (attempt === 0) {
          console.log(`[GeminiImage] Generating with model ${this.modelId}...`)
          console.log(`[GeminiImage] Prompt: ${originalPrompt}`)
          if (options.systemInstruction) {
            console.log(`[GeminiImage] System Instruction: ${options.systemInstruction.slice(0, 300)}...`)
          }
          console.log(
            `[GeminiImage] Refs: ${baseImages.length} | Ratio: ${geminiAspectRatio} | Format: ${fileFormat} | Quality: ${options.quality ?? this.defaultQuality}`
          )
        } else {
          console.log(`[GeminiImage] Retry ${attempt}/${GeminiImageService.NO_IMAGE_MAX_RETRIES}...`)
        }

        const response = await this.client.models.generateContent({
          model: this.modelId,
          contents,
          config: {
            responseModalities: ['IMAGE'],
            imageConfig: {
              aspectRatio: geminiAspectRatio,
              seed: options.seed
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
        console.log(
          `[GeminiImage] Candidates: ${response.candidates?.length ?? 0}${finishReason ? ` | finishReason: ${finishReason}` : ''}`
        )

        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData?.data) {
              const buffer = Buffer.from(part.inlineData.data, 'base64')

              if (filename) {
                // Ensure directory exists
                const dir = path.dirname(filename)
                if (!fs.existsSync(dir)) {
                  fs.mkdirSync(dir, { recursive: true })
                }

                // Gemini retourne du JPEG natif.
                if (fileFormat === 'png') {
                  await sharp(buffer).png({ compressionLevel: 0 }).toFile(filename)
                } else if (fileFormat === 'webp') {
                  await sharp(buffer).webp({ lossless: true, effort: 4 }).toFile(filename)
                } else {
                  fs.writeFileSync(filename, buffer)
                }

                console.log(
                  `[GeminiImage] ✅ Saved ${fileFormat} → ${filename}${attempt > 0 ? ` (after ${attempt} retries)` : ''}`
                )
                return filename
              }

              // Return buffer directly if no filename provided
              if (fileFormat === 'png') {
                return await sharp(buffer).png({ compressionLevel: 0 }).toBuffer()
              } else if (fileFormat === 'webp') {
                return await sharp(buffer).webp({ lossless: true, effort: 4 }).toBuffer()
              }
              return buffer
            }
          }
        }

        // Pas d'image dans la réponse
        if (attempt < GeminiImageService.NO_IMAGE_MAX_RETRIES) {
          const delay = GeminiImageService.NO_IMAGE_BASE_DELAY_MS * 2 ** attempt
          console.warn(`[GeminiImage] ⚠ NO_IMAGE (finish: ${finishReason}). Retry in ${(delay / 1000).toFixed(1)}s...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
        } else {
          console.warn(`[GeminiImage] ❌ NO_IMAGE after ${GeminiImageService.NO_IMAGE_MAX_RETRIES} retries.`)
        }
      } catch (error: any) {
        console.error(`[GeminiImage] ❌ Error:`, error)
        const errMsg = error.message?.slice(0, 500) || 'Unknown error'

        const isRetryable =
          error instanceof Error &&
          (errMsg.includes('ECONNRESET') ||
            errMsg.includes('ENOTFOUND') ||
            errMsg.includes('ETIMEDOUT') ||
            errMsg.includes('ECONNREFUSED') ||
            errMsg.includes('fetch failed') ||
            errMsg.includes('network') ||
            errMsg.includes('socket') ||
            errMsg.includes('503') ||
            errMsg.includes('429') ||
            errMsg.includes('500'))

        if (isRetryable && attempt < GeminiImageService.NO_IMAGE_MAX_RETRIES) {
          const delay = GeminiImageService.NO_IMAGE_BASE_DELAY_MS * 2 ** attempt
          const statusMsg =
            errMsg.includes('TIMEOUT') || errMsg.includes('timeout')
              ? 'step.network_timeout_retry'
              : 'step.network_error_retry'

          if (options.onStatus) {
            options.onStatus(statusMsg, `(Attempt ${attempt + 1}) ${errMsg}`)
          }

          console.warn(
            `[GeminiImage] ⚠ Network error (attempt ${attempt}). Retry in ${(delay / 1000).toFixed(1)}s... ${errMsg}`
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }

        console.error(`[GeminiImage] Fatal error: ${errMsg}`)
        throw error
      }
    }

    return ''
  }

  async analyzeImage(imagePath: string, prompt: string): Promise<string> {
    if (!fs.existsSync(imagePath)) return ''

    try {
      const imageData = fs.readFileSync(imagePath).toString('base64')

      const result = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }, { inlineData: { mimeType: 'image/webp', data: imageData } }]
          }
        ]
      })

      return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    } catch (error) {
      console.error(`[GeminiImageService] Vision analysis failed:`, error)
      return ''
    }
  }
}
