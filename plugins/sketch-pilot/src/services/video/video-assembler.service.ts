import * as fs from 'node:fs'
import * as path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import { AmbientService } from '../audio/ambient.service'
import { MusicService } from '../audio/music.service'
import { SFXService } from '../audio/sfx.service'
import type { CompleteVideoScript, TextPosition, VideoGenerationOptions } from '../../types/video-script.types'
import type { WordTiming } from '../audio'
import { AssCaptionService } from './ass-caption.service'

const SCENE_PADDING_SECONDS = 0.2

/**
 * Internal FPS used by zoompan for sub-frame interpolation.
 * Higher value = smoother motion. FFmpeg resamples down to OUTPUT_FPS afterwards.
 * 60fps gives ~2.4x more interpolation steps vs 25fps → visibly smoother panning.
 */
const ZOOMPAN_INTERNAL_FPS = 60
/** Final output frame rate. */
const OUTPUT_FPS = 25
/** Upscale factor for the source image before zoompan. 2× is sufficient and faster than 4×. */
const ZOOMPAN_SCALE_FACTOR = 2

// ---------------------------------------------------------------------------
// SMOOTHERSTEP helpers (used in zoompan expressions)
// Smootherstep: 6t⁵ - 15t⁴ + 10t³  — starts slow, peaks, ends slow.
// In zoompan context `t` = on/totalFrames (normalised 0→1).
// We approximate it inline as a string expression for FFmpeg's math evaluator.
// ---------------------------------------------------------------------------

/**
 * Returns a smootherstep expression string for zoompan.
 * `p` should be a string expression evaluating to a value in [0,1].
 * smootherstep(p) = p*p*p*(p*(p*6-15)+10)
 */
function smootherstep(p: string): string {
  return `(${p})*(${p})*(${p})*((${p})*((${p})*6-15)+10)`
}

/**
 * Returns a cubic ease-in-out expression string for zoompan.
 * cubic_ease(p) = p<0.5 ? 4p³ : 1-(-2p+2)³/2
 * Approximated for FFmpeg: use smootherstep which is close enough and simpler.
 */
function cubicEaseInOut(p: string): string {
  return smootherstep(p)
}

export class VideoAssembler {
  private outputDir: string
  private musicService: MusicService
  private sfxService: SFXService
  private ambientService: AmbientService

  constructor() {
    this.outputDir = path.join(process.cwd(), 'output')
    this.musicService = new MusicService()
    this.sfxService = new SFXService()
    this.ambientService = new AmbientService()
  }

  /**
   * Assembles the final video from the script and generated assets.
   */
  async assembleVideo(
    script: CompleteVideoScript,
    scenesDir: string,
    projectDir: string,
    animationMode: 'panning' | 'ai' | 'composition' | 'static' | 'none',
    globalOptions: VideoGenerationOptions,
    onProgress?: (progress: number, message: string) => Promise<void>
  ): Promise<string> {
    const hasGlobalAudio = !!globalOptions.globalAudioPath
    console.log(`[VideoAssembler] Assembling video in ${animationMode} mode...`)
    const clips: string[] = []
    const transitions: (string | undefined)[] = []

    const sceneTasks = script.scenes.map((_, i) => i)
    const processedClips: string[] = Array.from({ length: script.scenes.length })
    const processedTransitions: (string | undefined)[] = Array.from({ length: script.scenes.length })

    // Parallel processing with concurrency limit
    const CONCURRENCY_LIMIT = 3
    for (let i = 0; i < sceneTasks.length; i += CONCURRENCY_LIMIT) {
      if (onProgress) {
        const p = Math.round((i / sceneTasks.length) * 35)
        await onProgress(p, `Assembling scene clips (${i}/${sceneTasks.length})...`)
      }
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
        })
      )
    }

    if (onProgress) await onProgress(40, 'Stitching scenes together...')

    const finalClips = processedClips.filter(Boolean)
    const finalTransitions = processedTransitions

    const finalVideoNoMusic = path.join(projectDir, 'final_video_no_music.mp4')
    const audioOverlap = hasGlobalAudio ? 0 : (globalOptions.audioOverlap ?? 0.3)
    await this.stitchClips(finalClips, finalVideoNoMusic, finalTransitions, audioOverlap)

    // --- GLOBAL AUDIO OVERLAY ---
    let finalVisualPath = finalVideoNoMusic
    if (hasGlobalAudio && fs.existsSync(globalOptions.globalAudioPath!)) {
      if (onProgress) await onProgress(55, 'Syncing global narration...')
      console.log(`[VideoAssembler] Overlaying global audio: ${globalOptions.globalAudioPath}`)
      const videoWithGlobalAudio = path.join(projectDir, 'final_video_with_global_audio.mp4')
      const narrationVol = globalOptions.narrationVolume ?? 1
      await new Promise<void>((resolve, reject) => {
        ffmpeg(finalVideoNoMusic)
          .input(globalOptions.globalAudioPath!)
          .complexFilter([`[1:a]volume=${narrationVol.toFixed(2)}[a_weighted]`])
          .outputOptions(['-c:v copy', '-map 0:v:0', '-map [a_weighted]', '-shortest'])
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

    // Apply visual professional polish
    if (onProgress) await onProgress(70, 'Applying cinematic polish...')
    const polishedVideoPath = path.join(projectDir, 'final_video_polished.mp4')
    finalVisualPath = await this.applyProfessionalPolish(finalVisualPath, polishedVideoPath, {
      ...globalOptions,
      globalAssPath
    })

    // Apply branding
    if (globalOptions.branding) {
      const brandedVideoPath = path.join(projectDir, 'final_video_branded.mp4')
      finalVisualPath = await this.applyBranding(finalVisualPath, globalOptions.branding, brandedVideoPath)
    }

    // Generate SRT Subtitles
    if (globalOptions.assCaptions?.enabled !== false) {
      const srtPath = path.join(projectDir, 'subtitles.srt')
      await this.generateSRT(script, srtPath)
      console.log(`[VideoAssembler] SRT subtitles exported to: ${srtPath}`)
    }

    // Add background music if requested
    const bgMusic = globalOptions.backgroundMusic || script.backgroundMusic
    if (bgMusic) {
      if (onProgress) await onProgress(90, 'Mixing background music...')
      const musicTrack = this.musicService.getTrackForMood(bgMusic)
      if (musicTrack) {
        const videoWithMusicPath = path.join(projectDir, 'final_video.mp4')
        const musicPath = this.musicService.getTrackPath(musicTrack.path)
        const musicVol = globalOptions.backgroundMusicVolume ?? 0.15
        return await this.addBackgroundMusic(finalVisualPath, musicPath, videoWithMusicPath, musicVol)
      }
    }

    const ultimatePath = path.join(projectDir, 'final_video.mp4')
    if (finalVisualPath !== ultimatePath && fs.existsSync(finalVisualPath)) {
      fs.renameSync(finalVisualPath, ultimatePath)
      return ultimatePath
    }

    return finalVisualPath
  }

  /**
   * Adds background music to the video.
   */
  async addBackgroundMusic(
    videoPath: string,
    musicPath: string,
    outputPath: string,
    volume: number = 0.1
  ): Promise<string> {
    console.log(`[VideoAssembler] Adding background music with volume ${volume}...`)
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

      ffmpeg()
        .input(videoPath)
        .input(musicPath)
        .complexFilter([
          `[0:a]asplit=2[voice_sc][voice_mix]`,
          `[1:a]volume=${volume}[music_raw]`,
          `[music_raw][voice_sc]sidechaincompress=threshold=0.03:ratio=10:attack=20:release=400:makeup=1[music_ducked]`,
          `[voice_mix][music_ducked]amix=inputs=2:duration=first[aout]`
        ])
        .outputOptions(['-c:v copy', '-map 0:v:0', '-map [aout]', '-shortest'])
        .save(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(new Error(`Background music addition failed: ${err.message}`)))
    })
  }

  /**
   * Applies sound effects to a scene with precise timing sync to animations
   */
  private async applySoundEffects(
    scenePath: string,
    soundEffects: Array<{
      type: string
      timestamp: number
      volume?: number
    }> = []
  ): Promise<string | null> {
    if (!soundEffects || soundEffects.length === 0) return null

    console.log(`[VideoAssembler] Applying ${soundEffects.length} sound effects to scene...`)

    const filterParts: string[] = []

    for (const [i, sfx] of soundEffects.entries()) {
      const sfxPath = this.sfxService.resolveSFX(sfx.type)
      if (!sfxPath || !fs.existsSync(sfxPath)) {
        console.warn(`[VideoAssembler] SFX not found: ${sfx.type}`)
        continue
      }

      const volAdjust = sfx.volume ?? 0.8
      const delayMs = Math.floor(sfx.timestamp * 1000)
      filterParts.push(`[${i + 1}:a]adelay=${delayMs}|${delayMs},volume=${volAdjust}[sfx${i}]`)
    }

    if (filterParts.length === 0) {
      console.warn(`[VideoAssembler] No valid SFX found`)
      return null
    }

    let mixInputs = '[0:a]'
    for (let i = 0; i < filterParts.length; i++) {
      mixInputs += `[sfx${i}]`
    }
    const mixCount = filterParts.length + 1
    filterParts.push(`${mixInputs}amix=inputs=${mixCount}:duration=first[aout]`)

    const filterChain = filterParts.join(';')

    return new Promise((resolve, reject) => {
      let cmd = ffmpeg(scenePath)

      const sfxPaths = soundEffects
        .map((sfx) => this.sfxService.resolveSFX(sfx.type))
        .filter((p) => p && fs.existsSync(p)) as string[]

      sfxPaths.forEach((p) => (cmd = cmd.input(p)))

      const tempPath = `${scenePath}.temp`
      cmd
        .complexFilter(filterChain)
        .outputOptions(['-map 0:v:0', '-map [aout]', '-c:v copy'])
        .on('error', (err) => {
          console.warn(`[VideoAssembler] SFX application failed: ${err.message}, skipping...`)
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
          resolve(null)
        })
        .on('end', () => {
          if (fs.existsSync(tempPath)) {
            fs.renameSync(tempPath, scenePath)
          }
          resolve(scenePath)
        })
        .save(tempPath)
    })
  }

  /**
   * Adds audio crossfade and fills silence gaps between clips
   */
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
    let audioOffset = durations[0] - crossfadeDuration

    for (let i = 1; i < clips.length; i++) {
      const outLabel = `[a${i}]`
      filterComplex += `${lastAudioLabel}[${i}:a]acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri${outLabel};`
      lastAudioLabel = outLabel
      audioOffset += durations[i] - crossfadeDuration
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

  /**
   * Applies professional visual polish: Vignette, Grain, Subtitles.
   */
  async applyProfessionalPolish(
    videoPath: string,
    outputPath: string,
    options?: VideoGenerationOptions & { globalAssPath?: string }
  ): Promise<string> {
    console.log(
      `[VideoAssembler] Applying professional visual polish (Vignette, Noise${options?.globalAssPath ? ', Subtitles' : ''})...`
    )

    const crf = options?.proEncoding?.crf ?? 20
    const preset = options?.proEncoding?.preset ?? 'superfast'
    const assPath = options?.globalAssPath

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .complexFilter([
          `vignette=angle=0.12[vignetted]`,
          `[vignetted]noise=alls=3:allf=t[polished]`,
          `[polished]eq=contrast=1.05:brightness=0.02[brightened]`,
          assPath
            ? `[brightened]ass='${assPath.replaceAll('\\', '/').replaceAll(':', String.raw`\:`)}'[outv]`
            : `[brightened]copy[outv]`
        ])
        .outputOptions(['-map [outv]', '-map 0:a?', '-c:v libx264', `-preset ${preset}`, `-crf ${crf}`, '-shortest'])
        .save(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => {
          console.error(`[VideoAssembler] Polish failed: ${err.message}`)
          resolve(videoPath)
        })
    })
  }

  /**
   * Applies branding (logo/watermark) to the video
   */
  async applyBranding(videoPath: string, config: any, outputPath: string): Promise<string> {
    console.log(`[VideoAssembler] Applying branding overlays...`)
    return new Promise((resolve, reject) => {
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

  /**
   * Generates a standard SRT file from script word timings
   */
  async generateSRT(script: CompleteVideoScript, outputPath: string): Promise<void> {
    let srtContent = ''
    let index = 1
    let cumulativeTime = 0

    for (const scene of script.scenes) {
      const sceneDir = path.join(process.cwd(), 'output', 'scenes', scene.id)
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

  /**
   * Applies camera effects (zoom-in, shake) to a video clip.
   */
  async applyCameraEffect(
    videoPath: string,
    cameraAction: { type: string; intensity: string },
    outputPath: string,
    aspectRatio: string = '16:9',
    resolutionPreset: string = '720p'
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const resolution = this.getResolution(aspectRatio, resolutionPreset)
      const [width, height] = resolution.split('x').map(Number)
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
        videoFilter = `zoompan=z='1.0+0.05*sin(2*pi*on/100)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${resolution}:fps=${ZOOMPAN_INTERNAL_FPS},fps=${OUTPUT_FPS}`
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

  /**
   * Builds mathematical expressions for FFmpeg zoompan filter based on word timings.
   *
   * IMPORTANT: In zoompan, the only available time variable is `on` (output frame number).
   * To reference seconds: use `on/${ZOOMPAN_INTERNAL_FPS}` — do NOT use `time` or `t`.
   * The brightExpr uses the `eq` filter which DOES support `t` (seconds) — kept as-is.
   */
  private buildAudioReactiveExpressions(
    wordTimings: any[],
    duration: number
  ): { zoomExpr: string; brightExpr: string } {
    if (!wordTimings || wordTimings.length === 0) return { zoomExpr: '', brightExpr: '' }

    const zoomPulses: string[] = []
    const brightFades: string[] = []
    let lastEnd = 0

    for (const [i, w] of wordTimings.entries()) {
      const startSec = w.startMs !== undefined ? w.startMs / 1000 : w.start
      const endSec = w.end
      const gap = startSec - lastEnd

      if (i === 0 || gap > 0.3) {
        zoomPulses.push(`0.02*exp(-pow((on/${ZOOMPAN_INTERNAL_FPS})-${startSec.toFixed(3)},2)*40)`)
      }

      if (gap > 0.4) {
        const pauseMid = (lastEnd + gap / 2).toFixed(3)
        brightFades.push(`-0.08*exp(-pow(t-${pauseMid},2)*25)`)
      }

      lastEnd = endSec
    }

    return {
      zoomExpr: zoomPulses.length > 0 ? `+${zoomPulses.join('+')}` : '',
      brightExpr: brightFades.length > 0 ? `eq=brightness='${brightFades.join('+')}',` : ''
    }
  }

  // ---------------------------------------------------------------------------
  // NEW: Snap-zoom expression builder
  // Generates a zoompan z-expression that holds at baseZoom, then snaps brutally
  // to peakZoom at `snapAtSec` seconds, then eases back over `decaySec` seconds.
  // Useful for beat-sync moments and emphasis on key words.
  // ---------------------------------------------------------------------------

  /**
   * Builds a snap-zoom z-expression for zoompan.
   * @param baseZoom    Resting zoom level (e.g. 1.0)
   * @param peakZoom    Peak zoom level at snap moment (e.g. 1.4)
   * @param snapAtSec   When (in seconds) the snap fires
   * @param decaySec    How long (seconds) to ease back to baseZoom after peak
   */
  private buildSnapZoomExpression(
    baseZoom: number,
    peakZoom: number,
    snapAtSec: number,
    decaySec: number = 0.4
  ): string {
    const delta = peakZoom - baseZoom
    // After the snap: decay = delta * exp(-k * (t - snapAt)) where k controls speed
    const k = 8 / decaySec
    const snapFrame = Math.round(snapAtSec * ZOOMPAN_INTERNAL_FPS)
    // Use max(0, t-snapAt) to avoid affecting frames before the snap
    return (
      `${baseZoom}+` +
      `if(gte(on,${snapFrame}),` +
      `${delta.toFixed(4)}*exp(-${k.toFixed(4)}*(on/${ZOOMPAN_INTERNAL_FPS}-${snapAtSec.toFixed(3)})),` +
      `0` +
      `)`
    )
  }

  // ---------------------------------------------------------------------------
  // NEW: Organic micro-movement expression builder
  // Overlays a gentle sinusoidal oscillation on x/y to simulate handheld feel.
  // Keeps the camera alive even on static/slow shots.
  // ---------------------------------------------------------------------------

  /**
   * Builds x/y oscillation expressions for organic micro-movement.
   * Combines two sin waves at different frequencies for a non-periodic feel.
   * @param ampPx   Amplitude in source-image pixels (before zoompan scaling)
   * @param seed    Small integer to vary the phase per scene (0-99)
   */
  private buildOrganicOscillation(ampPx: number = 6, seed: number = 0): { xOscExpr: string; yOscExpr: string } {
    // Two overlapping sine waves — different frequencies and phases
    const phase1 = (seed * 1.3) % (2 * Math.PI)
    const phase2 = (seed * 2.7 + 1.1) % (2 * Math.PI)
    const p1 = phase1.toFixed(3)
    const p2 = phase2.toFixed(3)
    const amp = ampPx.toFixed(1)
    // t in zoompan = on/ZOOMPAN_INTERNAL_FPS
    const t = `(on/${ZOOMPAN_INTERNAL_FPS})`
    const xOscExpr = `${amp}*sin(0.37*2*PI*${t}+${p1})+${amp}*0.4*sin(0.91*2*PI*${t}+${p2})`
    const yOscExpr = `${amp}*sin(0.29*2*PI*${t}+${p1})+${amp}*0.4*cos(0.73*2*PI*${t}+${p2})`
    return { xOscExpr, yOscExpr }
  }

  // ---------------------------------------------------------------------------
  // NEW: Dutch tilt (rotation) via FFmpeg rotate filter
  // Applies a subtle constant rotation to create narrative tension.
  // Combined with panning for max cinematic effect.
  // ---------------------------------------------------------------------------

  /**
   * Applies a Dutch tilt rotation to an existing video clip.
   * The rotation slowly oscillates (if oscillate=true) or stays fixed.
   * @param inputPath   Source clip path
   * @param outputPath  Destination path
   * @param angleDeg    Peak rotation angle in degrees (positive = clockwise)
   * @param oscillate   If true, angle sways back and forth sinusoidally
   * @param duration    Clip duration in seconds (needed for oscillation period)
   */
  async applyDutchTilt(
    inputPath: string,
    outputPath: string,
    angleDeg: number = 1.8,
    oscillate: boolean = false,
    duration: number = 5
  ): Promise<string> {
    return new Promise((resolve) => {
      const angleRad = (angleDeg * Math.PI) / 180
      // oscillate: angle = A * sin(2π*t/T) where T = duration, so one full swing
      const rotExpr = oscillate ? `${angleRad.toFixed(4)}*sin(2*PI*t/${duration.toFixed(2)})` : `${angleRad.toFixed(4)}`

      ffmpeg(inputPath)
        .videoFilter(
          // fillcolor=black fills the corners exposed by rotation
          `rotate='${rotExpr}':fillcolor=black@0:ow=iw:oh=ih`
        )
        .outputOptions(['-c:v libx264', '-preset fast', '-crf 18', '-c:a copy', '-pix_fmt yuv420p'])
        .save(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => {
          console.warn(`[VideoAssembler] Dutch tilt failed: ${err.message}, skipping...`)
          resolve(inputPath)
        })
    })
  }

  // ---------------------------------------------------------------------------
  // IMPROVED: createPanningClip
  // Changes vs original:
  //   1. Smootherstep curve replaces the bare cubic p³ → proper ease-in-out
  //   2. Zoom + pan simultaneous combos: 'zoom-in-pan-right', etc.
  //   3. Snap-zoom type: brutal zoom on a specific timestamp
  //   4. Organic micro-oscillation added to x/y for handheld feel
  //   5. `seed` parameter for reproducible-but-varied effect selection
  //   6. Narrative direction awareness: pan direction can be forced by caller
  // ---------------------------------------------------------------------------

  /**
   * Creates a video clip from an image with a zoom/pan effect (Ken Burns) and audio-reactive dynamics.
   *
   * Supported cameraAction.type values:
   *   Original: 'zoom-out' | 'zoom-in' | 'pan-right' | 'pan-left' | 'pan-down' | 'pan-up'
   *   New:      'zoom-in-pan-right' | 'zoom-in-pan-left' | 'zoom-in-pan-up' | 'zoom-in-pan-down'
   *             'zoom-out-pan-right' | 'zoom-out-pan-left'
   *             'snap-zoom'   — brutal zoom at snapAtSec (default: duration/3)
   *             'dutch-tilt'  — gentle rotation overlay (post-process)
   *             'breathing'   — sinusoidal zoom pulse (unchanged)
   *             'shake'       — handheld shake (unchanged)
   *
   * cameraAction extended fields:
   *   snapAtSec?: number    — for snap-zoom: when to fire (default duration/3)
   *   peakZoom?:  number    — for snap-zoom: how far to zoom (default 1.5)
   *   seed?:      number    — integer for deterministic variation (0-99)
   *   organic?:   boolean   — add micro-oscillation to x/y (default true for viral modes)
   *   tiltDeg?:   number    — for dutch-tilt: angle in degrees (default 1.8)
   */
  async createPanningClip(
    imagePath: string,
    duration: number,
    outputPath: string,
    aspectRatio: string = '16:9',
    resolutionPreset: string = '720p',
    backgroundColor?: string,
    cameraAction?: {
      type: string
      intensity?: string
      duration?: number
      snapAtSec?: number
      peakZoom?: number
      seed?: number
      organic?: boolean
      tiltDeg?: number
    },
    wordTimings: any[] = [],
    keywordVisuals: Array<{ imagePath: string; start: number; end: number }> = []
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const resolution = this.getResolution(aspectRatio, resolutionPreset)
      const [w, h] = resolution.split('x').map(Number)

      const internalFrameCount = Math.round(duration * ZOOMPAN_INTERNAL_FPS)

      const reactive = this.buildAudioReactiveExpressions(wordTimings, duration)

      // Normalised progress in [0,1] — used for smootherstep expressions
      const rawP = `(on/${internalFrameCount})`
      // Clamp to [0,1] to avoid overshoot on last frames
      const P = `min(1,max(0,${rawP}))`
      const SS = smootherstep(P) // smootherstep: ease-in AND ease-out

      // Organic oscillation (off by default unless cameraAction.organic=true or snap/dutch modes)
      const wantsOrganic =
        cameraAction?.organic === true || cameraAction?.type === 'snap-zoom' || cameraAction?.type === 'dutch-tilt'
      const oscSeed = cameraAction?.seed ?? 0
      const { xOscExpr, yOscExpr } = this.buildOrganicOscillation(4, oscSeed)

      let zBaseExpr = '1.0+0.002*(on/2.4)' // default: very slow linear zoom
      let x = `iw/2-(iw/zoom/2)${wantsOrganic ? `+(${xOscExpr})` : ''}`
      let y = `ih/2-(ih/zoom/2)${wantsOrganic ? `+(${yOscExpr})` : ''}`

      const type = cameraAction?.type ?? ''

      // ------------------------------------------------------------------
      // Existing single-axis effects — upgraded to smootherstep
      // ------------------------------------------------------------------
      if (type === 'zoom-out') {
        zBaseExpr = `1.5-(0.5*${SS})`
      } else if (type === 'zoom-in') {
        zBaseExpr = `1.0+(0.5*${SS})`
      } else if (type === 'pan-right') {
        zBaseExpr = '1.4'
        x = `(iw/2-(iw/zoom/2))+((iw-(iw/zoom))/2)*${SS}${wantsOrganic ? `+(${xOscExpr})` : ''}`
      } else if (type === 'pan-left') {
        zBaseExpr = '1.4'
        x = `(iw/2-(iw/zoom/2))-((iw-(iw/zoom))/2)*${SS}${wantsOrganic ? `+(${xOscExpr})` : ''}`
      } else if (type === 'pan-down') {
        zBaseExpr = '1.4'
        y = `(ih/2-(ih/zoom/2))+((ih-(ih/zoom))/2)*${SS}${wantsOrganic ? `+(${yOscExpr})` : ''}`
      } else if (type === 'pan-up') {
        zBaseExpr = '1.4'
        y = `(ih/2-(ih/zoom/2))-((ih-(ih/zoom))/2)*${SS}${wantsOrganic ? `+(${yOscExpr})` : ''}`

        // ------------------------------------------------------------------
        // NEW: Zoom + Pan simultaneous combos
        // Zoom grows from 1.0→1.5 via smootherstep while panning in the
        // chosen direction. The pan travel is proportional to the zoom delta
        // so the focus point stays roughly centred until the end.
        // ------------------------------------------------------------------
      } else if (type === 'zoom-in-pan-right') {
        zBaseExpr = `1.0+(0.5*${SS})`
        x = `(iw/2-(iw/zoom/2))+((iw-(iw/zoom))/2)*${SS}${wantsOrganic ? `+(${xOscExpr})` : ''}`
      } else if (type === 'zoom-in-pan-left') {
        zBaseExpr = `1.0+(0.5*${SS})`
        x = `(iw/2-(iw/zoom/2))-((iw-(iw/zoom))/2)*${SS}${wantsOrganic ? `+(${xOscExpr})` : ''}`
      } else if (type === 'zoom-in-pan-up') {
        zBaseExpr = `1.0+(0.5*${SS})`
        y = `(ih/2-(ih/zoom/2))-((ih-(ih/zoom))/2)*${SS}${wantsOrganic ? `+(${yOscExpr})` : ''}`
      } else if (type === 'zoom-in-pan-down') {
        zBaseExpr = `1.0+(0.5*${SS})`
        y = `(ih/2-(ih/zoom/2))+((ih-(ih/zoom))/2)*${SS}${wantsOrganic ? `+(${yOscExpr})` : ''}`
      } else if (type === 'zoom-out-pan-right') {
        zBaseExpr = `1.5-(0.5*${SS})`
        x = `(iw/2-(iw/zoom/2))+((iw-(iw/zoom))/2)*${SS}${wantsOrganic ? `+(${xOscExpr})` : ''}`
      } else if (type === 'zoom-out-pan-left') {
        zBaseExpr = `1.5-(0.5*${SS})`
        x = `(iw/2-(iw/zoom/2))-((iw-(iw/zoom))/2)*${SS}${wantsOrganic ? `+(${xOscExpr})` : ''}`

        // ------------------------------------------------------------------
        // NEW: Snap-zoom
        // Holds near base zoom, then snaps brutally to peakZoom at snapAtSec,
        // then exponentially decays back. Perfect for beat-sync emphasis.
        // ------------------------------------------------------------------
      } else if (type === 'snap-zoom') {
        const snapAt = cameraAction?.snapAtSec ?? duration / 3
        const peak = cameraAction?.peakZoom ?? 1.5
        zBaseExpr = this.buildSnapZoomExpression(1, peak, snapAt, 0.35)
        // Also snap the x/y centring slightly to add punch
        x = `iw/2-(iw/zoom/2)${wantsOrganic ? `+(${xOscExpr})` : ''}`
        y = `ih/2-(ih/zoom/2)${wantsOrganic ? `+(${yOscExpr})` : ''}`

        // ------------------------------------------------------------------
        // Unchanged: breathing, dutch-tilt (post-processed), shake
        // ------------------------------------------------------------------
      } else if (type === 'breathing') {
        zBaseExpr = `1.0+0.05*sin(2*PI*(on/${ZOOMPAN_INTERNAL_FPS})/${duration.toFixed(2)})`
      } else if (type === 'dutch-tilt') {
        // Dutch tilt is applied as a post-process after zoompan.
        // Here we use a gentle slow zoom as the base motion.
        zBaseExpr = `1.0+(0.08*${SS})`
        x = `iw/2-(iw/zoom/2)+(${xOscExpr})`
        y = `ih/2-(ih/zoom/2)+(${yOscExpr})`
      } else if (type === 'shake') {
        const shakePx = cameraAction?.intensity === 'high' ? 12 : cameraAction?.intensity === 'medium' ? 7 : 4
        zBaseExpr = '1.15'
        x = `iw/2-(iw/zoom/2)+${shakePx}*sin(on*1.3)+(${xOscExpr})`
        y = `ih/2-(ih/zoom/2)+${shakePx}*cos(on*0.9)+(${yOscExpr})`
      }

      const zExpr = `${zBaseExpr}${reactive.zoomExpr}`

      const scW = w * ZOOMPAN_SCALE_FACTOR
      const scH = h * ZOOMPAN_SCALE_FACTOR
      const filterString = [
        `scale=${scW}:${scH}:force_original_aspect_ratio=increase`,
        `crop=${scW}:${scH}`,
        `${reactive.brightExpr}zoompan=z='${zExpr}':d=${internalFrameCount}:x='${x}':y='${y}':s=${w}x${h}:fps=${ZOOMPAN_INTERNAL_FPS}`,
        `fps=${OUTPUT_FPS}`,
        `scale=${w}:${h}:flags=lanczos`
      ].join(',')

      const ffmpegCommand = ffmpeg().input(imagePath).inputOptions(['-loop 1'])

      if (keywordVisuals.length > 0) {
        let lastOutput = '[v_base]'
        let complexFilter = `[0:v]${filterString}[v_base];`

        keywordVisuals.forEach((kv, idx) => {
          ffmpegCommand.input(kv.imagePath).inputOptions(['-loop 1'])
          const inputIdx = idx + 1
          const nextOutput = `[v_kv_${idx}]`
          complexFilter += `[${inputIdx}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[kv_s_${idx}];`
          complexFilter += `${lastOutput}[kv_s_${idx}]overlay=enable='between(t,${kv.start},${kv.end})'${idx === keywordVisuals.length - 1 ? '' : nextOutput};`
          lastOutput = nextOutput
        })

        ffmpegCommand.complexFilter(complexFilter)
      } else {
        ffmpegCommand.outputOptions(['-vf', filterString])
      }

      const baseOutputPath = outputPath
      const needsDutchTiltPass = type === 'dutch-tilt'
      const intermediateOutputPath = needsDutchTiltPass ? outputPath.replace('.mp4', '_pre_tilt.mp4') : outputPath

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
        .save(intermediateOutputPath)
        .on('end', async () => {
          if (needsDutchTiltPass) {
            const tiltDeg = cameraAction?.tiltDeg ?? 1.8
            const finalPath = await this.applyDutchTilt(
              intermediateOutputPath,
              baseOutputPath,
              tiltDeg,
              true, // oscillate
              duration
            )
            resolve(finalPath)
          } else {
            resolve(intermediateOutputPath)
          }
        })
        .on('error', (err) => reject(new Error(`Panning clip creation failed: ${err.message}`)))
    })
  }

  /**
   * Creates a composed video clip from multiple layers with entry animations.
   */
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

          filterChain += `[${inputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[${kvInputLabel}];`
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

  // ---------------------------------------------------------------------------
  // IMPROVED: createStaticClip
  // Changes vs original:
  //   1. Smootherstep replaces raw `on/N` linear ramps → ease-in-out on all 6 effects
  //   2. `seed` parameter separates image hash from temporal variation
  //      so the same image can get different effects across re-generations
  //   3. Organic micro-oscillation on x/y for all effects
  //   4. Diagonal Ken Burns effect added (effect index 6 & 7)
  // ---------------------------------------------------------------------------

  /**
   * Creates a static clip with Ken Burns effects and audio-reactive dynamics.
   *
   * @param seed  Optional integer to vary effect selection independently of imagePath.
   *              Pass a different value each time to avoid always getting the same effect.
   */
  async createStaticClip(
    imagePath: string,
    duration: number,
    outputPath: string,
    aspectRatio: string = '16:9',
    resolutionPreset: string = '720p',
    backgroundColor?: string,
    wordTimings: any[] = [],
    keywordVisuals: Array<{ imagePath: string; start: number; end: number }> = [],
    seed?: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const resolution = this.getResolution(aspectRatio, resolutionPreset)
      const [width, height] = resolution.split('x').map(Number)

      const reactive = this.buildAudioReactiveExpressions(wordTimings, duration)

      const internalFrameCount = Math.round(duration * ZOOMPAN_INTERNAL_FPS)

      // Normalised progress for smootherstep
      const P = `min(1,max(0,(on/${internalFrameCount})))`
      const SS = smootherstep(P)

      let baseZ = '1.0'
      let baseX = 'iw/2-(iw/zoom/2)'
      let baseY = 'ih/2-(ih/zoom/2)'

      // ----- FIX: separate hash from seed so re-generations can vary -----
      let hash = 0
      for (let i = 0; i < imagePath.length; i++) {
        hash = imagePath.charCodeAt(i) + ((hash << 5) - hash)
      }
      // XOR with seed so passing a different seed picks a different effect
      // even for the same image file. Falls back to duration-based variation
      // when seed is undefined (backwards-compatible).
      const seedValue = seed !== undefined ? seed : Math.floor(duration * 1000)
      hash = Math.abs(hash ^ seedValue)

      // Expanded from 6 to 8 effects — added two diagonal Ken Burns variants
      const effectIndex = hash % 8

      const zoomIntensity = 1.05
      const dz = (zoomIntensity - 1).toFixed(3)
      const panIntensity = 1.15

      // Organic micro-oscillation for all static effects
      const oscSeed = hash % 99
      const { xOscExpr, yOscExpr } = this.buildOrganicOscillation(5, oscSeed)

      switch (effectIndex) {
        case 0: // Slow zoom-in (ease-in-out)
          baseZ = `1.0+(${dz}*${SS})`
          break
        case 1: // Slow zoom-out (ease-in-out)
          baseZ = `${zoomIntensity}-(${dz}*${SS})`
          break
        case 2: // Pan right (ease-in-out)
          baseZ = `${panIntensity}`
          baseX = `(iw-(iw/zoom))*(${SS})`
          baseY = `ih/2-(ih/zoom/2)`
          break
        case 3: // Pan left (ease-in-out)
          baseZ = `${panIntensity}`
          baseX = `(iw-(iw/zoom))*(1-(${SS}))`
          baseY = `ih/2-(ih/zoom/2)`
          break
        case 4: // Pan down (ease-in-out)
          baseZ = `${panIntensity}`
          baseX = `iw/2-(iw/zoom/2)`
          baseY = `(ih-(ih/zoom))*(${SS})`
          break
        case 5: // Pan up (ease-in-out)
          baseZ = `${panIntensity}`
          baseX = `iw/2-(iw/zoom/2)`
          baseY = `(ih-(ih/zoom))*(1-(${SS}))`
          break
        // --- NEW: Diagonal Ken Burns (zoom + pan simultaneously) ---
        case 6: // Zoom-in + pan toward top-right corner
          baseZ = `1.0+(0.2*${SS})`
          baseX = `(iw/2-(iw/zoom/2))+((iw-(iw/zoom))/2)*(${SS})`
          baseY = `(ih/2-(ih/zoom/2))-((ih-(ih/zoom))/2)*(${SS})`
          break
        case 7: // Zoom-in + pan toward bottom-left corner
          baseZ = `1.0+(0.2*${SS})`
          baseX = `(iw/2-(iw/zoom/2))-((iw-(iw/zoom))/2)*(${SS})`
          baseY = `(ih/2-(ih/zoom/2))+((ih-(ih/zoom))/2)*(${SS})`
          break
      }

      // Add organic oscillation on top of all effects
      const zExpr = `${baseZ}${reactive.zoomExpr}`
      const x = `${baseX}+(${xOscExpr})`
      const y = `${baseY}+(${yOscExpr})`

      const scW = width * ZOOMPAN_SCALE_FACTOR
      const scH = height * ZOOMPAN_SCALE_FACTOR
      const filterString = [
        `scale=${scW}:${scH}:force_original_aspect_ratio=increase`,
        `crop=${scW}:${scH}`,
        `${reactive.brightExpr}zoompan=z='${zExpr}':d=${internalFrameCount}:x='${x}':y='${y}':s=${width}x${height}:fps=${ZOOMPAN_INTERNAL_FPS}`,
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
          const overlayOutput = idx === keywordVisuals.length - 1 ? '[outv]' : `[v_kv_${idx}]`

          complexFilterParts.push(
            `[${inputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}${kvScaled}`
          )
          complexFilterParts.push(
            `${lastOutput}${kvScaled}overlay=enable='between(t,${kv.start},${kv.end})'${overlayOutput}`
          )

          lastOutput = overlayOutput
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

  /**
   * Resolves the start/end timing for a keyword or phrase in the narration.
   */
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

  /**
   * Processes an AI video clip to match the target duration and format.
   */
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

  private normalizeColor(color: string | undefined): string {
    if (!color) return 'white'

    const colorName = color.toLowerCase().trim()
    const validColors = ['white', 'black', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'transparent']
    if (validColors.includes(colorName)) {
      return colorName
    }

    let hex = colorName.replace('#', '')
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('')
    }
    if (/^[0-9A-F]{6}$/i.test(hex)) {
      return `0x${hex}`
    }
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

  private buildTempoFilterChain(tempoRatio: number): string {
    const MIN_TEMPO = 0.5
    const MAX_TEMPO = 2
    const TEMPO_EPSILON = 0.01

    if (Math.abs(tempoRatio - 1) < TEMPO_EPSILON) return ''

    if (tempoRatio >= MIN_TEMPO && tempoRatio <= MAX_TEMPO) {
      return `atempo=${tempoRatio.toFixed(4)}`
    }

    const filters: string[] = []
    let remaining = tempoRatio

    if (tempoRatio < MIN_TEMPO) {
      while (remaining < MIN_TEMPO && filters.length < 10) {
        filters.push(`atempo=${MIN_TEMPO.toFixed(4)}`)
        remaining /= MIN_TEMPO
      }
      if (Math.abs(remaining - 1) > TEMPO_EPSILON && remaining >= MIN_TEMPO && remaining <= MAX_TEMPO) {
        filters.push(`atempo=${remaining.toFixed(4)}`)
      }
    } else {
      while (remaining > MAX_TEMPO && filters.length < 10) {
        filters.push(`atempo=${MAX_TEMPO.toFixed(4)}`)
        remaining /= MAX_TEMPO
      }
      if (Math.abs(remaining - 1) > TEMPO_EPSILON && remaining >= MIN_TEMPO && remaining <= MAX_TEMPO) {
        filters.push(`atempo=${remaining.toFixed(4)}`)
      }
    }

    return filters.join(',')
  }

  private getAtempoRate(tension: number): number {
    if (tension <= 2) return 0.88
    if (tension <= 4) return 0.94
    if (tension <= 6) return 1
    if (tension <= 8) return 1.08
    return 1.16
  }

  /**
   * Advanced mixing of narration, soundscapes, and SFX with intelligent ducking.
   */
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
    const atempoRate = this.getAtempoRate(tension)

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
      `[VideoAssembler] Mixing audio | tension: ${tension} | atempo: ${atempoRate.toFixed(2)}x | ambVol: ${ambientBaseVolume} | duck ratio: ${duckingRatio}`
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

      const hasSoundscape = soundscapePath && fs.existsSync(soundscapePath)
      let ambInputStr = ''
      if (hasSoundscape) {
        cmd.input(soundscapePath!).inputOptions(['-stream_loop', '-1'])
        ambInputStr = `[${currentInputIndex}:a]`
        currentInputIndex++
      }

      const activeSFX: Array<{ path: string; timestamp: number; volume: number }> = []
      const sfxStartIndex = currentInputIndex
      for (const sfx of soundEffects) {
        const sfxPath = this.sfxService.resolveSFX(sfx.type)
        if (sfxPath && fs.existsSync(sfxPath)) {
          cmd.input(sfxPath)
          activeSFX.push({
            path: sfxPath,
            timestamp: sfx.timestamp,
            volume: (sfx.volume ?? 0.8) * narrVol
          })
          currentInputIndex++
        }
      }

      const filterParts: string[] = []
      const delayMs = Math.floor(startPadding * 1000)
      let currentAudioLabel = ''

      if (!skipNarration && hasNarration) {
        if (hasSoundscape) {
          filterParts.push(
            `[1:a]adelay=${delayMs}|${delayMs},atempo=${atempoRate.toFixed(4)},volume=${narrVol.toFixed(2)},asplit=2[narr_sc][narr_mix]`
          )
        } else {
          filterParts.push(
            `[1:a]adelay=${delayMs}|${delayMs},atempo=${atempoRate.toFixed(4)},volume=${narrVol.toFixed(2)}[narr]`
          )
          currentAudioLabel = '[narr]'
        }
      }

      if (hasSoundscape) {
        filterParts.push(`${ambInputStr}volume=${ambientBaseVolume}[amb_vol]`)

        if (skipNarration || !hasNarration) {
          currentAudioLabel = '[amb_vol]'
        } else {
          filterParts.push(
            `[amb_vol][narr_sc]sidechaincompress=threshold=0.02:ratio=${duckingRatio}:attack=15:release=500:makeup=1.1[amb_ducked]`
          )
          filterParts.push(`[narr_mix][amb_ducked]amix=inputs=2:duration=first[mixed_base]`)
          currentAudioLabel = '[mixed_base]'
        }
      } else if (skipNarration || !hasNarration) {
        filterParts.push(`aevalsrc=0:c=stereo:s=44100:d=${duration}[silent_base]`)
        currentAudioLabel = '[silent_base]'
      }

      if (activeSFX.length > 0) {
        const sfxLabels: string[] = []
        for (const [i, element] of activeSFX.entries()) {
          const sfxInputIdx = sfxStartIndex + i
          const sfxDelayMs = Math.floor(element.timestamp * 1000)
          const sfxLabel = `[sfx${i}]`
          filterParts.push(`[${sfxInputIdx}:a]adelay=${sfxDelayMs}|${sfxDelayMs},volume=${element.volume}${sfxLabel}`)
          sfxLabels.push(sfxLabel)
        }

        const mixInputs = `${currentAudioLabel}${sfxLabels.join('')}`
        const mixCount = sfxLabels.length + 1
        filterParts.push(`${mixInputs}amix=inputs=${mixCount}:duration=first[final_a]`)
        currentAudioLabel = '[final_a]'
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

  /**
   * Public wrapper for simple audio muxing.
   */
  public async muxAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    duration: number,
    delayMs: number = 600
  ): Promise<string> {
    return this.mixSceneAudio(videoPath, audioPath, null, [], outputPath, duration, delayMs / 1000)
  }

  private resolveTransition(suggested: string | undefined, tension: number, useAuto: boolean): string {
    return 'cut'
  }

  private getXfadeTransition(
    type: string | undefined,
    maxAllowedDuration?: number
  ): { name: string; duration: number } | null {
    const map: Record<string, { name: string; duration: number }> = {
      fade: { name: 'fade', duration: 0.6 },
      'slide-left': { name: 'slideleft', duration: 0.5 },
      'slide-right': { name: 'slideright', duration: 0.5 },
      'slide-up': { name: 'slideup', duration: 0.5 },
      'slide-down': { name: 'slidedown', duration: 0.5 },
      wipe: { name: 'wipeleft', duration: 0.6 },
      'zoom-in': { name: 'circleopen', duration: 0.6 },
      pop: { name: 'fadeblack', duration: 0.4 },
      swish: { name: 'smoothleft', duration: 0.4 }
    }
    if (!type || type === 'cut' || type === 'none') return null

    const transition = map[type] || { name: 'fade', duration: 0.5 }

    if (maxAllowedDuration !== undefined && transition.duration > maxAllowedDuration) {
      transition.duration = maxAllowedDuration
    }

    return transition
  }

  private getClipDuration(clipPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(clipPath, (err, metadata) => {
        if (err) return reject(err)
        resolve(metadata.format.duration || 5)
      })
    })
  }

  /**
   * Stitches multiple video clips together with optional xfade transitions.
   */
  async stitchClips(
    clips: string[],
    outputPath: string,
    transitions: (string | undefined)[] = [],
    audioOverlap: number = 0.3
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
      return this.stitchClipsSimple(clips, outputPath)
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

    const swishPath = this.sfxService.getSFXPath('swish')
    const hasSwish = swishPath && fs.existsSync(swishPath)
    if (hasSwish) {
      for (let i = 1; i < clips.length; i++) {
        command.input(swishPath)
      }
    }

    let filterComplex = ''
    const n = clips.length

    let inputCounter = 0
    const clipLabels: string[] = []
    const audioLabels: string[] = []

    for (let i = 0; i < n; i++) {
      const vLabel = `[v_in_${i}]`
      const aLabel = `[a_in_${i}]`
      if (hasAudio[i]) {
        filterComplex += `[${inputCounter}:v]null${vLabel};`
        filterComplex += `[${inputCounter}:a]aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=44100${aLabel};`
        inputCounter++
      } else {
        filterComplex += `[${inputCounter}:v]null${vLabel};`
        filterComplex += `[${inputCounter + 1}:a]atrim=duration=${durations[i]},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=44100${aLabel};`
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
      const transition = this.getXfadeTransition(transitions[i - 1], maxSafeOverlap)

      const transitionDuration = transition ? transition.duration : 0.04
      const transitionName = transition ? transition.name : 'fade'

      const maxPossibleOverlap = Math.min(durations[i - 1], durations[i]) - 0.05
      const effectiveOverlap = Math.min(Math.max(transitionDuration, audioOverlap), Math.max(0.01, maxPossibleOverlap))
      const offset = Number(Math.max(0.01, cumulativeOffset + durations[i - 1] - effectiveOverlap).toFixed(3))

      const safeTransitionDuration = Math.max(0.04, Math.min(transitionDuration, offset * 0.8))

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
      const incomingTransitionType = transitions[i - 1]
      const transition = this.getXfadeTransition(incomingTransitionType, maxSafeOverlap)

      const transitionDuration = transition ? transition.duration : 0.04
      const maxPossibleOverlap = Math.min(durations[i - 1], durations[i]) - 0.1
      const effectiveAudioOverlap = Math.min(
        Math.max(transitionDuration, audioOverlap),
        Math.max(0.01, maxPossibleOverlap)
      )

      const offset =
        i === 1
          ? durations[0] - effectiveAudioOverlap
          : audioCumulativeOffset + durations[i - 1] - effectiveAudioOverlap

      const safeOffset = Math.max(0.01, offset)
      const outLabel = `[a_out_${i}]`
      filterComplex += `${lastAudioLabel}${audioLabels[i]}acrossfade=d=${effectiveAudioOverlap.toFixed(3)}:c1=tri:c2=tri${outLabel};`
      lastAudioLabel = outLabel

      if (i === 1) {
        audioCumulativeOffset = durations[0] - effectiveAudioOverlap
      } else {
        audioCumulativeOffset += durations[i - 1] - effectiveAudioOverlap
      }
    }

    if (hasSwish && n > 1) {
      const sfxStartIndex = inputCounter
      let sfxMixLabel = lastAudioLabel
      for (let i = 1; i < n; i++) {
        const sfxLabel = `[swish_${i}]`
        const outLabel = `[a_swish_mix_${i}]`
        const sfxOffsetMs = Math.round(transitionOffsets[i - 1] * 1000)
        filterComplex += `[${sfxStartIndex + i - 1}:a]adelay=${sfxOffsetMs}|${sfxOffsetMs},volume=0.4${sfxLabel};`
        filterComplex += `${sfxMixLabel}${sfxLabel}amix=inputs=2:duration=first${outLabel};`
        sfxMixLabel = outLabel
      }
      lastAudioLabel = sfxMixLabel
    }

    filterComplex = filterComplex.endsWith(';') ? filterComplex.slice(0, -1) : filterComplex

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

  /**
   * Simple concat demuxer stitching (fast, no re-encode, no transitions).
   */
  private async stitchClipsSimple(clips: string[], outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg()
      const listFileName = path.join(path.dirname(outputPath), 'concat_list.txt')
      const fileContent = clips.map((clip) => `file '${clip}'`).join('\n')
      fs.writeFileSync(listFileName, fileContent)

      command
        .input(listFileName)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .save(outputPath)
        .on('end', () => {
          fs.unlinkSync(listFileName)
          resolve(outputPath)
        })
        .on('error', (err) => {
          if (fs.existsSync(listFileName)) fs.unlinkSync(listFileName)
          reject(new Error(`Stitching failed: ${err.message}`))
        })
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

  private async detectTrailingSilence(audioPath: string): Promise<number> {
    return new Promise((resolve) => {
      if (!fs.existsSync(audioPath)) return resolve(0)

      let lastSilenceStart = 0

      ffmpeg(audioPath)
        .audioFilters('silencedetect=n=-40dB:d=0.5')
        .format('null')
        .output('-')
        .on('stderr', (stderrLine) => {
          if (stderrLine.includes('silence_start:')) {
            const match = stderrLine.match(/silence_start:\s*([\d.]+)/)
            if (match) {
              lastSilenceStart = parseFloat(match[1])
            }
          }
        })
        .on('error', () => resolve(0))
        .on('end', () => {
          if (lastSilenceStart > 0) {
            this.getAudioDuration(audioPath)
              .then((totalDuration) => {
                const trailingSilence = Math.max(0, totalDuration - lastSilenceStart)
                resolve(trailingSilence)
              })
              .catch(() => resolve(0))
          } else {
            resolve(0)
          }
        })
        .run()
    })
  }

  private escapeForFFmpeg(text: string): string {
    return text
      .replaceAll('\\', '\\\\')
      .replaceAll("'", String.raw`\'`)
      .replaceAll(':', String.raw`\:`)
      .replaceAll('[', String.raw`\[`)
      .replaceAll(']', String.raw`\]`)
      .replaceAll(',', String.raw`\,`)
      .replaceAll('\n', String.raw`\n`)
  }

  private getTextPosition(position: TextPosition): { x: string; y: string } {
    const positions: Record<TextPosition, { x: string; y: string }> = {
      top: { x: '(w-text_w)/2', y: '50' },
      center: { x: '(w-text_w)/2', y: '(h-text_h)/2' },
      bottom: { x: '(w-text_w)/2', y: 'h-text_h-100' },
      'top-left': { x: '50', y: '50' },
      'top-right': { x: 'w-text_w-50', y: '50' },
      'bottom-left': { x: '50', y: 'h-text_h-50' },
      'bottom-right': { x: 'w-text_w-50', y: 'h-text_h-50' },
      none: { x: '0', y: '0' }
    }

    return positions[position] || positions.bottom
  }

  private wrapText(text: string, maxCharsPerLine: number): string {
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
      if (word.length > maxCharsPerLine) {
        if (currentLine) {
          lines.push(currentLine)
          currentLine = ''
        }
        for (let i = 0; i < word.length; i += maxCharsPerLine) {
          lines.push(word.substring(i, i + maxCharsPerLine))
        }
        continue
      }

      if (`${currentLine} ${word}`.trim().length <= maxCharsPerLine) {
        currentLine = `${currentLine} ${word}`.trim()
      } else {
        if (currentLine) lines.push(currentLine)
        currentLine = word
      }
    }
    if (currentLine) lines.push(currentLine)

    return lines.join('\n')
  }

  /**
   * Generates a global ASS file by aggregating word timings from all scenes.
   */
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
    return 0.04
  }

  /**
   * Encapsulates logic for a single scene clip generation to allow parallel execution.
   */
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

    let tensionStartPadding: number
    if (sceneTension <= 2) tensionStartPadding = 1 + Math.sin(sceneIndex) * 0.15
    else if (sceneTension <= 4) tensionStartPadding = 0.7 + Math.sin(sceneIndex) * 0.1
    else if (sceneTension <= 6) tensionStartPadding = 0.4 + Math.sin(sceneIndex) * 0.08
    else if (sceneTension <= 8) tensionStartPadding = 0.2 + Math.sin(sceneIndex) * 0.05
    else tensionStartPadding = 0.1

    const startPadding = hasGlobalAudio
      ? 0
      : sceneIndex === 0
        ? Math.max(tensionStartPadding, 0.6)
        : Math.max(tensionStartPadding - transitionInDur * 0.5, 0.08)

    const endPadding = hasGlobalAudio ? 0 : isLastScene ? 0 : SCENE_PADDING_SECONDS
    let rawDurationWithPadding = startPadding + rawDuration + endPadding
    if (hasGlobalAudio && sceneIndex > 0) rawDurationWithPadding += transitionInDur

    const duration = Math.ceil(rawDurationWithPadding * OUTPUT_FPS) / OUTPUT_FPS

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

      // ----------------------------------------------------------------
      // Pass scene index as seed to createStaticClip so identical images
      // across different scenes get different Ken Burns effects.
      // ----------------------------------------------------------------
      const staticSeed = sceneIndex

      if (animationMode === 'ai' && fs.existsSync(videoPath)) {
        await this.processAiClip(videoPath, duration, clipOutputPath, aspectRatio, globalOptions.resolution)
      } else if (animationMode === 'static' || animationMode === 'none') {
        await this.createStaticClip(
          imagePath,
          duration,
          clipOutputPath,
          aspectRatio,
          globalOptions.resolution,
          (scene as any).backgroundColor,
          wordTimings,
          processedKeywordVisuals,
          staticSeed // NEW: pass scene index as seed
        )
      } else if (animationMode === 'composition' && manifestData.layers?.length > 0) {
        const layers = manifestData.layers.map((l: any) => ({ ...l, path: path.join(sceneDir, l.path) }))
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
          processedKeywordVisuals
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
          const atempoRate = this.getAtempoRate(sceneTension)
          const shiftedWordTimings = wordTimings.map((w) => {
            const start = (w.start || w.startMs / 1000) / atempoRate + startPadding
            const duration = w.durationMs / 1000 / atempoRate
            return {
              ...w,
              start,
              end: start + duration,
              startMs: Math.round(start * 1000),
              durationMs: Math.round(duration * 1000)
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

      const useAuto = globalOptions.autoTransitions !== false
      const transition = this.resolveTransition(undefined, sceneTension, useAuto)
      return { clipPath: finalClip, transition }
    } catch (error) {
      console.error(`[VideoAssembler] Scene ${scene.id} failed:`, error)
      return { clipPath: clipOutputPath, transition: undefined }
    }
  }
}
