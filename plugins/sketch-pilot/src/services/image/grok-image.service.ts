import * as fs from 'node:fs'
import * as https from 'node:https'
import sharp from 'sharp'
import type { ImageService, ImageServiceConfig } from './index'

/**
 * Implementation using xAI Grok (grok-imagine) for Image Generation.
 */
export class GrokImageService implements ImageService {
  private readonly apiKey: string
  private styleSuffix: string
  private defaultQuality: 'ultra-low' | 'low' | 'medium' | 'high'

  constructor(config: ImageServiceConfig) {
    this.apiKey = config.apiKey || process.env.XAI_API_KEY || ''
    this.styleSuffix = config.styleSuffix || ''
    this.defaultQuality = config.defaultQuality || 'high'
  }

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
    } = {}
  ): Promise<string> {
    console.log(`[GrokImage] Generating image: ${prompt.slice(0, 30)}...`)

    if (!this.apiKey) {
      throw new Error('[GrokImage] XAI_API_KEY is missing.')
    }

    try {
      const bgConstraint = options.removeBackground ? 'Isolated on a solid pure white background. No shadows.' : ''
      const fullPrompt = `${prompt} ${bgConstraint} ${this.styleSuffix}`

      const requestData = JSON.stringify({
        model: 'grok-imagine-image',
        prompt: fullPrompt,
        aspect_ratio: options.aspectRatio || '16:9',
        response_format: 'b64_json'
      })

      return new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: 'api.x.ai',
            path: '/v1/images/generations',
            method: 'POST',
            timeout: 60000, // ← 60s timeout for image generation (can be slow)
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`
            }
          },
          (res) => {
            let body = ''
            res.on('data', (chunk) => (body += chunk))
            res.on('end', async () => {
              if (res.statusCode !== 200 && res.statusCode !== 201) {
                reject(new Error(`Grok Image API Error (${res.statusCode}): ${body}`))
                return
              }

              const data = JSON.parse(body)
              const b64Data = data.data?.[0]?.b64_json

              if (!b64Data) {
                reject(new Error('No image data in Grok response'))
                return
              }

              try {
                const buffer = Buffer.from(b64Data, 'base64')

                // Post-process: resize to exact aspect ratio dimensions
                const targetRes = this.getResolution(options.aspectRatio || '16:9')
                const [width, height] = targetRes.split('x').map(Number)

                console.log(`[GrokImage] Resizing generated image to ${targetRes}...`)
                const finalBuffer = await sharp(buffer)
                  .resize(width, height, {
                    fit: 'cover',
                    position: 'center'
                  })
                  .toBuffer()

                fs.writeFileSync(filename, finalBuffer)
                console.log(`[GrokImage] Saved image to ${filename}`)
                resolve(filename)
              } catch (error) {
                reject(error)
              }
            })
          }
        )

        req.on('timeout', () => {
          req.destroy()
          reject(new Error('Grok API request timeout after 60s'))
        })

        req.on('error', reject)
        req.write(requestData)
        req.end()
      })
    } catch (error) {
      console.error(`[GrokImage] Pipeline Error:`, error)
      throw error
    }
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
