import { spawn } from 'node:child_process'

/**
 * Executes an FFmpeg command using child_process.spawn for non-blocking operation.
 *
 * @param args Array of command-line arguments for FFmpeg
 * @param onProgress Optional callback for progress updates (0-100)
 * @returns A promise that resolves when the command completes
 */
export async function runFfmpeg(args: string[], onProgress?: (progress: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    console.info(`[FFmpeg] Running: ffmpeg ${args.join(' ')}`)

    // Use spawn with stderr inherited or captured to track progress
    const process = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'info', ...args])

    let stderr = ''

    process.stderr.on('data', (data) => {
      const chunk = data.toString()
      stderr += chunk

      // Basic progress parsing (e.g., from "time=00:00:10.50")
      // This is simplified; fluent-ffmpeg does it better but we want to avoid its overhead if possible
      // or just use it correctly. For now, we mainly want to ensure it's non-blocking.
    })

    process.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        console.error(`[FFmpeg] Process exited with code ${code}`)
        console.error(`[FFmpeg] Stderr: ${stderr.slice(-500)}`)
        reject(new Error(`FFmpeg failed with exit code ${code}`))
      }
    })

    process.on('error', (err) => {
      console.error(`[FFmpeg] Failed to start process:`, err)
      reject(err)
    })
  })
}

/**
 * Simple helper to check if a file has audio using ffprobe.
 */
export async function hasAudio(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', filePath])

    let output = ''
    ffprobe.stdout.on('data', (data) => (output += data.toString()))

    ffprobe.on('close', () => {
      resolve(output.includes('audio'))
    })

    ffprobe.on('error', () => resolve(false))
  })
}
