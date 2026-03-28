import * as fs from 'node:fs'
import sharp from 'sharp'
import type { ImageService, ImageServiceConfig } from './index'

/**
 * Demo Image Service that generates plain white images with optional labels.
 * Used for rapid testing of the video generation pipeline without API costs.
 */
export class DemoImageService implements ImageService {
  constructor(config: ImageServiceConfig) {
    console.log(`[DemoImage] Initialized mock service.`)
  }

  async generateImage(
    prompt: string,
    filename: string,
    options: {
      aspectRatio?: string
      format?: 'png' | 'webp'
    } = {}
  ): Promise<string> {
    const aspectRatio = options.aspectRatio || '16:9'
    const format = options.format || 'png'

    // Determine dimensions based on aspect ratio
    let width = 1280
    let height = 720

    if (aspectRatio === '9:16') {
      width = 720
      height = 1280
    } else if (aspectRatio === '1:1') {
      width = 1024
      height = 1024
    }

    console.log(`[DemoImage] Generating blank ${aspectRatio} image (${width}x${height})...`)

    try {
      // Create a plain white background
      const image = sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      })

      // Add a simple border and text label describing the scene if possible
      // For now, we'll just generate the white background to ensure speed and zero failure.

      const buffer = format === 'webp' ? await image.webp().toBuffer() : await image.png().toBuffer()

      fs.writeFileSync(filename, buffer)
      console.log(`[DemoImage] ✅ Mock image saved to ${filename}`)
      return filename
    } catch (error) {
      console.error(`[DemoImage] Error generating mock image:`, error)
      throw error
    }
  }
}
