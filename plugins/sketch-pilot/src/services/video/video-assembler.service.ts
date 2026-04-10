import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import axios from 'axios'
import ffmpeg from 'fluent-ffmpeg'
import { AssetsConfigRepository } from '@/infrastructure/repositories/assets-config.repository'
import { AmbientService } from '../audio/ambient.service'
import { MusicService } from '../audio/music.service'
import { SFXService } from '../audio/sfx.service'
import type { CameraAction, CompleteVideoScript, VideoGenerationOptions } from '../../types/video-script.types'
import type { WordTiming } from '../audio'
import { AssCaptionService } from './ass-caption.service'

const assetsConfigRepository = new AssetsConfigRepository()

const SCENE_PADDING_SECONDS = 0.2

/**
 * Internal FPS used by zoompan for sub-frame interpolation.
 * Higher value = smoother motion. FFmpeg resamples down to OUTPUT_FPS afterwards.
 */
const ZOOMPAN_INTERNAL_FPS = 60
/** Final output frame rate. */
const OUTPUT_FPS = 25
/**
 * Upscale factor for the source image before zoompan.
 * 4x gives enough headroom to almost completely eliminate the zoompan integer truncation wobble/jitter.
 */
const ZOOMPAN_SCALE_FACTOR = 4

// ─────────────────────────────────────────────────────────────────────────────
// EASING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Smootherstep: 6t⁵-15t⁴+10t³ — starts and ends slowly */
function smootherstep(p: string): string {
  return `(${p})*(${p})*(${p})*((${p})*((${p})*6-15)+10)`
}

/** Ease-out cubic: starts fast, ends very gently (cinematic arrival) */
function easeOutCubic(p: string): string {
  return `(1-pow(1-(${p}),3))`
}

/** Ease-in cubic: starts slowly, accelerates (suspense) */
function easeInCubic(p: string): string {
  return `pow(${p},3)`
}

/**
 * Cinematic snap zoom with overshoot.
 * Rises sharply to peak then decays with a small overshoot (like a physical lens "clack").
 */
function buildCinematicSnapZoom(
  baseZoom: number,
  peakZoom: number,
  snapAtSec: number,
  decaySec: number = 0.5,
  overshootFactor: number = 0.08
): string {
  const overshootZoom = peakZoom + (peakZoom - baseZoom) * overshootFactor
  const snapFrame = Math.round(snapAtSec * ZOOMPAN_INTERNAL_FPS)
  const k = 6 / decaySec

  return (
    `if(lt(on,${snapFrame}),` +
    `${baseZoom}+(${peakZoom - baseZoom}).toFixed(4)*pow(on/${snapFrame},3),` +
    `${overshootZoom.toFixed(4)}+(${baseZoom}-${overshootZoom.toFixed(4)})*` +
    `(1-exp(-${k.toFixed(3)}*(on/${ZOOMPAN_INTERNAL_FPS}-${snapAtSec.toFixed(3)})))` +
    `)`
  )
}

export class VideoAssembler {
  private outputDir: string
  private musicService: MusicService
  private sfxService: SFXService
  private ambientService: AmbientService

  constructor() {
    this.outputDir = path.join(process.cwd(), 'uploads', 'output')
    this.musicService = new MusicService()
    this.sfxService = new SFXService()
    this.ambientService = new AmbientService()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLAMP HELPERS — prevent hand-swipe artefact
  // ─────────────────────────────────────────────────────────────────────────

  private clampX(expr: string): string {
    return `max(0,min(iw-(iw/zoom),${expr}))`
  }

  private clampY(expr: string): string {
    return `max(0,min(ih-(ih/zoom),${expr}))`
  }

  private clampZ(expr: string): string {
    return `max(1.001,${expr})`
  }

  private getFileMTime(filePath: string): number {
    try {
      if (fs.existsSync(filePath)) {
        return fs.statSync(filePath).mtimeMs
      }
    } catch {
      /* ignore */
    }
    return 0
  }

  /**
   * Helper to attach a progress listener to an FFmpeg command.
   * Interpolates progress within a specific range [start, end].
   */
  private attachProgressListener(
    cmd: any,
    totalDuration: number,
    startRange: number,
    endRange: number,
    onProgress?: (progress: number, message: string) => Promise<void>,
    message: string = 'Rendering...'
  ) {
    if (!onProgress || totalDuration <= 0) return

    cmd.on('progress', (progress: any) => {
      if (progress.timemark) {
        // timemark is HH:MM:SS.ms
        const parts = progress.timemark.split(':')
        const secs = Number.parseFloat(parts[0]) * 3600 + Number.parseFloat(parts[1]) * 60 + Number.parseFloat(parts[2])
        const percent = Math.min(1, secs / totalDuration)
        const globalProgress = Math.round(startRange + percent * (endRange - startRange))
        onProgress(globalProgress, message).catch(() => {})
      }
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN ENTRY POINT
  // ─────────────────────────────────────────────────────────────────────────

  async assembleVideo(
    args: {
      projectId: string
      script: CompleteVideoScript
      outputPath: string
      options: VideoGenerationOptions
      globalAudioPath?: string
    },
    onProgress?: (progress: number, message: string) => Promise<void>
  ): Promise<string> {
    const { script, outputPath: projectDir, options: globalOptions } = args
    const animationMode = globalOptions.animationMode || 'panning'
    const scenesDir = path.join(projectDir, 'scenes')
    const hasGlobalAudio = !!args.globalAudioPath || !!globalOptions.globalAudioPath
    const globalAudioPath = args.globalAudioPath || globalOptions.globalAudioPath
    console.log(`[VideoAssembler] Assembling video in ${animationMode} mode...`)

    const sceneTasks = script.scenes.map((_, i) => i)
    const processedClips: string[] = Array.from({ length: script.scenes.length })
    const processedTransitions: (string | undefined)[] = Array.from({ length: script.scenes.length })

    const CONCURRENCY_LIMIT = 3
    for (let i = 0; i < sceneTasks.length; i += CONCURRENCY_LIMIT) {
      const chunk = sceneTasks.slice(i, i + CONCURRENCY_LIMIT)
      await Promise.all(
        chunk.map(async (sceneIndex) => {
          const result = await this.processSceneClip(
            sceneIndex,
            script,
            scenesDir,
            animationMode,
            globalOptions,
            hasGlobalAudio
          )
          processedClips[sceneIndex] = result.clipPath
          processedTransitions[sceneIndex] = result.transition

          // Incremental progress after each scene for smoothness
          if (onProgress) {
            const finishedScenes = processedClips.filter(Boolean).length
            const p = Math.round((finishedScenes / script.scenes.length) * 40)
            await onProgress(p, `Assembled scene clip ${finishedScenes}/${script.scenes.length}`)
          }
        })
      )
    }

    if (onProgress) await onProgress(45, 'Stitching scenes together...')

    const finalClips = processedClips.filter(Boolean)
    const finalTransitions = processedTransitions

    // ── DEBUG: log transitions before stitching ──
    console.log(`[VideoAssembler] Transitions to apply:`, finalTransitions)

    const finalVideoNoMusic = path.join(projectDir, 'final_video_no_music.mp4')
    const audioOverlap = hasGlobalAudio ? 0.05 : (globalOptions.audioOverlap ?? 0.3)
    await this.stitchClips(finalClips, finalVideoNoMusic, finalTransitions, audioOverlap, onProgress, 45, 60)

    // --- GLOBAL AUDIO OVERLAY ---
    let finalVisualPath = finalVideoNoMusic
    if (hasGlobalAudio && globalAudioPath && fs.existsSync(globalAudioPath)) {
      if (onProgress) await onProgress(60, 'Syncing global narration...')
      console.log(`[VideoAssembler] Overlaying global audio: ${globalAudioPath}`)
      const videoWithGlobalAudio = path.join(projectDir, 'final_video_with_global_audio.mp4')
      const narrationVol = globalOptions.narrationVolume ?? 1
      await new Promise<void>(async (resolve, reject) => {
        const cmd = ffmpeg(finalVideoNoMusic)
          .input(globalAudioPath!)
          .complexFilter([`[1:a]volume=${narrationVol.toFixed(2)}[a_weighted]`])
          .outputOptions(['-c:v copy', '-map 0:v:0', '-map [a_weighted]', '-shortest'])

        if (onProgress) {
          const duration = await this.getClipDuration(finalVideoNoMusic).catch(() => 0)
          this.attachProgressListener(cmd, duration, 60, 70, onProgress, 'Syncing global narration...')
        }

        cmd
          .save(videoWithGlobalAudio)
          .on('end', () => {
            finalVisualPath = videoWithGlobalAudio
            resolve()
          })
          .on('error', (err) => reject(err))
      })
    }

    // Generate Global ASS if needed
    let globalAssPath: string | undefined
    if (hasGlobalAudio && globalOptions.assCaptions?.enabled !== false) {
      const assFileName = 'global_subtitles.ass'
      globalAssPath = path.join(projectDir, assFileName)
      await this.generateGlobalASS(script, globalAssPath, globalOptions)
    }

    if (onProgress) await onProgress(75, 'Applying cinematic polish...')
    const polishedVideoPath = path.join(projectDir, 'final_video_polished.mp4')
    finalVisualPath = await this.applyProfessionalPolish(
      finalVisualPath,
      polishedVideoPath,
      {
        ...globalOptions,
        type: script.type || globalOptions.type,
        globalAssPath
      },
      onProgress,
      75,
      90
    )

    if (globalOptions.branding) {
      if (onProgress) await onProgress(90, 'Applying branding overlays...')
      const brandedVideoPath = path.join(projectDir, 'final_video_branded.mp4')
      finalVisualPath = await this.applyBranding(
        finalVisualPath,
        globalOptions.branding,
        brandedVideoPath,
        onProgress,
        90,
        95
      )
    }

    if (globalOptions.assCaptions?.enabled !== false) {
      const srtPath = path.join(projectDir, 'subtitles.srt')
      await this.generateSRT(script, srtPath)
      console.log(`[VideoAssembler] SRT subtitles exported to: ${srtPath}`)
    }

    const bgMusic = globalOptions.backgroundMusic || script.backgroundMusic
    if (bgMusic) {
      if (onProgress) await onProgress(95, 'Mixing background music...')

      // Sync tracks with DB just in case new ones were added
      const allTracks = await assetsConfigRepository.getAllMusicTracks().catch(() => [])
      this.musicService.syncWithDatabase(allTracks)

      const musicTrack = this.musicService.getTrackForMood(bgMusic)
      if (musicTrack) {
        console.log(
          `[VideoAssembler] Selected music track: ${musicTrack.name} (id: ${musicTrack.id}) for mood: ${bgMusic}`
        )

        let musicPath = this.musicService.getTrackPath(musicTrack.path)

        // Ensure track is local
        if (musicPath.startsWith('http')) {
          const localMusicPath = path.join(projectDir, `bg-music-${musicTrack.id}.mp3`)
          console.log(`[VideoAssembler] Downloading remote music track: ${musicPath} to ${localMusicPath}`)
          const downloaded = await this.downloadTrack(musicPath, localMusicPath).catch((error) => {
            console.error(`[VideoAssembler] Failed to download music track: ${error.message}`)
            return null
          })
          if (downloaded) {
            musicPath = downloaded
          }
        }

        if (fs.existsSync(musicPath)) {
          const videoWithMusicPath = path.join(projectDir, 'final_video.mp4')
          const musicVol = globalOptions.backgroundMusicVolume ?? 0.22
          return await this.addBackgroundMusic(
            finalVisualPath,
            musicPath,
            videoWithMusicPath,
            musicVol,
            onProgress,
            95,
            100
          )
        } else {
          console.warn(`[VideoAssembler] Music file still not found after resolution/download: ${musicPath}`)
        }
      } else {
        console.warn(`[VideoAssembler] No music track found for mood: ${bgMusic}`)
      }
    }

    const ultimatePath = path.join(projectDir, 'final_video.mp4')
    if (finalVisualPath !== ultimatePath && fs.existsSync(finalVisualPath)) {
      fs.renameSync(finalVisualPath, ultimatePath)
      return ultimatePath
    }

    if (onProgress) await onProgress(100, 'Rendering complete')
    return finalVisualPath
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BACKGROUND MUSIC
  // ─────────────────────────────────────────────────────────────────────────

  async addBackgroundMusic(
    videoPath: string,
    musicPath: string,
    outputPath: string,
    volume: number = 0.1,
    onProgress?: (progress: number, message: string) => Promise<void>,
    startRange: number = 0,
    endRange: number = 100
  ): Promise<string> {
    console.log(`[VideoAssembler] Adding background music from: ${musicPath} (vol: ${volume})...`)
    return new Promise(async (resolve, reject) => {
      if (!fs.existsSync(musicPath)) {
        console.warn(`[VideoAssembler] Music file not found: ${musicPath}`)
        return resolve(videoPath)
      }

      const meta = await this.getClipMetadata(videoPath).catch(() => ({ hasAudio: false }))

      if (!meta.hasAudio) {
        console.warn(`[VideoAssembler] Input video has no audio. Adding music without ducking...`)
        ffmpeg()
          .input(videoPath)
          .input(musicPath)
          .outputOptions(['-c:v copy', '-map 0:v:0', '-map 1:a:0', '-shortest', `-vol ${Math.round(volume * 256)}`])
          .save(outputPath)
          .on('end', () => resolve(outputPath))
          .on('error', (err) => reject(new Error(`Background music addition failed: ${err.message}`)))
        return
      }

      const cmd = ffmpeg()
        .input(videoPath)
        .input(musicPath)
        .inputOptions(['-stream_loop -1'])
        .complexFilter([
          `[0:a]asplit=2[voice_sc][voice_mix]`,
          `[1:a]volume=${volume}[music_raw]`,
          `[music_raw][voice_sc]sidechaincompress=threshold=0.01:ratio=10:attack=20:release=400:makeup=1[music_ducked]`,
          `[voice_mix][music_ducked]amix=inputs=2:duration=first[aout]`
        ])
        .outputOptions(['-c:v copy', '-map 0:v:0', '-map [aout]', '-shortest'])

      if (onProgress) {
        const duration = await this.getClipDuration(videoPath).catch(() => 0)
        this.attachProgressListener(cmd, duration, startRange, endRange, onProgress, 'Mixing background music...')
      }

      cmd
        .save(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(new Error(`Background music addition failed: ${err.message}`)))
    })
  }

  private async downloadTrack(url: string, localPath: string): Promise<string | null> {
    try {
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'arraybuffer'
      })
      fs.writeFileSync(localPath, Buffer.from(response.data))
      return localPath
    } catch (error: any) {
      console.error(`[VideoAssembler] Download failed for ${url}:`, error.message)
      return null
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SOUND EFFECTS
  // ─────────────────────────────────────────────────────────────────────────

  private async applySoundEffects(
    scenePath: string,
    soundEffects: Array<{ type: string; timestamp: number; volume?: number }> = []
  ): Promise<string | null> {
    // SFX application disabled for minimalist aesthetic
    return scenePath
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIO CROSSFADE
  // ─────────────────────────────────────────────────────────────────────────

  private async addAudioCrossfade(
    clips: string[],
    outputPath: string,
    crossfadeDuration: number = 0.2
  ): Promise<string> {
    console.log(`[VideoAssembler] Adding audio crossfade between clips (${crossfadeDuration}s)...`)

    const durations: number[] = []
    for (const clip of clips) {
      durations.push(await this.getClipDuration(clip))
    }

    let filterComplex = ''
    let lastAudioLabel = '[0:a]'

    for (let i = 1; i < clips.length; i++) {
      const outLabel = `[a${i}]`
      filterComplex += `${lastAudioLabel}[${i}:a]acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri${outLabel};`
      lastAudioLabel = outLabel
    }

    if (filterComplex.endsWith(';')) {
      filterComplex = filterComplex.slice(0, -1)
    }

    return new Promise((resolve, reject) => {
      let cmd = ffmpeg()
      clips.forEach((clip) => (cmd = cmd.input(clip)))

      cmd
        .complexFilter(filterComplex)
        .outputOptions(['-map 0:v:0', '-map', lastAudioLabel, '-c:v copy', '-c:a aac'])
        .on('end', () => resolve(outputPath))
        .on('error', (err) => {
          console.warn(`[VideoAssembler] Audio crossfade failed: ${err.message}, continuing without...`)
          resolve(outputPath)
        })
        .save(outputPath)
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROFESSIONAL POLISH
  // ─────────────────────────────────────────────────────────────────────────

  async applyProfessionalPolish(
    videoPath: string,
    outputPath: string,
    options?: VideoGenerationOptions & { globalAssPath?: string },
    onProgress?: (progress: number, message: string) => Promise<void>,
    startRange: number = 0,
    endRange: number = 100
  ): Promise<string> {
    console.log(
      `[VideoAssembler] Applying professional visual polish (Vignette, Noise${options?.globalAssPath ? ', Subtitles' : ''})...`
    )

    const crf = options?.proEncoding?.crf ?? 20
    const preset = options?.proEncoding?.preset ?? 'superfast'
    const assPath = options?.globalAssPath

    return new Promise(async (resolve, reject) => {
      const opts = (options ?? {}) as any
      const isQuotes = opts.isQuotes || opts.type === 'quotes'
      const vignetteIntensity = isQuotes ? 0.45 : 0.25
      const noiseIntensity = 0.03

      const filters = [
        `eq=contrast=1.08:brightness=0.01:saturation=1.04[v_base]`,
        `[v_base]vignette=angle=${vignetteIntensity}:x0=w/2:y0=h/2[v_vig]`,
        `[v_vig]noise=alls=${noiseIntensity}:allf=t+u[polished]`
      ]

      let finalLabel = '[polished]'
      if (assPath) {
        filters.push(`${finalLabel}ass='${assPath.replaceAll('\\', '/').replaceAll(':', String.raw`\:`)}'[subtitled]`)
        finalLabel = '[subtitled]'
      }

      const cmd = ffmpeg(videoPath)
        .complexFilter(filters)
        .outputOptions([
          '-map',
          finalLabel,
          '-map 0:a?',
          '-c:v libx264',
          `-preset ${preset}`,
          `-crf ${crf}`,
          '-shortest'
        ])

      if (onProgress) {
        const duration = await this.getClipDuration(videoPath).catch(() => 0)
        this.attachProgressListener(cmd, duration, startRange, endRange, onProgress, 'Applying cinematic polish...')
      }

      cmd
        .save(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => {
          console.error(`[VideoAssembler] Polish failed: ${err.message}`)
          resolve(videoPath)
        })
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BRANDING
  // ─────────────────────────────────────────────────────────────────────────

  async applyBranding(
    videoPath: string,
    config: any,
    outputPath: string,
    onProgress?: (progress: number, message: string) => Promise<void>,
    startRange: number = 0,
    endRange: number = 100
  ): Promise<string> {
    console.log(`[VideoAssembler] Applying branding overlays...`)
    return new Promise(async (resolve, reject) => {
      let filter = ''
      const inputs: string[] = [videoPath]

      if (config.logoPath && fs.existsSync(config.logoPath)) {
        inputs.push(config.logoPath)
        const pos = this.getBrandingPosition(config.position)
        const scale = config.scale || 0.15
        filter += `[1:v]scale=iw*${scale}:-1,format=rgba,colorchannelmixer=aa=${config.opacity || 0.5}[logo]; [0:v][logo]overlay=${pos}[branded_v]`
      }

      if (config.watermarkText) {
        const pos = this.getBrandingPosition(config.position, true)
        const textFilter = `drawtext=text='${config.watermarkText}':fontcolor=white@${config.opacity || 0.3}:fontsize=24:x=${pos.x}:y=${pos.y}`
        if (filter) {
          filter = `${filter},${textFilter}[final_v]`
        } else {
          filter = `[0:v]${textFilter}[final_v]`
        }
      }

      if (!filter) return resolve(videoPath)

      const outLabel = filter.includes('[final_v]') ? '[final_v]' : '[branded_v]'

      let cmd = ffmpeg(videoPath)
      if (config.logoPath && fs.existsSync(config.logoPath)) {
        cmd = cmd.input(config.logoPath)
      }

      if (onProgress) {
        const duration = await this.getClipDuration(videoPath).catch(() => 0)
        this.attachProgressListener(cmd, duration, startRange, endRange, onProgress, 'Applying branding overlays...')
      }

      cmd
        .complexFilter(filter)
        .outputOptions([`-map ${outLabel}`, '-map 0:a?', '-c:v libx264', '-c:a copy'])
        .save(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => {
          console.error(`[VideoAssembler] Branding failed: ${err.message}`)
          resolve(videoPath)
        })
    })
  }

  private getBrandingPosition(pos: string, isText: boolean = false): any {
    const padding = 30
    if (isText) {
      switch (pos) {
        case 'top-left':
          return { x: padding, y: padding }
        case 'top-right':
          return { x: `w-tw-${padding}`, y: padding }
        case 'bottom-left':
          return { x: padding, y: `h-th-${padding}` }
        case 'center':
          return { x: '(w-tw)/2', y: '(h-th)/2' }
        case 'bottom-right':
        default:
          return { x: `w-tw-${padding}`, y: `h-th-${padding}` }
      }
    } else {
      switch (pos) {
        case 'top-left':
          return `${padding}:${padding}`
        case 'top-right':
          return `main_w-overlay_w-${padding}:${padding}`
        case 'bottom-left':
          return `${padding}:main_h-overlay_h-${padding}`
        case 'center':
          return `(main_w-overlay_w)/2:(main_h-overlay_h)/2`
        case 'bottom-right':
        default:
          return `main_w-overlay_w-${padding}:main_h-overlay_h-${padding}`
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SRT GENERATION
  // ─────────────────────────────────────────────────────────────────────────

  async generateSRT(script: CompleteVideoScript, outputPath: string): Promise<void> {
    let srtContent = ''
    let index = 1
    let cumulativeTime = 0

    for (const scene of script.scenes) {
      const sceneDir = path.join(process.cwd(), 'uploads', 'output', 'scenes', scene.id)
      const manifestPath = path.join(sceneDir, 'manifest.json')

      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
          const wordTimings = manifest.wordTimings || []

          let currentLine: any[] = []
          for (let i = 0; i < wordTimings.length; i++) {
            currentLine.push(wordTimings[i])
            const isLastWord = i === wordTimings.length - 1
            const hasPunctuation = wordTimings[i].word.match(/[.!?]$/)

            if (currentLine.length >= 5 || hasPunctuation || isLastWord) {
              const firstW = currentLine[0]
              const startInSec = firstW.startMs !== undefined ? firstW.startMs / 1000 : firstW.start
              const endInSec = currentLine.at(-1).end

              const startTime = this.formatSRTTime(cumulativeTime + startInSec)
              const endTime = this.formatSRTTime(cumulativeTime + endInSec)
              const text = currentLine.map((w) => w.word).join(' ')

              srtContent += `${index}\n${startTime} --> ${endTime}\n${text}\n\n`
              index++
              currentLine = []
            }
          }

          if (wordTimings.length === 0) {
            const duration = scene.timeRange ? scene.timeRange.end - scene.timeRange.start : 5
            const startTime = this.formatSRTTime(cumulativeTime)
            const endTime = this.formatSRTTime(cumulativeTime + duration)
            srtContent += `${index}\n${startTime} --> ${endTime}\n${scene.narration}\n\n`
            index++
          }
        } catch {
          console.warn(`[VideoAssembler] Could not generate SRT for scene ${scene.id}`)
        }
      }
      cumulativeTime += scene.timeRange ? scene.timeRange.end - scene.timeRange.start : 5
    }

    fs.writeFileSync(outputPath, srtContent)
  }

  private formatSRTTime(seconds: number): string {
    const date = new Date(0)
    date.setMilliseconds(seconds * 1000)
    const timePart = date.toISOString().substr(11, 8)
    const msPart = Math.floor((seconds % 1) * 1000)
      .toString()
      .padStart(3, '0')
    return `${timePart},${msPart}`
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CAMERA EFFECT (post-process)
  // ─────────────────────────────────────────────────────────────────────────

  async applyCameraEffect(
    videoPath: string,
    cameraAction: { type: string; intensity: string },
    outputPath: string,
    aspectRatio: string = '16:9',
    resolutionPreset: string = '720p'
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const resolution = this.getResolution(aspectRatio, resolutionPreset)
      const intensityMap: Record<string, number> = { low: 1.05, medium: 1.15, high: 1.3 }
      const zoomFactor = intensityMap[cameraAction.intensity] || 1.1
      const shakeIntensityMap: Record<string, number> = { low: 3, medium: 7, high: 15 }
      const shakePx = shakeIntensityMap[cameraAction.intensity] || 5

      let videoFilter: string

      if (cameraAction.type === 'zoom-in') {
        videoFilter = `scale=iw*${zoomFactor}:ih*${zoomFactor},crop=${resolution.replace('x', ':')}`
      } else if (cameraAction.type === 'zoom-out') {
        videoFilter = `scale=iw*${zoomFactor}:ih*${zoomFactor},crop=${resolution.replace('x', ':')},scale=${resolution.replace('x', ':')}`
      } else if (cameraAction.type === 'shake') {
        videoFilter = `crop=iw-${shakePx * 2}:ih-${shakePx * 2}:${shakePx}+${shakePx}*sin(n/3):${shakePx}+${shakePx}*cos(n/5),scale=${resolution.replace('x', ':')}`
      } else if (cameraAction.type === 'breathing') {
        videoFilter = `zoompan=z='${this.clampZ('1.0+0.05*sin(2*pi*on/100)')}':d=1:x='${this.clampX('iw/2-(iw/zoom/2)')}':y='${this.clampY('ih/2-(ih/zoom/2)')}':s=${resolution}:fps=${ZOOMPAN_INTERNAL_FPS},fps=${OUTPUT_FPS}`
      } else {
        return resolve(videoPath)
      }

      ffmpeg(videoPath)
        .videoFilters(videoFilter)
        .outputOptions(['-c:a copy', '-c:v libx264', '-pix_fmt yuv420p'])
        .save(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(new Error(`Camera effect failed: ${err.message}`)))
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ORGANIC OSCILLATION (kept for opt-in use)
  // ─────────────────────────────────────────────────────────────────────────

  private buildOrganicOscillation(ampPx: number = 6, seed: number = 0): { xOscExpr: string; yOscExpr: string } {
    const phase1 = (seed * 1.3) % (2 * Math.PI)
    const phase2 = (seed * 2.7 + 1.1) % (2 * Math.PI)
    const p1 = phase1.toFixed(3)
    const p2 = phase2.toFixed(3)
    const amp = ampPx.toFixed(1)
    const t = `(on/${ZOOMPAN_INTERNAL_FPS})`
    const xOscExpr = `${amp}*sin(0.37*2*PI*${t}+${p1})+${amp}*0.4*sin(0.91*2*PI*${t}+${p2})`
    const yOscExpr = `${amp}*sin(0.29*2*PI*${t}+${p1})+${amp}*0.4*cos(0.73*2*PI*${t}+${p2})`
    return { xOscExpr, yOscExpr }
  }

  private buildSnapZoomExpression(
    baseZoom: number,
    peakZoom: number,
    snapAtSec: number,
    decaySec: number = 0.4
  ): string {
    const delta = peakZoom - baseZoom
    const k = 8 / decaySec
    const snapFrame = Math.round(snapAtSec * ZOOMPAN_INTERNAL_FPS)
    return (
      `${baseZoom}+` +
      `if(gte(on,${snapFrame}),` +
      `${delta.toFixed(4)}*exp(-${k.toFixed(4)}*(on/${ZOOMPAN_INTERNAL_FPS}-${snapAtSec.toFixed(3)})),` +
      `0` +
      `)`
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DUTCH TILT
  // ─────────────────────────────────────────────────────────────────────────

  async applyDutchTilt(
    inputPath: string,
    outputPath: string,
    angleDeg: number = 1.8,
    oscillate: boolean = false,
    duration: number = 5
  ): Promise<string> {
    return new Promise((resolve) => {
      const angleRad = (angleDeg * Math.PI) / 180
      const rotExpr = oscillate ? `${angleRad.toFixed(4)}*sin(2*PI*t/${duration.toFixed(2)})` : `${angleRad.toFixed(4)}`

      ffmpeg(inputPath)
        .videoFilter(`rotate='${rotExpr}':fillcolor=black@0:ow=iw:oh=ih`)
        .outputOptions(['-c:v libx264', '-preset fast', '-crf 18', '-c:a copy', '-pix_fmt yuv420p'])
        .save(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => {
          console.warn(`[VideoAssembler] Dutch tilt failed: ${err.message}, skipping...`)
          resolve(inputPath)
        })
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CINEMATIC PANNING CLIP — tension-driven
  // ─────────────────────────────────────────────────────────────────────────

  async createPanningClip(
    imagePath: string,
    duration: number,
    outputPath: string,
    aspectRatio: string = '16:9',
    resolutionPreset: string = '720p',
    backgroundColor?: string,
    cameraAction?: CameraAction | CameraAction[],
    wordTimings: any[] = [],
    keywordVisuals: Array<{ imagePath: string; start: number; end: number }> = [],
    sceneTension: number = 5
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const resolution = this.getResolution(aspectRatio, resolutionPreset)
      const [w, h] = resolution.split('x').map(Number)

      const internalFrameCount = Math.round(duration * ZOOMPAN_INTERNAL_FPS)

      // Normalised progress 0→1 over the clip duration
      const P = `(on/${internalFrameCount})`
      const SS = smootherstep(`min(1,max(0,${P}))`)
      const EOC = easeOutCubic(`min(1,max(0,${P}))`)

      // Organic oscillation — opt-in only
      const actionObj = Array.isArray(cameraAction) ? cameraAction[0] : cameraAction
      const wantsOrganic = actionObj?.organic ?? false
      const oscSeed = actionObj?.seed ?? 420
      const { xOscExpr, yOscExpr } = this.buildOrganicOscillation(2, oscSeed)
      const osc = (axis: 'x' | 'y') => (wantsOrganic ? `+(${axis === 'x' ? xOscExpr : yOscExpr})` : '')

      // +0.0005*on forces FFmpeg to use sub-pixel interpolation, eliminating micro-jitter on slow zoompan moves.
      // We apply it only to X to avoid diagonal drift while still breaking rounding locks.
      const CX = `iw/2-(iw/zoom/2)+0.0005*on`
      const CY = `ih/2-(ih/zoom/2)`

      const t = Math.max(1, Math.min(10, sceneTension))

      const panZoomScale = 1.05
      const P_DZ = (panZoomScale - 1).toFixed(4)

      const zoomScale = t <= 3 ? 1.25 : t <= 6 ? 1.4 : 1.55

      const EASING = P

      const actions = Array.isArray(cameraAction)
        ? cameraAction
        : [cameraAction || { type: 'static', intensity: 'medium' }]

      // We need to build unified expressions for Z, X, Y that switch based on the absolute frame 'on'
      let zBaseExpr = '1.001'
      let xRaw = CX
      let yRaw = CY

      if (actions.length === 1) {
        // Legacy single-action mode for simplicity and performance
        const action = actions[0] as any
        const type = action.type ?? 'static'
        const t = Math.max(1, Math.min(10, sceneTension))
        const zoomScale = t <= 3 ? 1.25 : t <= 6 ? 1.4 : 1.55
        const ZS = zoomScale.toFixed(4)
        const DZ = (zoomScale - 1).toFixed(4)
        const PAN_X_HALF = `((iw-(iw/zoom))/2)`
        const PAN_Y_HALF = `((ih-(ih/zoom))/2)`

        switch (type) {
          case 'zoom-in':
            zBaseExpr = `1.0+(${DZ}*${SS})`
            break
          case 'zoom-out':
            zBaseExpr = `${ZS}-(${DZ}*${SS})`
            break
          case 'pan-right':
            zBaseExpr = panZoomScale.toFixed(4)
            xRaw = `${CX}+(${PAN_X_HALF}*0.6*${SS})${osc('x')}`
            break
          case 'pan-left':
            zBaseExpr = panZoomScale.toFixed(4)
            xRaw = `${CX}-(${PAN_X_HALF}*0.6*${SS})${osc('x')}`
            break
          case 'pan-down':
            zBaseExpr = panZoomScale.toFixed(4)
            yRaw = `${CY}+(${PAN_Y_HALF}*0.6*${SS})${osc('y')}`
            break
          case 'pan-up':
            zBaseExpr = panZoomScale.toFixed(4)
            yRaw = `${CY}-(${PAN_Y_HALF}*0.6*${SS})${osc('y')}`
            break
          case 'snap-zoom': {
            const snapAt = (action as any).snapAtSec ?? duration * 0.25
            const peakZoom = (action as any).peakZoom ?? (t >= 7 ? 1.6 : 1.4)
            const overshoot = t >= 7 ? 0.12 : 0.06
            zBaseExpr = buildCinematicSnapZoom(1, peakZoom, snapAt, 0.45, overshoot)
            break
          }
          default: {
            zBaseExpr = `1.0+(${DZ}*${SS})`
            const driftX = `(${PAN_X_HALF}*0.25)`
            const driftY = `(${PAN_Y_HALF}*0.25)`
            const half = (duration / 2).toFixed(2)
            const bx = `if(lt(t,${half}), ${CX}, ${CX}+(${driftX}))`
            const by = `if(lt(t,${half}), ${CY}, ${CY}+(${driftY}))`
            xRaw = `${bx}${osc('x')}`
            yRaw = `${by}${osc('y')}`
            break
          }
        }
      } else {
        // Multi-action mode: chained movements
        let fullZ = '1.0'
        let fullX = CX
        let fullY = CY
        const PAN_X_HALF = `((iw-(iw/zoom))/2)`
        const PAN_Y_HALF = `((ih-(ih/zoom))/2)`

        // Sort by timestamp to be sure
        const sortedActions = [...actions].sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0))

        for (let idx = sortedActions.length - 1; idx >= 0; idx--) {
          const action = sortedActions[idx] as any
          const startTime = action.timestamp ?? 0
          const actionDuration =
            action.duration ||
            (idx === sortedActions.length - 1
              ? duration - startTime
              : (sortedActions[idx + 1] as any).timestamp! - startTime)
          const startFrame = Math.round(startTime * ZOOMPAN_INTERNAL_FPS)

          const type = action.type ?? 'static'
          const intensity = action.intensity || 'medium'
          const zoomScale = intensity === 'low' ? 1.15 : intensity === 'high' ? 1.45 : 1.25
          const DZ = (zoomScale - 1).toFixed(4)

          // Local progress for this action
          const localP = `(on-${startFrame})/(${Math.round(actionDuration * ZOOMPAN_INTERNAL_FPS)})`
          const localSS = smootherstep(`min(1,max(0,${localP}))`)

          let currentZ = '1.0'
          let currentX = CX
          const currentY = CY

          switch (type) {
            case 'zoom-in':
              currentZ = `1.0+(${DZ}*${localSS})`
              break
            case 'zoom-out':
              currentZ = `${zoomScale.toFixed(4)}-(${DZ}*${localSS})`
              break
            case 'pan-right':
              currentZ = '1.05'
              currentX = `${CX}+(${PAN_X_HALF}*0.6*${localSS})`
              break
            case 'pan-left':
              currentZ = '1.05'
              currentX = `${CX}-(${PAN_X_HALF}*0.6*${localSS})`
              break
            case 'static':
            default:
              currentZ = '1.001'
              break
          }

          fullZ = `if(gte(on,${startFrame}), ${currentZ}, ${fullZ})`
          fullX = `if(gte(on,${startFrame}), ${currentX}, ${fullX})`
          fullY = `if(gte(on,${startFrame}), ${currentY}, ${fullY})`
        }
        zBaseExpr = fullZ
        xRaw = fullX
        yRaw = fullY
      }

      const zExpr = this.clampZ(zBaseExpr)
      const x = this.clampX(xRaw)
      const y = this.clampY(yRaw)

      const scW = w * ZOOMPAN_SCALE_FACTOR
      const scH = h * ZOOMPAN_SCALE_FACTOR

      const filterString = [
        `scale=${scW}:${scH}:force_original_aspect_ratio=increase`,
        `crop=${scW}:${scH}`,
        // Fix: Output at high-res (scW x scH) then scale down at the end to achieve sub-pixel interpolation and eliminate jitter.
        `zoompan=z='${zExpr}':d=${internalFrameCount}:x='${x}':y='${y}':s=${scW}x${scH}:fps=${ZOOMPAN_INTERNAL_FPS}`,
        `fps=${OUTPUT_FPS}`,
        `scale=${w}:${h}:flags=lanczos`
      ].join(',')

      const ffmpegCommand = ffmpeg().input(imagePath).inputOptions(['-loop 1'])

      // Dutch Tilt: integrate rotation directly into FFmpeg filtergraph (single pass, no quality loss)
      let cameraFilterString = filterString
      const actionForTilt = Array.isArray(cameraAction) ? cameraAction[0] : cameraAction
      const tiltType = (actionForTilt as any)?.type ?? 'static'
      if (tiltType === 'dutch-tilt') {
        const tiltDeg = (actionForTilt as any)?.tiltDeg ?? 1.8
        const angleRad = ((tiltDeg * Math.PI) / 180).toFixed(4)
        const rotExpr = `${angleRad}*sin(2*PI*t/${duration.toFixed(2)})`
        cameraFilterString = `${filterString},rotate='${rotExpr}':fillcolor=black@0:ow=iw:oh=ih`
      }

      if (keywordVisuals.length > 0) {
        const lastOutput = '[v_base]'
        const complexFilter = `[0:v]${cameraFilterString}[v_base];${keywordVisuals
          .map((kv, idx) => {
            const inputIdx = idx + 1
            const nextOutput = idx === keywordVisuals.length - 1 ? '' : `[v_kv_${idx}]`
            const startFade = Math.max(0, kv.start)
            const outFade = Math.max(0, kv.end - 0.3)
            ffmpegCommand.input(kv.imagePath).inputOptions(['-loop 1'])
            return [
              `[${inputIdx}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},format=rgba,fade=t=in:st=${startFade}:d=0.3:alpha=1,fade=t=out:st=${outFade}:d=0.3:alpha=1[kv_s_${idx}]`,
              `${lastOutput}[kv_s_${idx}]overlay=enable='between(t,${kv.start},${kv.end})'${nextOutput}`
            ].join(';')
          })
          .join(';')}`

        ffmpegCommand.complexFilter(complexFilter)
      } else {
        ffmpegCommand.outputOptions(['-vf', cameraFilterString])
      }

      ffmpegCommand
        .outputOptions([
          '-c:v libx264',
          '-preset slow',
          '-crf 17',
          '-t',
          `${duration}`,
          '-pix_fmt yuv420p',
          `-r ${OUTPUT_FPS}`
        ])
        .save(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(new Error(`Panning clip creation failed: ${err.message}`)))
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COMPOSED CLIP
  // ─────────────────────────────────────────────────────────────────────────

  async createComposedClip(
    backgroundPath: string,
    layers: Array<{
      path: string
      x: number
      y: number
      scale: number
      animation?: { type: string; delay: number; duration: number }
    }>,
    duration: number,
    outputPath: string,
    aspectRatio: string = '16:9',
    resolutionPreset: string = '720p',
    keywordVisuals: Array<{ imagePath: string; start: number; end: number }> = []
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const resolution = this.getResolution(aspectRatio, resolutionPreset)
      const [width, height] = resolution.split('x').map(Number)
      const fps = OUTPUT_FPS

      let command = ffmpeg()
      command = command.input(backgroundPath).inputOptions(['-loop 1'])
      layers.forEach((layer) => {
        command = command.input(layer.path).inputOptions(['-loop 1'])
      })
      keywordVisuals.forEach((kv) => {
        command = command.input(kv.imagePath).inputOptions(['-loop 1'])
      })

      let filterChain = `[0:v]scale=${width}:${height}[bg];`
      let lastOutput = 'bg'

      layers.forEach((layer, index) => {
        const inputIdx = index + 1
        const inputLabel = `layer${inputIdx}`
        const outputLabel = `v${inputIdx}`

        const layerWidth = Math.round(width * 0.4 * layer.scale)
        filterChain += `[${inputIdx}:v]scale=${layerWidth}:-1[${inputLabel}_scaled];`

        const xExpr = `(W-w)*${layer.x}`
        const yExpr = `(H-h)*${layer.y}`
        let alphaFilter = ''
        const type = layer.animation?.type || 'none'
        const delay = layer.animation?.delay || 0
        const animDuration = layer.animation?.duration || 0.5

        if (type === 'pop-in') {
          alphaFilter = `,fade=t=in:st=${delay}:d=0.01:alpha=1`
        } else if (type === 'fade-in') {
          alphaFilter = `,fade=t=in:st=${delay}:d=${animDuration}:alpha=1`
        } else if (delay > 0) {
          alphaFilter = `,fade=t=in:st=${delay}:d=0.01:alpha=1`
        }

        filterChain += `[${inputLabel}_scaled]format=rgba${alphaFilter}[${inputLabel}_anim];`
        filterChain += `[${lastOutput}][${inputLabel}_anim]overlay=x='${xExpr}':y='${yExpr}':shortest=1[${outputLabel}];`
        lastOutput = outputLabel
      })

      if (keywordVisuals.length > 0) {
        const layerCount = layers.length
        keywordVisuals.forEach((kv, idx) => {
          const inputIdx = 1 + layerCount + idx
          const kvInputLabel = `kv_input_${idx}`
          const kvOutputLabel = `kv_final_${idx}`
          const startFade = Math.max(0, kv.start)
          const outFade = Math.max(0, kv.end - 0.3)

          filterChain += `[${inputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=rgba,fade=t=in:st=${startFade}:d=0.3:alpha=1,fade=t=out:st=${outFade}:d=0.3:alpha=1[${kvInputLabel}];`
          filterChain += `[${lastOutput}][${kvInputLabel}]overlay=enable='between(t,${kv.start},${kv.end})'[${kvOutputLabel}];`
          lastOutput = kvOutputLabel
        })
      }

      const finalFilterChain = filterChain.replace(/;+$/, '')

      command
        .complexFilter(finalFilterChain)
        .map(`[${lastOutput}]`)
        .outputOptions([`-t ${duration}`, '-pix_fmt yuv420p', `-r ${fps}`, '-c:v libx264'])
        .on('start', (cmd) => console.log(`[VideoAssembler-Composition] Command: ${cmd}`))
        .on('error', (err, stdout, stderr) => {
          console.error('[VideoAssembler] Composition failed:', err.message)
          console.error('[VideoAssembler] stderr:', stderr)
          reject(err)
        })
        .on('end', () => resolve(outputPath))
        .save(outputPath)
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATIC CLIP — 8 cinematic presets, tension-driven
  // ─────────────────────────────────────────────────────────────────────────

  async createStaticClip(
    imagePath: string,
    duration: number,
    outputPath: string,
    aspectRatio: string = '16:9',
    resolutionPreset: string = '720p',
    backgroundColor?: string,
    wordTimings: any[] = [],
    keywordVisuals: Array<{ imagePath: string; start: number; end: number }> = [],
    seed?: number,
    sceneTension: number = 5
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const resolution = this.getResolution(aspectRatio, resolutionPreset)
      const [width, height] = resolution.split('x').map(Number)

      const internalFrameCount = Math.round(duration * ZOOMPAN_INTERNAL_FPS)

      const P = `min(1,max(0,(on/${internalFrameCount})))`
      const SS = smootherstep(P)
      const EOC = easeOutCubic(P)

      const t = Math.max(1, Math.min(10, sceneTension))

      const zoomScale = t <= 3 ? 1.12 : t <= 6 ? 1.2 : 1.3
      const ZS = zoomScale.toFixed(4)
      const DZ = (zoomScale - 1).toFixed(4)

      const EASING = t <= 5 ? SS : EOC

      const CX = `iw/2-(iw/zoom/2)+0.0005*on`
      const CY = `ih/2-(ih/zoom/2)`
      const PX = `(iw-(iw/zoom))`
      const PY = `(ih-(ih/zoom))`
      const PXH = `((iw-(iw/zoom))/2)`
      const PYH = `((ih-(ih/zoom))/2)`

      let hash = 0
      for (let i = 0; i < imagePath.length; i++) {
        hash = imagePath.charCodeAt(i) + ((hash << 5) - hash)
      }
      const seedValue = seed !== undefined ? seed : Math.floor(duration * 1000)
      hash = Math.abs(hash ^ seedValue)
      const effectIndex = hash % 8

      let baseZ = '1.001'
      let baseX = CX
      let baseY = CY

      switch (effectIndex) {
        case 0:
          baseZ = `1.0+(${DZ}*${EASING})`
          break
        case 1:
          baseZ = `${ZS}-(${DZ}*${EASING})`
          break
        case 2:
          baseZ = ZS
          baseX = `${PX}*(${EASING})`
          break
        case 3:
          baseZ = ZS
          baseX = `${PX}*(1-(${EASING}))`
          break
        case 4:
          baseZ = ZS
          baseY = `${PY}*(${EASING})`
          break
        case 5:
          baseZ = ZS
          baseY = `${PY}*(1-(${EASING}))`
          break
        case 6:
          baseZ = `1.0+(${DZ}*1.5*${EASING})`
          baseX = `${CX}+${PXH}*(${EASING})`
          baseY = `${CY}+${PYH}*(${EASING})`
          break
        case 7:
          baseZ = `1.0+(${DZ}*1.5*${EASING})`
          baseX = `${CX}-${PXH}*(${EASING})`
          baseY = `${CY}-${PYH}*(${EASING})`
          break
      }

      const zExpr = this.clampZ(baseZ)
      const x = this.clampX(baseX)
      const y = this.clampY(baseY)

      const scW = width * ZOOMPAN_SCALE_FACTOR
      const scH = height * ZOOMPAN_SCALE_FACTOR

      const filterString = [
        `scale=${scW}:${scH}:force_original_aspect_ratio=increase`,
        `crop=${scW}:${scH}`,
        `zoompan=z='${zExpr}':d=${internalFrameCount}:x='${x}':y='${y}':s=${width}x${height}:fps=${ZOOMPAN_INTERNAL_FPS}`,
        `fps=${OUTPUT_FPS}`,
        `scale=${width}:${height}:flags=lanczos`
      ].join(',')

      const ffmpegCommand = ffmpeg().input(imagePath).inputOptions(['-loop 1'])

      if (keywordVisuals.length > 0) {
        let lastOutput = '[v_base]'
        const complexFilterParts = [`[0:v]${filterString}[v_base]`]

        keywordVisuals.forEach((kv, idx) => {
          ffmpegCommand.input(kv.imagePath).inputOptions(['-loop 1'])
          const inputIdx = idx + 1
          const kvScaled = `[kv_s_${idx}]`
          const overlayOut = idx === keywordVisuals.length - 1 ? '[outv]' : `[v_kv_${idx}]`
          const startFade = Math.max(0, kv.start)
          const outFade = Math.max(0, kv.end - 0.3)

          complexFilterParts.push(
            `[${inputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=rgba,fade=t=in:st=${startFade}:d=0.3:alpha=1,fade=t=out:st=${outFade}:d=0.3:alpha=1${kvScaled}`
          )
          complexFilterParts.push(
            `${lastOutput}${kvScaled}overlay=enable='between(t,${kv.start},${kv.end})'${overlayOut}`
          )
          lastOutput = overlayOut
        })

        ffmpegCommand.complexFilter(complexFilterParts.join(';'))
        ffmpegCommand.outputOptions(['-map', '[outv]'])
      } else {
        ffmpegCommand.outputOptions(['-vf', filterString])
      }

      ffmpegCommand
        .outputOptions([
          '-c:v libx264',
          '-preset slow',
          '-crf 17',
          '-t',
          `${duration}`,
          '-pix_fmt yuv420p',
          `-r ${OUTPUT_FPS}`
        ])
        .save(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(new Error(`Static clip creation failed: ${err.message}`)))
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AI CLIP PROCESSING
  // ─────────────────────────────────────────────────────────────────────────

  async processAiClip(
    videoPath: string,
    targetDuration: number,
    outputPath: string,
    aspectRatio: string = '16:9',
    resolutionPreset: string = '720p'
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const resolution = this.getResolution(aspectRatio, resolutionPreset)
      const [width, height] = resolution.split('x').map(Number)

      const filterString = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${OUTPUT_FPS}`

      ffmpeg(videoPath)
        .inputOptions(['-stream_loop -1'])
        .outputOptions([
          '-vf',
          filterString,
          '-c:v libx264',
          '-preset slow',
          '-crf 17',
          '-t',
          `${targetDuration}`,
          '-pix_fmt yuv420p',
          `-r ${OUTPUT_FPS}`
        ])
        .save(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(new Error(`AI clip processing failed: ${err.message}`)))
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────────────────

  private normalizeColor(color: string | undefined): string {
    if (!color) return 'white'
    const colorName = color.toLowerCase().trim()
    const validColors = ['white', 'black', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'transparent']
    if (validColors.includes(colorName)) return colorName
    let hex = colorName.replace('#', '')
    if (hex.length === 3)
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('')
    if (/^[0-9A-F]{6}$/i.test(hex)) return `0x${hex}`
    return 'white'
  }

  private getResolution(aspectRatio: string, preset: string = '720p'): string {
    let baseHeight = 720
    if (preset === '1080p') baseHeight = 1080
    if (preset === '4k') baseHeight = 2160

    const makeEven = (val: number) => {
      const rounded = Math.round(val)
      return rounded % 2 === 0 ? rounded : rounded + 1
    }

    switch (aspectRatio) {
      case '9:16':
        return `${makeEven(baseHeight * (9 / 16))}x${makeEven(baseHeight)}`
      case '1:1':
        return `${makeEven(baseHeight)}x${makeEven(baseHeight)}`
      case '16:9':
      default:
        return `${makeEven(baseHeight * (16 / 9))}x${makeEven(baseHeight)}`
    }
  }

  private getKeywordTiming(keyword: string, wordTimings: WordTiming[]): { start: number; end: number } | null {
    if (!keyword || wordTimings.length === 0) return null

    const clean = (s: string) =>
      s
        .toLowerCase()
        .replaceAll(/[.,!?;:()"]/g, '')
        .trim()
    const target = clean(keyword)
    const targetWords = target.split(/\s+/)

    for (let i = 0; i <= wordTimings.length - targetWords.length; i++) {
      let match = true
      for (const [j, targetWord] of targetWords.entries()) {
        if (clean(wordTimings[i + j].word) !== targetWord) {
          match = false
          break
        }
      }
      if (match) {
        return {
          start: wordTimings[i].start,
          end: wordTimings[i + targetWords.length - 1].end
        }
      }
    }
    return null
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIO MIXING
  // ─────────────────────────────────────────────────────────────────────────

  private async mixSceneAudio(
    videoPath: string,
    narrationPath: string,
    soundscapePath: string | null,
    soundEffects: Array<{ type: string; timestamp: number; volume?: number }>,
    outputPath: string,
    duration: number,
    startPadding: number,
    tension: number = 5,
    skipNarration: boolean = false,
    options?: VideoGenerationOptions
  ): Promise<string> {
    const atempoRate = 1

    let ambientBaseVolume: number
    let duckingRatio: number
    if (tension <= 3) {
      ambientBaseVolume = 0.5
      duckingRatio = 4
    } else if (tension <= 6) {
      ambientBaseVolume = 0.35
      duckingRatio = 8
    } else {
      ambientBaseVolume = 0.2
      duckingRatio = 15
    }

    console.log(
      `[VideoAssembler] Mixing audio | tension: ${tension} | atempo: 1.0 (fixed) | ambVol: ${ambientBaseVolume} | duck ratio: ${duckingRatio}`
    )

    const narrVol = options?.narrationVolume ?? 1

    return new Promise((resolve, reject) => {
      const cmd = ffmpeg().input(videoPath)

      let currentInputIndex = 1

      const hasNarration = narrationPath && fs.existsSync(narrationPath)
      if (!skipNarration && hasNarration) {
        cmd.input(narrationPath)
        currentInputIndex++
      }

      // SFX and Soundscape logic removed for minimalist aesthetic
      const filterParts: string[] = []
      const delayMs = Math.floor(startPadding * 1000)
      let currentAudioLabel = ''

      if (!skipNarration && hasNarration) {
        filterParts.push(`[1:a]adelay=${delayMs}|${delayMs},volume=${narrVol.toFixed(2)}[narr]`)
        currentAudioLabel = '[narr]'
      } else {
        filterParts.push(`aevalsrc=0:c=stereo:s=44100:d=${duration}[silent_base]`)
        currentAudioLabel = '[silent_base]'
      }

      filterParts.push(`${currentAudioLabel}apad[aout_padded]`)

      cmd
        .complexFilter(filterParts.join(';'))
        .outputOptions(['-c:v copy', '-map 0:v:0', '-map [aout_padded]', '-shortest', `-t ${duration}`])
        .on('end', () => resolve(outputPath))
        .on('error', (err) => {
          console.error(`[VideoAssembler] mixSceneAudio failed: ${err.message}`)
          reject(err)
        })
        .save(outputPath)
    })
  }

  public async muxAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    duration: number,
    delayMs: number = 600
  ): Promise<string> {
    return this.mixSceneAudio(videoPath, audioPath, null, [], outputPath, duration, delayMs / 1000)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSITIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Resolves the transition name to use between two scenes.
   *
   * Automatically selects a transition based on scene tension (premium feel).
   * Mid-range tension (4-7) gets a nice dissolve instead of a hard cut.
   */
  private resolveTransition(suggested: string | undefined, tension: number): string {
    // 1. If the scene explicitly sets a non-trivial transition, always honour it
    if (suggested && suggested !== 'none' && suggested !== 'cut') return suggested

    // 2. Auto-select based on tension (always enabled for premium feel)
    if (tension > 7) return 'slideleft' // High tension → snappy slide
    if (tension <= 3) return 'fade' // Calm → soft fade
    return 'dissolve' // Mid-range (4-7) gets a nice dissolve for a premium feel
  }

  private getXfadeTransition(
    type: string | undefined,
    maxAllowedDuration?: number
  ): { name: string; duration: number } | null {
    if (!type || type === 'cut' || type === 'none') return null

    const nativeXfade = new Set([
      'fade',
      'fadeblack',
      'fadewhite',
      'distance',
      'wipeleft',
      'wiperight',
      'wipeup',
      'wipedown',
      'slideleft',
      'slideright',
      'slideup',
      'slidedown',
      'smoothleft',
      'smoothright',
      'smoothup',
      'smoothdown',
      'circlecrop',
      'rectcrop',
      'circleopen',
      'circleclose',
      'vertopen',
      'vertclose',
      'horzopen',
      'horzclose',
      'dissolve',
      'pixelize',
      'diagtl',
      'diagtr',
      'diagbl',
      'diagbr',
      'hlslice',
      'hrslice',
      'vuslice',
      'vdslice',
      'hblur',
      'fadegrays',
      'squeezev',
      'squeezeh',
      'zoomin',
      'zoomout',
      'hlwind',
      'hrwind',
      'vuwind',
      'vdwind',
      'coverleft',
      'coverright',
      'coverup',
      'coverdown',
      'revealleft',
      'revealright',
      'revealup',
      'revealdown',
      'radial'
    ])

    const defaultDurations: Record<string, number> = {
      // Rich/Complex
      circleopen: 1.2,
      circleclose: 1.2,
      zoomout: 0.9,
      pixelize: 1,
      radial: 1,
      zoomin: 0.9,
      squeezev: 0.8,
      squeezeh: 0.8,
      distance: 0.9,
      hblur: 0.9,
      circlecrop: 0.9,
      dissolve: 0.8,
      crossfade: 0.8,
      // Standard
      wipeleft: 0.7,
      wiperight: 0.7,
      wipeup: 0.7,
      wipedown: 0.7,
      slideleft: 0.7,
      slideright: 0.7,
      slideup: 0.7,
      slidedown: 0.7,
      smoothleft: 0.7,
      smoothright: 0.7,
      smoothup: 0.7,
      smoothdown: 0.7,
      // Simple
      fade: 0.6,
      fadeblack: 0.6,
      fadewhite: 0.6,
      cut: 0
    }

    const aliasMap: Record<string, { name: string; duration: number }> = {
      crossfade: { name: 'dissolve', duration: defaultDurations.dissolve },
      blur: { name: 'hblur', duration: defaultDurations.hblur },
      zoom: { name: 'zoomin', duration: defaultDurations.zoomin },
      'zoom-in': { name: 'zoomin', duration: defaultDurations.zoomin },
      'zoom-out': { name: 'zoomout', duration: defaultDurations.zoomin },
      wipe: { name: 'wipeleft', duration: defaultDurations.wipeleft },
      'wipe-left': { name: 'wipeleft', duration: defaultDurations.wipeleft },
      'wipe-right': { name: 'wiperight', duration: defaultDurations.wiperight },
      'wipe-up': { name: 'wipeup', duration: defaultDurations.wipeup },
      'wipe-down': { name: 'wipedown', duration: defaultDurations.wipedown },
      slide: { name: 'slideleft', duration: defaultDurations.slideleft },
      'slide-left': { name: 'slideleft', duration: defaultDurations.slideleft },
      'slide-right': { name: 'slideright', duration: defaultDurations.slideright },
      'slide-up': { name: 'slideup', duration: defaultDurations.slideup },
      'slide-down': { name: 'slidedown', duration: defaultDurations.slidedown },
      'smooth-left': { name: 'smoothleft', duration: defaultDurations.smoothleft },
      'smooth-right': { name: 'smoothright', duration: defaultDurations.smoothright },
      'smooth-up': { name: 'smoothup', duration: defaultDurations.smoothup },
      'smooth-down': { name: 'smoothdown', duration: defaultDurations.smoothdown },
      pop: { name: 'fadeblack', duration: defaultDurations.fadeblack },
      'fade-black': { name: 'fadeblack', duration: defaultDurations.fadeblack },
      'fade-white': { name: 'fadewhite', duration: defaultDurations.fadewhite },
      swish: { name: 'slideleft', duration: defaultDurations.slideleft },
      flash: { name: 'fadewhite', duration: defaultDurations.fadewhite },
      circle: { name: 'circleopen', duration: defaultDurations.circleopen },
      none: { name: 'fade', duration: 0.4 }, // Even 'none' gets a subtle fade for continuity
      cut: { name: 'cut', duration: 0 }
    }

    let result: { name: string; duration: number }

    if (aliasMap[type]) {
      result = { ...aliasMap[type] }
    } else if (nativeXfade.has(type)) {
      result = { name: type, duration: defaultDurations[type] || 0.5 }
    } else {
      console.warn(`[VideoAssembler] Unknown transition "${type}", defaulting to fade`)
      result = { name: 'fade', duration: defaultDurations.fade }
    }

    if (maxAllowedDuration !== undefined && result.duration > maxAllowedDuration) {
      result.duration = Math.max(0.04, maxAllowedDuration)
    }

    return result
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLIP STITCHING
  // ─────────────────────────────────────────────────────────────────────────

  private getClipDuration(clipPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(clipPath, (err, metadata) => {
        if (err) return reject(err)
        resolve(metadata.format.duration || 5)
      })
    })
  }

  async stitchClips(
    clips: string[],
    outputPath: string,
    transitions: (string | undefined)[] = [],
    audioOverlap: number = 0.1,
    onProgress?: (progress: number, message: string) => Promise<void>,
    startRange: number = 0,
    endRange: number = 100
  ): Promise<string> {
    if (clips.length === 0) throw new Error('No clips to stitch')
    if (clips.length === 1) {
      fs.copyFileSync(clips[0], outputPath)
      return outputPath
    }

    const hasTransitions = transitions.some((t) => {
      const xf = this.getXfadeTransition(t)
      return xf !== null
    })

    if (!hasTransitions && audioOverlap <= 0) {
      return this.stitchClipsSimple(clips, outputPath, onProgress, startRange, endRange)
    }

    console.log(`[VideoAssembler] Stitching ${clips.length} clips with xfade transitions...`)

    const durations: number[] = []
    const hasAudio: boolean[] = []
    for (const clip of clips) {
      const meta = await this.getClipMetadata(clip)
      durations.push(meta.duration)
      hasAudio.push(meta.hasAudio)
    }

    const command = ffmpeg()
    clips.forEach((clip, i) => {
      command.input(clip)
      if (!hasAudio[i]) {
        command.input('anullsrc=r=44100:cl=stereo').inputOptions(['-f', 'lavfi'])
      }
    })

    let filterComplex = ''
    const n = clips.length

    let inputCounter = 0
    const clipLabels: string[] = []
    const audioLabels: string[] = []

    const normalizationFilter = 'loudnorm=I=-16:TP=-1.5:LRA=11'

    for (let i = 0; i < n; i++) {
      const vLabel = `[v_in_${i}]`
      const aLabel = `[a_in_${i}]`
      if (hasAudio[i]) {
        filterComplex += `[${inputCounter}:v]setpts=PTS-STARTPTS,settb=AVTB${vLabel};`
        filterComplex += `[${inputCounter}:a]aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=44100,${normalizationFilter}${aLabel};`
        inputCounter++
      } else {
        filterComplex += `[${inputCounter}:v]setpts=PTS-STARTPTS,settb=AVTB${vLabel};`
        filterComplex += `[${inputCounter + 1}:a]atrim=duration=${durations[i]},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=44100,${normalizationFilter}${aLabel};`
        inputCounter += 2
      }
      clipLabels.push(vLabel)
      audioLabels.push(aLabel)
    }

    let cumulativeOffset = 0
    let lastVideoLabel = clipLabels[0]
    const transitionOffsets: number[] = []

    for (let i = 1; i < n; i++) {
      const maxSafeOverlap = Math.min(durations[i - 1], durations[i]) / 2

      // FIX: transitions[i-1] holds the transition of scene i-1 (used between scene i-1 and i).
      // Log for debugging visibility.
      const rawTransition = transitions[i - 1]
      const transition = this.getXfadeTransition(rawTransition, maxSafeOverlap)
      console.log(
        `[VideoAssembler] Scene ${i - 1}→${i} | raw="${rawTransition}" | resolved=${JSON.stringify(transition)}`
      )

      const transitionDuration = transition ? transition.duration : 0.04
      const transitionName = transition ? transition.name : 'fade'
      const maxPossibleOverlap = Math.min(durations[i - 1], durations[i]) - 0.05
      const effectiveOverlap = Math.min(Math.max(transitionDuration, audioOverlap), Math.max(0.01, maxPossibleOverlap))
      const offset = Number(Math.max(0.01, cumulativeOffset + durations[i - 1] - effectiveOverlap).toFixed(3))
      const safeTransitionDuration = Math.max(0.04, Math.min(transitionDuration, offset * 0.95))

      const outLabel = `[v_out_${i}]`
      filterComplex += `${lastVideoLabel}${clipLabels[i]}xfade=transition=${transitionName}:duration=${safeTransitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}${outLabel};`
      lastVideoLabel = outLabel

      if (i === 1) {
        cumulativeOffset = durations[0] - effectiveOverlap
      } else {
        cumulativeOffset += durations[i - 1] - effectiveOverlap
      }
      transitionOffsets.push(cumulativeOffset)
    }

    let lastAudioLabel = audioLabels[0]
    let audioCumulativeOffset = 0

    for (let i = 1; i < n; i++) {
      const maxSafeOverlap = Math.min(durations[i - 1], durations[i]) / 2.1
      const transition = this.getXfadeTransition(transitions[i - 1], maxSafeOverlap)
      const transitionDuration = transition ? transition.duration : 0.04
      const maxPossibleOverlap = Math.min(durations[i - 1], durations[i]) - 0.1
      const effectiveAudioOverlap = Math.min(
        Math.max(transitionDuration, audioOverlap),
        Math.max(0.01, maxPossibleOverlap)
      )
      const outLabel = `[a_out_${i}]`
      filterComplex += `${lastAudioLabel}${audioLabels[i]}acrossfade=d=${effectiveAudioOverlap.toFixed(3)}:c1=tri:c2=tri${outLabel};`
      lastAudioLabel = outLabel

      if (i === 1) {
        audioCumulativeOffset = durations[0] - effectiveAudioOverlap
      } else {
        audioCumulativeOffset += durations[i - 1] - effectiveAudioOverlap
      }
    }

    // High-tension swish SFX removed for a cleaner, minimalist aesthetic at user request.

    filterComplex = filterComplex.endsWith(';') ? filterComplex.slice(0, -1) : filterComplex

    if (onProgress) {
      const totalDur = durations.reduce((acc, d) => acc + d, 0)
      this.attachProgressListener(command, totalDur, startRange, endRange, onProgress, 'Stitching scenes together...')
    }

    return new Promise<string>((resolve, reject) => {
      command
        .complexFilter(filterComplex)
        .outputOptions([
          '-map',
          lastVideoLabel,
          '-map',
          lastAudioLabel,
          '-c:v libx264',
          '-preset fast',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-movflags +faststart'
        ])
        .on('start', (cmd) => console.log(`[VideoAssembler] xfade command: ${cmd.slice(0, 300)}...`))
        .on('error', (err, stdout, stderr) => {
          console.error('[VideoAssembler] xfade stitching failed:', err.message)
          console.error('[VideoAssembler] stderr:', stderr?.substring(0, 500))
          console.warn('[VideoAssembler] Falling back to simple concat...')
          this.stitchClipsSimple(clips, outputPath).then(resolve).catch(reject)
        })
        .on('end', () => {
          console.log(`[VideoAssembler] ✅ xfade stitching complete`)
          resolve(outputPath)
        })
        .save(outputPath)
    })
  }

  private async stitchClipsSimple(
    clips: string[],
    outputPath: string,
    onProgress?: (progress: number, message: string) => Promise<void>,
    startRange: number = 0,
    endRange: number = 100
  ): Promise<string> {
    console.log(`[VideoAssembler] Stitching ${clips.length} clips (simple concat)...`)
    const listFile = `${outputPath}.list.txt`
    fs.writeFileSync(listFile, clips.map((p) => `file '${path.resolve(p)}'`).join('\n'))

    const cmd = ffmpeg().input(listFile).inputOptions(['-f', 'concat', '-safe', '0']).outputOptions(['-c copy', '-y'])

    if (onProgress) {
      const durations = await Promise.all(clips.map((c) => this.getClipDuration(c).catch(() => 0)))
      const totalDur = durations.reduce((acc, d) => acc + d, 0)
      this.attachProgressListener(cmd, totalDur, startRange, endRange, onProgress, 'Stitching clips (concat)...')
    }

    return new Promise((resolve, reject) => {
      cmd
        .on('error', (err) => {
          console.error('[VideoAssembler] Simple stitching failed:', err.message)
          if (fs.existsSync(listFile)) fs.unlinkSync(listFile)
          reject(err)
        })
        .on('end', () => {
          if (fs.existsSync(listFile)) fs.unlinkSync(listFile)
          resolve(outputPath)
        })
        .save(outputPath)
    })
  }

  private getClipMetadata(clipPath: string): Promise<{ duration: number; hasAudio: boolean }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(clipPath, (err, metadata) => {
        if (err) return reject(err)
        const duration = metadata.format.duration || 5
        const hasAudio = metadata.streams.some((s) => s.codec_type === 'audio')
        resolve({ duration, hasAudio })
      })
    })
  }

  private async getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(audioPath)) return resolve(5)
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) return reject(err)
        resolve(metadata.format.duration || 5)
      })
    })
  }

  private async detectLeadingSilence(audioPath: string): Promise<number> {
    return new Promise((resolve) => {
      if (!fs.existsSync(audioPath)) return resolve(0)
      let firstSilenceEnd = 0
      ffmpeg(audioPath)
        .audioFilters('silencedetect=n=-40dB:d=0.5')
        .format('null')
        .output('-')
        .on('stderr', (stderrLine) => {
          if (stderrLine.includes('silence_end:') && !stderrLine.includes('silence_start:')) {
            const match = stderrLine.match(/silence_end:\s*([\d.]+)/)
            if (match && firstSilenceEnd === 0) {
              firstSilenceEnd = parseFloat(match[1])
            }
          }
        })
        .on('error', () => resolve(0))
        .on('end', () => resolve(firstSilenceEnd))
        .run()
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GLOBAL ASS SUBTITLE GENERATION
  // ─────────────────────────────────────────────────────────────────────────

  private async generateGlobalASS(
    script: CompleteVideoScript,
    outputPath: string,
    options: VideoGenerationOptions
  ): Promise<void> {
    console.log(`[VideoAssembler] Generating global ASS subtitles...`)
    const allWordTimings: WordTiming[] = []
    let cumulativeOffsetMs = 0
    const hasGlobalAudio = !!options.globalAudioPath

    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i]
      const sceneDuration = scene.timeRange.end - scene.timeRange.start || 5
      let wordTimings = (scene as any).globalWordTimings || (scene as any).wordTimings || []

      if (wordTimings.length === 0 && scene.narration) {
        wordTimings = [
          {
            word: scene.narration,
            start: 0,
            end: sceneDuration,
            startMs: 0,
            durationMs: Math.round(sceneDuration * 1000)
          }
        ]
      }

      if (hasGlobalAudio) {
        const absoluteTimingsFromScene = (scene as any).globalWordTimings
        if (absoluteTimingsFromScene && absoluteTimingsFromScene.length > 0) {
          allWordTimings.push(...absoluteTimingsFromScene)
        } else {
          const sceneBaseTime = scene.timeRange.start
          const reconstructed = wordTimings.map((w: any) => ({
            ...w,
            start: w.start + sceneBaseTime,
            end: w.end + sceneBaseTime,
            startMs: Math.round((w.start + sceneBaseTime) * 1000),
            durationMs: w.durationMs
          }))
          allWordTimings.push(...reconstructed)
        }
      } else {
        const offsetTimings = wordTimings.map((w: any) => ({
          ...w,
          startMs: w.startMs + cumulativeOffsetMs,
          end: (w.end * 1000 + cumulativeOffsetMs) / 1000
        }))
        allWordTimings.push(...offsetTimings)
        cumulativeOffsetMs += Math.round(sceneDuration * 1000)
      }
    }

    const aspectRatio = options.aspectRatio || '16:9'
    const dimensions = aspectRatio === '9:16' ? [720, 1280] : aspectRatio === '1:1' ? [1080, 1080] : [1280, 720]
    const assService = new AssCaptionService(dimensions[0], dimensions[1], options.assCaptions)
    const assContent = assService.buildASSFile(allWordTimings)
    fs.writeFileSync(outputPath, assContent)
  }

  private getTransitionInDuration(sceneIndex: number, scenes: any[], scenesDir: string): number {
    if (sceneIndex === 0) return 0

    const prevScene = scenes[sceneIndex - 1]
    const suggested = prevScene.transition || 'cut'
    const tension = prevScene.tension || 5
    const transition = this.resolveTransition(suggested, tension)

    if (!transition || transition === 'cut' || transition === 'none') {
      return 0
    }

    const xf = this.getXfadeTransition(transition)
    return xf ? xf.duration : 0.04
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROCESS SCENE CLIP — orchestrates a single scene
  // ─────────────────────────────────────────────────────────────────────────

  private async processSceneClip(
    sceneIndex: number,
    script: CompleteVideoScript,
    scenesDir: string,
    animationMode: string,
    globalOptions: VideoGenerationOptions,
    hasGlobalAudio: boolean
  ): Promise<{ clipPath: string; transition: string | undefined }> {
    const scene = script.scenes[sceneIndex]
    const isLastScene = sceneIndex === script.scenes.length - 1
    const sceneDir = path.join(scenesDir, scene.id)
    const manifestPath = path.join(sceneDir, 'manifest.json')

    let sceneImageFilename = 'scene.webp'
    let aspectRatio = '16:9'
    let cameraAction: any
    let wordTimings: any[] = []
    let manifestData: any = {}

    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        manifestData = manifest
        sceneImageFilename = manifest.sceneImage || 'scene.webp'
        aspectRatio = manifest.aspectRatio || '16:9'
        cameraAction = manifest.cameraAction
        wordTimings = manifest.wordTimings || []
        const backgroundColor = manifest.backgroundColor || '#FFF'
        ;(scene as any).backgroundColor = backgroundColor
        ;(scene as any).wordTimings = wordTimings
        if (manifest.globalWordTimings) {
          ;(scene as any).globalWordTimings = manifest.globalWordTimings
        }
      } catch {
        /* ignore */
      }
    }

    const imagePath = path.join(sceneDir, sceneImageFilename)
    const audioPath = path.join(sceneDir, 'narration.mp3')
    const videoPath = path.join(sceneDir, 'animation.mp4')
    const clipOutputPath = path.join(sceneDir, 'clip.mp4')

    const scriptDuration = scene.timeRange ? scene.timeRange.end - scene.timeRange.start : 5
    const rawDuration = hasGlobalAudio ? scriptDuration : await this.getAudioDuration(audioPath).catch(() => 5)

    const transitionInDur = this.getTransitionInDuration(sceneIndex, script.scenes, scenesDir)
    const sceneTension: number = (scene as any).tension ?? 5

    const startPadding = 0
    const endPadding = 0

    let rawDurationWithPadding = rawDuration
    if (hasGlobalAudio && sceneIndex > 0) rawDurationWithPadding += transitionInDur

    const duration = rawDurationWithPadding

    try {
      const keywordVisualsJsonPath = path.join(sceneDir, 'keyword_visuals.json')
      const processedKeywordVisuals: Array<{ imagePath: string; start: number; end: number }> = []

      if (fs.existsSync(keywordVisualsJsonPath)) {
        try {
          const kvManifest = JSON.parse(fs.readFileSync(keywordVisualsJsonPath, 'utf8'))
          for (const kv of kvManifest) {
            const timing = this.getKeywordTiming(kv.keyword, wordTimings || [])
            if (timing) {
              processedKeywordVisuals.push({
                imagePath: kv.imagePath,
                start: timing.start + startPadding,
                end: timing.end + startPadding
              })
            }
          }
        } catch {
          /* ignore */
        }
      }

      const staticSeed = sceneIndex

      let finalAnimationMode = animationMode
      if (animationMode === 'panning' && duration < 3) {
        finalAnimationMode = 'static'
      }

      // ── Smart Cache Verification ──
      const imgMTime = this.getFileMTime(imagePath)
      const audioMTime = this.getFileMTime(audioPath)
      const kvMTime = this.getFileMTime(keywordVisualsJsonPath)
      const manifestMTime = this.getFileMTime(manifestPath)

      const hashData = {
        duration,
        animationMode: finalAnimationMode,
        cameraAction,
        wordTimings,
        sceneTension,
        backgroundColor: (scene as any).backgroundColor,
        globalOptions: {
          resolution: globalOptions.resolution,
          aspectRatio: globalOptions.aspectRatio,
          narrationVolume: globalOptions.narrationVolume
        },
        hasGlobalAudio,
        transitionInDur,
        imgMTime,
        audioMTime,
        kvMTime,
        manifestMTime
      }

      const cacheKey = crypto.createHash('md5').update(JSON.stringify(hashData)).digest('hex')
      const cacheFilePath = path.join(sceneDir, 'assembler_cache.json')

      if (fs.existsSync(cacheFilePath)) {
        try {
          const cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'))
          if (cache.hash === cacheKey && fs.existsSync(cache.clipPath)) {
            console.log(`[VideoAssembler] ⚡ Cache HIT for scene ${scene.id} (Hash: ${cacheKey.substring(0, 8)})`)
            const trans = this.resolveTransition((scene as any).transition, sceneTension)
            return { clipPath: cache.clipPath, transition: trans }
          }
        } catch {
          /* ignore */
        }
      }

      if (finalAnimationMode === 'ai' && fs.existsSync(videoPath)) {
        await this.processAiClip(videoPath, duration, clipOutputPath, aspectRatio, globalOptions.resolution)
      } else if (finalAnimationMode === 'static' || finalAnimationMode === 'none') {
        await this.createStaticClip(
          imagePath,
          duration,
          clipOutputPath,
          aspectRatio,
          globalOptions.resolution,
          (scene as any).backgroundColor,
          wordTimings,
          processedKeywordVisuals,
          staticSeed,
          sceneTension
        )
      } else if (finalAnimationMode === 'composition' && manifestData.layers?.length > 0) {
        const layers = manifestData.layers.map((l: any) => ({
          ...l,
          path: path.join(sceneDir, l.path)
        }))
        await this.createComposedClip(
          path.join(sceneDir, manifestData.sceneImage),
          layers,
          duration,
          clipOutputPath,
          aspectRatio,
          globalOptions.resolution,
          processedKeywordVisuals
        )
      } else {
        await this.createPanningClip(
          imagePath,
          duration,
          clipOutputPath,
          aspectRatio,
          globalOptions.resolution,
          (scene as any).backgroundColor,
          cameraAction,
          wordTimings,
          processedKeywordVisuals,
          sceneTension
        )
      }

      let finalClip = clipOutputPath

      if (fs.existsSync(audioPath) || hasGlobalAudio) {
        const mixedClipPath = path.join(sceneDir, 'clip_mixed.mp4')
        const soundscapeName = (scene as any).soundscape
        const soundscapePath = soundscapeName ? this.ambientService.resolveSoundscape(soundscapeName) : null
        const soundEffects = (scene as any).soundEffects || []

        await this.mixSceneAudio(
          clipOutputPath,
          audioPath,
          soundscapePath,
          soundEffects,
          mixedClipPath,
          duration,
          startPadding,
          sceneTension,
          hasGlobalAudio,
          globalOptions
        )
        finalClip = mixedClipPath
      }

      const useGlobalAss = !!globalOptions.globalAudioPath && globalOptions.assCaptions?.enabled !== false
      const captionsEnabled = globalOptions.assCaptions?.enabled !== false

      if (captionsEnabled && wordTimings.length > 0 && !useGlobalAss) {
        const clipWithTextPath = path.join(sceneDir, 'clip_with_text.mp4')
        try {
          const shiftedWordTimings = wordTimings.map((w) => {
            const start = (w.start || w.startMs / 1000) + startPadding
            const dur = w.durationMs / 1000
            return {
              ...w,
              start,
              end: start + dur,
              startMs: Math.round(start * 1000),
              durationMs: Math.round(dur * 1000)
            }
          })

          const resolution = this.getResolution(aspectRatio, globalOptions.resolution)
          const [width, height] = resolution.split('x').map(Number)
          const assService = new AssCaptionService(width, height, globalOptions.assCaptions)
          const assPath = path.join(sceneDir, 'subtitles.ass')
          fs.writeFileSync(assPath, assService.buildASSFile(shiftedWordTimings))

          const safePath = assPath.replaceAll('\\', '/').replaceAll(':', String.raw`\:`)
          await new Promise<void>((resolve, reject) => {
            ffmpeg(finalClip)
              .videoFilters(`ass='${safePath}'`)
              .outputOptions([
                '-c:v libx264',
                `-s ${resolution}`,
                '-pix_fmt yuv420p',
                '-c:a aac',
                '-map 0:v:0',
                '-map 0:a?',
                '-movflags +faststart'
              ])
              .save(clipWithTextPath)
              .on('end', () => resolve())
              .on('error', (err) => reject(err))
          })
          finalClip = clipWithTextPath
        } catch (error) {
          console.warn(`[VideoAssembler] ASS failed: ${error}`)
        }
      }

      const transition = this.resolveTransition((scene as any).transition, sceneTension)

      console.log(`[VideoAssembler] Scene ${scene.id} (tension=${sceneTension}) → transition="${transition}"`)

      // Save to cache
      fs.writeFileSync(cacheFilePath, JSON.stringify({ hash: cacheKey, clipPath: finalClip, transition }))

      return { clipPath: finalClip, transition }
    } catch (error) {
      console.error(`[VideoAssembler] Scene ${scene.id} failed:`, error)

      if (!fs.existsSync(clipOutputPath)) {
        console.warn(`[VideoAssembler] GENERATING EMERGENCY FALLBACK CLIP for scene ${scene.id} due to FFMPEG crash!`)
        try {
          const resPreset = globalOptions.resolution || '720p'
          const resolutionStr = this.getResolution(globalOptions.aspectRatio || '16:9', resPreset as string)
          const [bw, bh] = resolutionStr.split('x').map(Number)
          await new Promise<void>((resolve, reject) => {
            ffmpeg()
              .input(`color=c=black:s=${bw}x${bh}`)
              .inputFormat('lavfi')
              .duration(duration)
              .outputOptions(['-c:v libx264', '-preset ultrafast', '-pix_fmt yuv420p', `-r ${OUTPUT_FPS}`])
              .output(clipOutputPath)
              .on('end', () => resolve())
              .on('error', (e) => reject(e))
              .run()
          })
          console.log(`[VideoAssembler] Emergency fallback clip generated successfully!`)
        } catch (fbError) {
          console.error(`[VideoAssembler] Even the EMERGENCY fallback failed!`, fbError)
        }
      }
      return { clipPath: clipOutputPath, transition: undefined }
    }
  }
}
