import * as fs from 'node:fs'
import * as https from 'node:https'
import * as path from 'node:path'
import type { AnimationService } from './index'

/**
 * Implementation using the Grok Imagine API (xAI) for Image-to-Video.
 */
export class GrokAnimationService implements AnimationService {
  private readonly apiKey: string | undefined

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.XAI_API_KEY
  }

  /**
   * Animates a single image using Grok's image-to-video capabilities.
   */
  async animateImage(
    imagePath: string,
    prompt: string,
    duration: number,
    outputPath: string,
    aspectRatio?: string
  ): Promise<string> {
    console.log(`[GrokAnimation] Animating image (${duration}s): ${prompt.slice(0, 30)}...`)

    if (!this.apiKey) {
      console.warn('[GrokAnimation] XAI_API_KEY is missing. Skipping actual animation (Mock mode).')
      return this.mockAnimation(outputPath)
    }

    try {
      const ext = path.extname(imagePath).toLowerCase()
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg'
      const base64Image = fs.readFileSync(imagePath, { encoding: 'base64' })

      const requestData = JSON.stringify({
        model: 'grok-imagine-video',
        image_url: `data:${mimeType};base64,${base64Image}`,
        prompt,
        duration
      })

      return new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: 'api.x.ai',
            path: '/v1/videos/generations',
            method: 'POST',
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
                if (res.statusCode === 404) {
                  console.warn(`[GrokAnimation] API endpoint not found (404). Falling back to mock video.`)
                  resolve(this.mockAnimation(outputPath))
                  return
                }
                reject(new Error(`Grok API Error (${res.statusCode}): ${body}`))
                return
              }

              const data = JSON.parse(body)
              const videoId = data.id || data.request_id
              // Polling for completion
              try {
                const videoUrl = await this.pollForVideo(videoId)
                await this.downloadVideo(videoUrl, outputPath)
                resolve(outputPath)
              } catch (pollError) {
                reject(pollError)
              }
            })
          }
        )

        req.on('error', reject)
        req.write(requestData)
        req.end()
      })
    } catch (error) {
      console.error(`[GrokAnimation] Pipeline Error:`, error)
      throw error
    }
  }

  /**
   * Polls the xAI API for the video status until ready.
   */
  private async pollForVideo(videoId: string): Promise<string> {
    let attempts = 0
    return new Promise((resolve, reject) => {
      const checkStatus = () => {
        attempts++
        const req = https.request(
          {
            hostname: 'api.x.ai',
            path: `/v1/videos/${videoId}`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${this.apiKey}`
            }
          },
          (res) => {
            let body = ''
            res.on('data', (chunk) => (body += chunk))
            res.on('end', () => {
              if (res.statusCode !== 200 && res.statusCode !== 202) {
                console.error(`[GrokAnimation] Poll error (${res.statusCode}): ${body}`)
                if (attempts < 20) {
                  setTimeout(checkStatus, 5000)
                } else {
                  reject(new Error(`Failed to poll video status after ${attempts} attempts`))
                }
                return
              }

              try {
                const data = JSON.parse(body)
                const status = data.status
                const videoUrl = data.video?.url || data.video_url || data.url

                if (videoUrl) {
                  console.log(`[GrokAnimation] Video ready (HTTP ${res.statusCode})`)
                  resolve(videoUrl)
                } else if (status === 'pending' || status === 'processing' || res.statusCode === 202) {
                  console.log(
                    `[GrokAnimation] Polling status (Attempt ${attempts}): ${status || 'pending'} (HTTP ${res.statusCode})`
                  )
                  setTimeout(checkStatus, 5000)
                } else if (status === 'failed' || status === 'error') {
                  reject(new Error(`Video generation failed: ${data.error || 'Unknown error'}`))
                } else {
                  console.log(`[GrokAnimation] Unknown polling state (HTTP ${res.statusCode}). Body: ${body}`)
                  setTimeout(checkStatus, 5000)
                }
              } catch (error) {
                console.error(`[GrokAnimation] JSON Parse error during polling:`, error)
                setTimeout(checkStatus, 5000)
              }
            })
          }
        )
        req.on('error', (err) => {
          console.error(`[GrokAnimation] Network error during polling:`, err)
          setTimeout(checkStatus, 5000)
        })
        req.end()
      }
      checkStatus()
    })
  }

  /**
   * Downloads the final video file.
   */
  private async downloadVideo(url: string, outputPath: string, redirects: number = 0): Promise<void> {
    if (redirects > 5) throw new Error('Too many redirects')
    return new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return this.downloadVideo(res.headers.location, outputPath, redirects + 1)
              .then(resolve)
              .catch(reject)
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Download failed with status ${res.statusCode}`))
            return
          }

          const file = fs.createWriteStream(outputPath)
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

  /**
   * Creates an empty file to represent a mock animation for testing.
   */
  private async mockAnimation(outputPath: string): Promise<string> {
    fs.writeFileSync(outputPath, 'MOCK_VIDEO_DATA')
    return outputPath
  }
}
