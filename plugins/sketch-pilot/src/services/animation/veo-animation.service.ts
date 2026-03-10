import * as fs from 'node:fs'
import * as https from 'node:https'
import * as path from 'node:path'
import { GoogleGenAI } from '@google/genai'
import type { AnimationService } from './index'

/**
 * Implementation using Google's Veo 3.1 API for Image-to-Video.
 */
export class VeoAnimationService implements AnimationService {
  private readonly client: any
  private readonly modelId = 'veo-3.1-fast-generate-preview'

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GOOGLE_API_KEY
    if (!key) throw new Error('GOOGLE_API_KEY is required for VeoAnimationService')
    this.client = new GoogleGenAI({ apiKey: key })
  }

  async animateImage(
    imagePath: string,
    prompt: string,
    duration: number,
    outputPath: string,
    aspectRatio?: string
  ): Promise<string> {
    console.log(`[VeoAnimation] Generating video (${duration}s) for image: ${path.basename(imagePath)}`)

    const base64Image = fs.readFileSync(imagePath, { encoding: 'base64' })
    const ext = path.extname(imagePath).toLowerCase()
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg'

    try {
      // Start the async operation
      let operation = await this.client.models.generateVideos({
        model: this.modelId,
        prompt,
        image: {
          imageBytes: base64Image,
          mimeType
        },
        config: {
          // Veo API requires duration between 4-8 seconds
          durationSeconds: Math.max(4, Math.min(8, duration)),
          resolution: '720p',
          aspectRatio: aspectRatio || '16:9'
        }
      })

      console.log(`[VeoAnimation] Operation started: ${operation.name}`)

      // Poll until completion
      while (!operation.done) {
        console.log(`[VeoAnimation] Waiting for video generation...`)
        await new Promise((resolve) => setTimeout(resolve, 5000))

        // Refresh operation status
        operation = await this.client.operations.getVideosOperation({
          operation
        })
      }

      if (operation.response && operation.response.generatedVideos && operation.response.generatedVideos.length > 0) {
        const videoData = operation.response.generatedVideos[0]
        console.log(`[VeoAnimation] Video data found. Downloading...`)

        try {
          await this.client.files.download({
            file: videoData.video,
            downloadPath: outputPath
          })
          console.log(`[VeoAnimation] Video saved to ${outputPath}`)
          return outputPath
        } catch (downloadError) {
          console.error(`[VeoAnimation] SDK download failed, trying fallback...`, downloadError)
          if (videoData.video && videoData.video.uri) {
            await this.downloadVideo(videoData.video.uri, outputPath)
            return outputPath
          }
          throw downloadError
        }
      }

      throw new Error(`Veo generation failed: ${JSON.stringify(operation.error || 'Unknown error')}`)
    } catch (error) {
      console.error(`[VeoAnimation] Error:`, error)
      throw error
    }
  }

  private async downloadVideo(url: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(outputPath)
      https
        .get(url, (res) => {
          res.pipe(file)
          file.on('finish', () => {
            file.close()
            resolve()
          })
        })
        .on('error', (err) => {
          fs.unlink(outputPath, () => {})
          reject(err)
        })
    })
  }
}
