import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import { CompleteVideoScript, TextPosition, VideoGenerationOptions } from '../../types/video-script.types';
import { MusicService } from '../audio/music.service';
import { SFXService } from '../audio/sfx.service';
import { AmbientService } from '../audio/ambient.service';
import { AnimatedCaptionRenderer } from './animated-caption.renderer';
import { AssCaptionService } from './ass-caption.service';
import { WordTiming } from '../audio/index';

/** Number of words per caption chunk for the remotion style fallback (no word timings). */
const REMOTION_CHUNK_SIZE = 3;
/** Font size multiplier applied to the base fontSize for the remotion style. */
const REMOTION_FONT_SIZE_MULTIPLIER = 1.3;
/** Target silence interval between voice narrations in seconds. */
const TARGET_VOICE_GAP = 1.2;
/** Fixed padding added after narration to provide visual breathing room. */
const SCENE_PADDING_SECONDS = 0.2;

// Valid transitions (same list as in schema) – used when AI provides none
const TRANSITIONS: string[] = [
    'cut',
    'fade',
    'slide-left',
    'slide-right',
    'slide-up',
    'slide-down',
    'wipe',
    'zoom-in',
    'pop',
    'swish',
    'none',
];

/**
 * Pick a random transition from the available set.  
 * `fade` is relatively common; `none` means a hard cut.
 */
function getRandomTransition(): string {
    const idx = Math.floor(Math.random() * TRANSITIONS.length);
    return TRANSITIONS[idx];
}

export class VideoAssembler {
    private outputDir: string;
    private musicService: MusicService;
    private sfxService: SFXService;
    private ambientService: AmbientService;

    constructor() {
        this.outputDir = path.join(process.cwd(), 'output');
        this.musicService = new MusicService();
        this.sfxService = new SFXService();
        this.ambientService = new AmbientService();
    }

    /**
     * Assembles the final video from the script and generated assets.
     */
    async assembleVideo(
        script: CompleteVideoScript,
        scenesDir: string,
        projectDir: string,
        animationMode: 'panning' | 'ai' | 'composition' | 'static' | 'none',
        globalOptions: VideoGenerationOptions
    ): Promise<string> {
        console.log(`[VideoAssembler] Assembling video in ${animationMode} mode...`);
        const clips: string[] = [];
        const transitions: (string | undefined)[] = [];

        for (let sceneIndex = 0; sceneIndex < script.scenes.length; sceneIndex++) {
            const scene = script.scenes[sceneIndex];
            const isLastScene = sceneIndex === script.scenes.length - 1;
            const sceneDir = path.join(scenesDir, scene.id);
            const manifestPath = path.join(sceneDir, 'manifest.json');

            // Read manifest first to get sceneImage filename
            let sceneImageFilename = 'scene.webp'; // Default to WebP
            let aspectRatio = '16:9';
            let cameraAction: any;
            let transitionToNext: string | undefined;
            let wordTimings: any[] = [];
            let manifestData: any = {};

            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                    manifestData = manifest;
                    sceneImageFilename = manifest.sceneImage || 'scene.webp';
                    aspectRatio = manifest.aspectRatio || '16:9';
                    cameraAction = manifest.cameraAction;
                    transitionToNext = manifest.transitionToNext;
                    wordTimings = manifest.wordTimings || [];
                    const backgroundColor = manifest.backgroundColor || '#FFF';

                    // Update local context for this scene
                    (scene as any)['backgroundColor'] = backgroundColor;
                    (scene as any)['wordTimings'] = wordTimings;
                    if (manifest.globalWordTimings) {
                        (scene as any)['globalWordTimings'] = manifest.globalWordTimings;
                    }
                } catch (e) {
                    console.warn(`[VideoAssembler] Could not read manifest for scene ${scene.id}`);
                }
            }

            const imagePath = path.join(sceneDir, sceneImageFilename);
            const audioPath = path.join(sceneDir, 'narration.mp3');
            const videoPath = path.join(sceneDir, 'animation.mp4');
            const clipOutputPath = path.join(sceneDir, 'clip.mp4');

            // Determine duration: Use audio duration if available, otherwise default
            // If global audio is present, use the timeRange from the script
            const hasGlobalAudio = !!globalOptions.globalAudioPath;
            const scriptDuration = scene.timeRange ? (scene.timeRange.end - scene.timeRange.start) : 5;
            const rawDuration = hasGlobalAudio ? scriptDuration : await this.getAudioDuration(audioPath).catch(() => 5);

            // ── Dynamic Pacing Logic ──
            // To maintain a "Regular Interval" between voices, startPadding must compensate for:
            // 1. The tail padding of the previous scene (SCENE_PADDING_SECONDS)
            // 2. The overlap duration of the transition between scenes

            // Get transition that leads into this scene (from the previous scene)
            const prevSceneIndex = sceneIndex - 1;
            let incomingTransitionDuration = 0;
            if (prevSceneIndex >= 0) {
                const prevScene = script.scenes[prevSceneIndex];
                const prevSceneDir = path.join(scenesDir, prevScene.id);
                const prevManifestPath = path.join(prevSceneDir, 'manifest.json');
                let prevTransitionType = 'fade'; // Default fallback
                if (fs.existsSync(prevManifestPath)) {
                    try {
                        const m = JSON.parse(fs.readFileSync(prevManifestPath, 'utf8'));
                        prevTransitionType = m.transitionToNext || 'fade';
                    } catch (e) { }
                }
                const xt = this.getXfadeTransition(prevTransitionType);
                // Unified 0.04s (1 frame) fallback for 'none'/'cut'
                incomingTransitionDuration = xt ? xt.duration : 0.04;
            }

            // ── Tension-Aware Pacing ──
            // Scene tension (0–10) from the LLM modulates the lead-in silence.
            // High tension = urgent, tight. Low tension = contemplative, wide.
            const sceneTension: number = (scene as any).tension ?? 5;

            let tensionStartPadding: number;
            if (sceneTension <= 2) {
                // Calm/silence — long contemplative pause
                tensionStartPadding = 1.0 + (Math.sin(sceneIndex) * 0.15); // 0.85–1.15s
            } else if (sceneTension <= 4) {
                // Building — gentle lead-in
                tensionStartPadding = 0.7 + (Math.sin(sceneIndex) * 0.1);  // 0.60–0.80s
            } else if (sceneTension <= 6) {
                // Engaged — standard pacing
                tensionStartPadding = 0.4 + (Math.sin(sceneIndex) * 0.08); // 0.32–0.48s
            } else if (sceneTension <= 8) {
                // High stakes — tight, urgent
                tensionStartPadding = 0.2 + (Math.sin(sceneIndex) * 0.05); // 0.15–0.25s
            } else {
                // Peak drama — near-instant start
                tensionStartPadding = 0.1;
            }

            const startPadding = hasGlobalAudio ? 0 : (sceneIndex === 0
                ? Math.max(tensionStartPadding, 0.6) // First scene always has at least 0.6s lead-in
                : Math.max(tensionStartPadding - incomingTransitionDuration * 0.5, 0.08)); // Reduce by half the transition overlap, min 80ms

            const endPadding = hasGlobalAudio ? 0 : (isLastScene ? 0 : SCENE_PADDING_SECONDS);

            let rawDurationWithPadding = startPadding + rawDuration + endPadding;

            // If using global audio, the clip must be lengthened by the transition overlap
            // because `stitchClips` will subtract this overlap via xfade, and we need the 
            // net contribution of this scene to perfectly match `rawDuration` from TimingMapper.
            if (hasGlobalAudio && sceneIndex > 0) {
                rawDurationWithPadding += incomingTransitionDuration;
            }

            // Frame-accurate duration matching (assuming 25fps)
            const FPS = 25;
            const duration = Math.ceil(rawDurationWithPadding * FPS) / FPS;

            console.log(`[VideoAssembler-Timing] Scene: ${sceneIndex} | tension: ${sceneTension} | transitionInDur: ${incomingTransitionDuration.toFixed(2)}s | startPad: ${startPadding.toFixed(2)}s | totalDuration: ${duration.toFixed(3)}s`);

            try {
                // ── Keyword Visuals Resolution ─────────────────────────────────────
                const keywordVisualsJsonPath = path.join(sceneDir, 'keyword_visuals.json');
                let processedKeywordVisuals: Array<{ imagePath: string; start: number; end: number }> = [];

                if (fs.existsSync(keywordVisualsJsonPath)) {
                    try {
                        const kvManifest = JSON.parse(fs.readFileSync(keywordVisualsJsonPath, 'utf8'));
                        for (const kv of kvManifest) {
                            const timing = this.getKeywordTiming(kv.keyword, wordTimings || []);
                            if (timing) {
                                processedKeywordVisuals.push({
                                    imagePath: kv.imagePath,
                                    start: timing.start + startPadding,
                                    end: timing.end + startPadding
                                });
                            }
                        }
                    } catch (e) {
                        console.warn(`[VideoAssembler] Could not read keyword visuals for scene ${scene.id}`);
                    }
                }

                if (animationMode === 'ai' && fs.existsSync(videoPath)) {
                    // Transcode AI video to ensure compatibility and correct length
                    await this.processAiClip(videoPath, duration, clipOutputPath, aspectRatio, globalOptions.resolution);
                } else if (animationMode === 'static' || animationMode === 'none') {
                    // Create static video from image (no panning, no animation)
                    await this.createStaticClip(imagePath, duration, clipOutputPath, aspectRatio, globalOptions.resolution, (scene as any).backgroundColor, wordTimings, processedKeywordVisuals);
                } else if (animationMode === 'composition') {
                    // Create layered composition video
                    if (manifestData.layers && manifestData.layers.length > 0) {
                        const layers = manifestData.layers.map((l: any) => ({
                            ...l,
                            path: path.join(sceneDir, l.path)
                        }));
                        const bgPath = path.join(sceneDir, manifestData.sceneImage);
                        await this.createComposedClip(bgPath, layers, duration, clipOutputPath, aspectRatio, globalOptions.resolution, processedKeywordVisuals);
                    } else {
                        // Fallback to panning if no layers found
                        await this.createPanningClip(imagePath, duration, clipOutputPath, aspectRatio, globalOptions.resolution, (scene as any).backgroundColor, cameraAction, wordTimings, processedKeywordVisuals);
                    }
                } else {
                    // Create panning video from image (default for 'panning' mode)
                    await this.createPanningClip(imagePath, duration, clipOutputPath, aspectRatio, globalOptions.resolution, (scene as any).backgroundColor, cameraAction, wordTimings, processedKeywordVisuals);
                }

                // Add audio if it exists and wasn't already muxed (panning clip doesn't have audio)
                // Actually, let's stitch audio later or mux it now.
                // Better approach: Create a clip WITH audio.

                let finalClip = clipOutputPath;

                // ── Advanced Multi-layer Audio Mixing ──
                const hasGlobalAudio = !!globalOptions.globalAudioPath;
                if (fs.existsSync(audioPath) || hasGlobalAudio) {
                    const mixedClipPath = path.join(sceneDir, 'clip_mixed.mp4');

                    // Resolve soundscape if specified in script
                    const soundscapeName = (scene as any).soundscape;
                    const soundscapePath = soundscapeName ? this.ambientService.resolveSoundscape(soundscapeName) : null;

                    // Collect sound effects for this scene
                    const soundEffects = (scene as any).soundEffects || [];

                    await this.mixSceneAudio(
                        clipOutputPath,
                        audioPath,
                        soundscapePath,
                        soundEffects,
                        mixedClipPath,
                        duration,
                        startPadding,
                        sceneTension,
                        hasGlobalAudio // skipNarration
                    );
                    finalClip = mixedClipPath;
                }

                // 2. Apply camera action - DISABLED FOR NOW
                // if (cameraAction && cameraAction.type !== 'static') {
                //     const clipWithCameraPath = path.join(sceneDir, 'clip_with_camera.mp4');
                //     try {
                //         await this.applyCameraEffect(finalClip, cameraAction, clipWithCameraPath, aspectRatio, globalOptions.resolution);
                //         if (fs.existsSync(clipWithCameraPath)) {
                //             finalClip = clipWithCameraPath;
                //         } else {
                //             console.warn(`[VideoAssembler] Camera effect output not found, using original clip`);
                //         }
                //     } catch (camErr) {
                //         console.warn(`[VideoAssembler] Camera effect failed, using original: ${camErr}`);
                //     }
                // }

                // 3. Apply ASS captions if enabled and word timings exist
                const useGlobalAss = !!globalOptions.globalAudioPath && globalOptions.assCaptions?.enabled !== false;
                const captionsEnabled = globalOptions.assCaptions?.enabled !== false;

                if (captionsEnabled && wordTimings.length > 0 && !useGlobalAss) {
                    const clipWithTextPath = path.join(sceneDir, 'clip_with_text.mp4');
                    try {
                        const atempoRate = this.getAtempoRate(sceneTension);

                        // Shift and Scale word timings
                        const shiftedWordTimings = wordTimings.map(w => {
                            const start = (w.start || (w.startMs / 1000)) / atempoRate + startPadding;
                            const duration = (w.durationMs / 1000) / atempoRate;
                            const end = start + duration;

                            return {
                                ...w,
                                start,
                                end,
                                startMs: Math.round(start * 1000),
                                durationMs: Math.round(duration * 1000)
                            };
                        });

                        const resolution = this.getResolution(aspectRatio, globalOptions.resolution);
                        const [width, height] = resolution.split('x').map(Number);
                        const assService = new AssCaptionService(width, height, globalOptions.assCaptions);
                        const assContent = assService.buildASSFile(shiftedWordTimings);

                        const assPath = path.join(sceneDir, 'subtitles.ass');
                        fs.writeFileSync(assPath, assContent);

                        const safePath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
                        await new Promise<void>((resolve, reject) => {
                            ffmpeg(finalClip)
                                .videoFilters(`ass='${safePath}'`)
                                .outputOptions(['-c:v libx264', `-s ${resolution}`, '-pix_fmt yuv420p', '-c:a aac', '-map', '0:v:0', '-map', '0:a?', '-movflags +faststart'])
                                .save(clipWithTextPath)
                                .on('end', () => resolve())
                                .on('error', (err) => reject(err));
                        });
                        clips.push(clipWithTextPath);
                        console.log(`[VideoAssembler] Dynamic ASS applied: scene ${scene.id} | pad: ${startPadding.toFixed(2)}s | speed: ${atempoRate.toFixed(2)}x`);
                    } catch (assErr) {
                        console.warn(`[VideoAssembler] Failed to apply dynamic ASS: ${assErr}`);
                        clips.push(finalClip);
                    }
                } else {
                    clips.push(finalClip);
                }

                // ── Tension-Aware Transition Override ──
                // The LLM's transitionToNext is respected UNLESS it contradicts the scene's tension.
                // e.g.: a 'fade' on tension 9 → overridden to 'cut'. A 'pop' on tension 1 → overridden to 'fade'.
                const useAuto = globalOptions.autoTransitions !== false;
                const effectiveTransition = this.resolveTransition(transitionToNext, sceneTension, useAuto);
                transitions.push(effectiveTransition);


            } catch (error) {
                console.error(`[VideoAssembler] Error processing scene ${scene.id}:`, error);
                // Fallback? Skip?
            }
        }

        const finalVideoNoMusic = path.join(projectDir, 'final_video_no_music.mp4');
        const hasGlobalAudio = !!globalOptions.globalAudioPath;
        // If global audio is used, we prefer hard cuts (0 overlap) to maintain sync
        const audioOverlap = hasGlobalAudio ? 0 : (globalOptions.audioOverlap ?? 0.3);
        await this.stitchClips(clips, finalVideoNoMusic, transitions, audioOverlap);

        // --- GLOBAL AUDIO OVERLAY ---
        let finalVisualPath = finalVideoNoMusic;
        if (hasGlobalAudio && fs.existsSync(globalOptions.globalAudioPath!)) {
            console.log(`[VideoAssembler] Overlaying global audio: ${globalOptions.globalAudioPath}`);
            const videoWithGlobalAudio = path.join(projectDir, 'final_video_with_global_audio.mp4');
            await new Promise<void>((resolve, reject) => {
                ffmpeg(finalVideoNoMusic)
                    .input(globalOptions.globalAudioPath!)
                    .outputOptions([
                        '-c:v copy',
                        '-map 0:v:0',
                        '-map 1:a:0',
                        '-shortest'
                    ])
                    .save(videoWithGlobalAudio)
                    .on('end', () => {
                        finalVisualPath = videoWithGlobalAudio;
                        resolve();
                    })
                    .on('error', (err) => reject(err));
            });
        }

        // Generate Global ASS if needed
        let globalAssPath: string | undefined;
        if (hasGlobalAudio && globalOptions.assCaptions?.enabled !== false) {
            const assFileName = 'global_subtitles.ass';
            globalAssPath = path.join(projectDir, assFileName);
            await this.generateGlobalASS(script, globalAssPath, globalOptions);
        }

        // Apply visual professional polish (Progress Bar, Vignette, Noise, subtitles, branding, encoding)
        const polishedVideoPath = path.join(projectDir, 'final_video_polished.mp4');
        finalVisualPath = await this.applyProfessionalPolish(finalVisualPath, polishedVideoPath, {
            ...globalOptions,
            globalAssPath
        });

        // Apply branding (Logo/Watermark)
        if (globalOptions.branding) {
            const brandedVideoPath = path.join(projectDir, 'final_video_branded.mp4');
            finalVisualPath = await this.applyBranding(finalVisualPath, globalOptions.branding, brandedVideoPath);
        }

        // Generate SRT Subtitles
        if (globalOptions.assCaptions?.enabled !== false) {
            const srtPath = path.join(projectDir, 'subtitles.srt');
            await this.generateSRT(script, srtPath);
            console.log(`[VideoAssembler] SRT subtitles exported to: ${srtPath}`);
        }

        // Add background music if requested
        if (script.backgroundMusic) {
            const musicTrack = this.musicService.getTrackForMood(script.backgroundMusic);
            if (musicTrack) {
                const videoWithMusicPath = path.join(projectDir, 'final_video.mp4');
                const musicPath = this.musicService.getTrackPath(musicTrack.path);

                // Mix background music with AUTO-DUCKING (sidechain)
                return await this.addBackgroundMusic(finalVisualPath, musicPath, videoWithMusicPath, 0.1);
            }
        }

        return finalVisualPath;
    }

    /**
     * Adds background music to the video.
     */
    async addBackgroundMusic(videoPath: string, musicPath: string, outputPath: string, volume: number = 0.1): Promise<string> {
        console.log(`[VideoAssembler] Adding background music with aggressive auto-ducking...`);
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(musicPath)) {
                console.warn(`[VideoAssembler] Music file not found: ${musicPath}`);
                return resolve(videoPath);
            }

            // IMPROVED DUCKING: More aggressive parameters for better voice clarity
            // threshold=0.03: Starts ducking at lower levels (-30dB), catches all speech
            // ratio=10: Strong suppression (10:1) when voice is detected
            // attack=20: Very fast response (20ms) to voice onset
            // release=400: Smooth release back to normal after voice ends
            // makeup=1: Compensates for gain reduction loss
            // [0:a] is dialogue/narration (sidechain input), [1:a] is background music
            ffmpeg()
                .input(videoPath)
                .input(musicPath)
                .complexFilter([
                    `[1:a][0:a]sidechaincompress=threshold=0.03:ratio=10:attack=20:release=400:makeup=1[music_ducked]`,
                    `[0:a][music_ducked]amix=inputs=2:duration=first[aout]`
                ])
                .outputOptions([
                    '-c:v copy',
                    '-map 0:v:0',
                    '-map [aout]',
                    '-shortest'
                ])
                .save(outputPath)
                .on('end', () => resolve(outputPath))
                .on('error', (err) => reject(new Error(`Background music addition failed: ${err.message}`)));
        });
    }

    /**
     * Applies sound effects to a scene with precise timing sync to animations
     */
    private async applySoundEffects(scenePath: string, soundEffects: Array<{
        type: string;
        timestamp: number;
        volume?: number;
    }> = []): Promise<string | null> {
        if (!soundEffects || soundEffects.length === 0) return null;

        console.log(`[VideoAssembler] Applying ${soundEffects.length} sound effects to scene...`);

        // Build SFX filter chain: each SFX is delayed by its timestamp and mixed
        let filterParts: string[] = [];
        const inputBase = 'aformat=sample_rates=48000:channel_layouts=stereo';

        // Process each SFX
        for (let i = 0; i < soundEffects.length; i++) {
            const sfx = soundEffects[i];
            const sfxPath = this.sfxService.resolveSFX(sfx.type);
            if (!sfxPath || !fs.existsSync(sfxPath)) {
                console.warn(`[VideoAssembler] SFX not found: ${sfx.type}`);
                continue;
            }

            // Delay SFX by timestamp and apply volume
            const volAdjust = sfx.volume ?? 0.8;
            const delayMs = Math.floor(sfx.timestamp * 1000);
            filterParts.push(`[${i + 1}:a]adelay=${delayMs}|${delayMs},volume=${volAdjust}[sfx${i}]`);
        }

        if (filterParts.length === 0) {
            console.warn(`[VideoAssembler] No valid SFX found`);
            return null;
        }

        // Mix all SFX with dialogue
        let mixInputs = '[0:a]';
        for (let i = 0; i < filterParts.length; i++) {
            mixInputs += `[sfx${i}]`;
        }
        const mixCount = filterParts.length + 1;
        filterParts.push(`${mixInputs}amix=inputs=${mixCount}:duration=first[aout]`);

        const filterChain = filterParts.join(';');

        return new Promise((resolve, reject) => {
            let cmd = ffmpeg(scenePath);

            // Add SFX inputs
            const sfxPaths = soundEffects
                .map(sfx => this.sfxService.resolveSFX(sfx.type))
                .filter(p => p && fs.existsSync(p)) as string[];

            sfxPaths.forEach(p => cmd = cmd.input(p));

            const tempPath = scenePath + '.temp';
            cmd
                .complexFilter(filterChain)
                .outputOptions(['-map 0:v:0', '-map [aout]', '-c:v copy'])
                .on('error', (err) => {
                    console.warn(`[VideoAssembler] SFX application failed: ${err.message}, skipping...`);
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    resolve(null);
                })
                .on('end', () => {
                    if (fs.existsSync(tempPath)) {
                        fs.renameSync(tempPath, scenePath);
                    }
                    resolve(scenePath);
                })
                .save(tempPath);
        });
    }

    /**
     * Adds audio crossfade and fills silence gaps between clips
     */
    private async addAudioCrossfade(clips: string[], outputPath: string, crossfadeDuration: number = 0.2): Promise<string> {
        console.log(`[VideoAssembler] Adding audio crossfade between clips (${crossfadeDuration}s)...`);

        // Get audio durations for all clips
        const durations: number[] = [];
        for (const clip of clips) {
            durations.push(await this.getClipDuration(clip));
        }

        // Build audio crossfade chain (similar to video xfade but audio focused)
        let filterComplex = '';
        let lastAudioLabel = '[0:a]';
        let audioOffset = durations[0] - crossfadeDuration;

        for (let i = 1; i < clips.length; i++) {
            const outLabel = `[a${i}]`;
            // Smooth audio crossfade with adjustable curve
            filterComplex += `${lastAudioLabel}[${i}:a]acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri${outLabel};`;
            lastAudioLabel = outLabel;
            audioOffset += durations[i] - crossfadeDuration;
        }

        // Remove trailing semicolon
        if (filterComplex.endsWith(';')) {
            filterComplex = filterComplex.slice(0, -1);
        }

        return new Promise((resolve, reject) => {
            let cmd = ffmpeg();
            clips.forEach(clip => cmd = cmd.input(clip));

            cmd
                .complexFilter(filterComplex)
                .outputOptions([
                    '-map 0:v:0',
                    '-map', lastAudioLabel,
                    '-c:v copy',
                    '-c:a aac'
                ])
                .on('end', () => resolve(outputPath))
                .on('error', (err) => {
                    console.warn(`[VideoAssembler] Audio crossfade failed: ${err.message}, continuing without...`);
                    resolve(outputPath);
                })
                .save(outputPath);
        });
    }

    /**
     * Applies professional visual polish: Progress Bar, Vignette, and Grain.
     */
    async applyProfessionalPolish(videoPath: string, outputPath: string, options?: VideoGenerationOptions & { globalAssPath?: string }): Promise<string> {
        console.log(`[VideoAssembler] Applying professional visual polish (Vignette, Noise${options?.globalAssPath ? ', Subtitles' : ''})...`);

        const crf = options?.proEncoding?.crf ?? 20;
        const preset = options?.proEncoding?.preset ?? 'superfast';
        const assPath = options?.globalAssPath;

        return new Promise((resolve, reject) => {
            // Get total duration first
            this.getClipDuration(videoPath).then(duration => {
                ffmpeg(videoPath)
                    .complexFilter([
                        // 1. Vignette: subtle dark edges
                        `vignette=angle=0.15[vignetted]`,
                        // 2. Subtle Grain: 2% noise for organic feel
                        `[vignetted]noise=alls=2:allf=t[polished]`,
                        // 3. Global Subtitles if path provided
                        assPath
                            ? `[polished]ass='${assPath.replace(/\\/g, '/').replace(/:/g, '\\:')}'[outv]`
                            : `[polished]copy[outv]`
                    ])
                    .outputOptions([
                        '-map [outv]',
                        '-map 0:a?',
                        '-c:v libx264',
                        `-preset ${preset}`,
                        `-crf ${crf}`,
                        '-shortest' // Ensure output doesn't exceed audio stream length
                    ])
                    .save(outputPath)
                    .on('end', () => resolve(outputPath))
                    .on('error', (err) => {
                        console.error(`[VideoAssembler] Polish failed: ${err.message}`);
                        resolve(videoPath); // Fallback to original on error
                    });
            }).catch(err => {
                console.warn(`[VideoAssembler] Could not get duration for polish: ${err.message}`);
                resolve(videoPath);
            });
        });
    }

    /**
     * Applies branding (logo/watermark) to the video
     */
    async applyBranding(videoPath: string, config: any, outputPath: string): Promise<string> {
        console.log(`[VideoAssembler] Applying branding overlays...`);
        return new Promise((resolve, reject) => {
            let filter = '';
            const inputs: string[] = [videoPath];

            if (config.logoPath && fs.existsSync(config.logoPath)) {
                inputs.push(config.logoPath);
                const pos = this.getBrandingPosition(config.position);
                const scale = config.scale || 0.15;
                // Scale logo relative to video width and overlay with opacity
                filter += `[1:v]scale=iw*${scale}:-1,format=rgba,colorchannelmixer=aa=${config.opacity || 0.5}[logo]; [0:v][logo]overlay=${pos}[branded_v]`;
            }

            if (config.watermarkText) {
                const pos = this.getBrandingPosition(config.position, true);
                const textFilter = `drawtext=text='${config.watermarkText}':fontcolor=white@${config.opacity || 0.3}:fontsize=24:x=${pos.x}:y=${pos.y}`;
                if (filter) {
                    filter = `${filter},${textFilter}[final_v]`;
                } else {
                    filter = `[0:v]${textFilter}[final_v]`;
                }
            }

            if (!filter) return resolve(videoPath);

            const outLabel = filter.includes('[final_v]') ? '[final_v]' : '[branded_v]';

            let cmd = ffmpeg(videoPath);
            if (config.logoPath && fs.existsSync(config.logoPath)) {
                cmd = cmd.input(config.logoPath);
            }

            cmd
                .complexFilter(filter)
                .outputOptions([
                    `-map ${outLabel}`,
                    '-map 0:a?',
                    '-c:v libx264',
                    '-c:a copy'
                ])
                .save(outputPath)
                .on('end', () => resolve(outputPath))
                .on('error', (err) => {
                    console.error(`[VideoAssembler] Branding failed: ${err.message}`);
                    resolve(videoPath);
                });
        });
    }

    private getBrandingPosition(pos: string, isText: boolean = false): any {
        const padding = 30;
        if (isText) {
            switch (pos) {
                case 'top-left': return { x: padding, y: padding };
                case 'top-right': return { x: 'w-tw-' + padding, y: padding };
                case 'bottom-left': return { x: padding, y: 'h-th-' + padding };
                case 'center': return { x: '(w-tw)/2', y: '(h-th)/2' };
                case 'bottom-right':
                default: return { x: 'w-tw-' + padding, y: 'h-th-' + padding };
            }
        } else {
            switch (pos) {
                case 'top-left': return `${padding}:${padding}`;
                case 'top-right': return `main_w-overlay_w-${padding}:${padding}`;
                case 'bottom-left': return `${padding}:main_h-overlay_h-${padding}`;
                case 'center': return `(main_w-overlay_w)/2:(main_h-overlay_h)/2`;
                case 'bottom-right':
                default: return `main_w-overlay_w-${padding}:main_h-overlay_h-${padding}`;
            }
        }
    }

    /**
     * Generates a standard SRT file from script word timings
     */
    async generateSRT(script: CompleteVideoScript, outputPath: string): Promise<void> {
        let srtContent = '';
        let index = 1;
        let cumulativeTime = 0;

        for (const scene of script.scenes) {
            const sceneDir = path.join(process.cwd(), 'output', 'scenes', scene.id);
            const manifestPath = path.join(sceneDir, 'manifest.json');

            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                    const wordTimings = manifest.wordTimings || [];

                    // Group words into lines of ~5 words or punctuation ends
                    let currentLine: any[] = [];
                    for (let i = 0; i < wordTimings.length; i++) {
                        currentLine.push(wordTimings[i]);
                        const isLastWord = i === wordTimings.length - 1;
                        const hasPunctuation = wordTimings[i].word.match(/[.!?]$/);

                        if (currentLine.length >= 5 || hasPunctuation || isLastWord) {
                            const startTime = this.formatSRTTime(cumulativeTime + (currentLine[0].startMs / 1000));
                            const endTime = this.formatSRTTime(cumulativeTime + (currentLine[currentLine.length - 1].end / 1000));
                            const text = currentLine.map(w => w.word).join(' ');

                            srtContent += `${index}\n${startTime} --> ${endTime}\n${text}\n\n`;
                            index++;
                            currentLine = [];
                        }
                    }

                    // Approximate scene duration if no timings
                    if (wordTimings.length === 0) {
                        const duration = scene.timeRange ? (scene.timeRange.end - scene.timeRange.start) : 5;
                        const startTime = this.formatSRTTime(cumulativeTime);
                        const endTime = this.formatSRTTime(cumulativeTime + duration);
                        srtContent += `${index}\n${startTime} --> ${endTime}\n${scene.narration}\n\n`;
                        index++;
                    }

                } catch (e) {
                    console.warn(`[VideoAssembler] Could not generate SRT for scene ${scene.id}`);
                }
            }
            cumulativeTime += scene.timeRange ? (scene.timeRange.end - scene.timeRange.start) : 5;
        }

        fs.writeFileSync(outputPath, srtContent);
    }

    private formatSRTTime(seconds: number): string {
        const date = new Date(0);
        date.setMilliseconds(seconds * 1000);
        const timePart = date.toISOString().substr(11, 8);
        const msPart = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
        return `${timePart},${msPart}`;
    }

    /**
     * Applies camera effects (zoom-in, shake) to a video clip.
     */
    async applyCameraEffect(videoPath: string, cameraAction: { type: string, intensity: string }, outputPath: string, aspectRatio: string = '16:9', resolutionPreset: string = '720p'): Promise<string> {
        return new Promise((resolve, reject) => {
            const resolution = this.getResolution(aspectRatio, resolutionPreset);
            const [width, height] = resolution.split('x').map(Number);
            const intensityMap: Record<string, number> = { low: 1.05, medium: 1.15, high: 1.3 };
            const zoomFactor = intensityMap[cameraAction.intensity] || 1.1;
            const shakeIntensityMap: Record<string, number> = { low: 3, medium: 7, high: 15 };
            const shakePx = shakeIntensityMap[cameraAction.intensity] || 5;

            let videoFilter: string;

            if (cameraAction.type === 'zoom-in') {
                // Punch-in zoom: start normal, zoom to zoomFactor over the whole clip duration
                videoFilter = `scale=iw*${zoomFactor}:ih*${zoomFactor},crop=${resolution.replace('x', ':')}`;
            } else if (cameraAction.type === 'zoom-out') {
                videoFilter = `scale=iw*${zoomFactor}:ih*${zoomFactor},crop=${resolution.replace('x', ':')},scale=${resolution.replace('x', ':')}`;
            } else if (cameraAction.type === 'shake') {
                // Random shake using crop displacement
                videoFilter = `crop=iw-${shakePx * 2}:ih-${shakePx * 2}:${shakePx}+${shakePx}*sin(n/3):${shakePx}+${shakePx}*cos(n/5),scale=${resolution.replace('x', ':')}`;
            } else if (cameraAction.type === 'breathing') {
                // Subtle oscillation of zoom
                videoFilter = `zoompan=z='1.0+0.05*sin(2*pi*on/100)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${resolution}`;
            } else {
                // Unknown action, just copy
                return resolve(videoPath);
            }

            ffmpeg(videoPath)
                .videoFilters(videoFilter)
                .outputOptions([
                    '-c:a copy',
                    '-c:v libx264',
                    '-pix_fmt yuv420p'
                ])
                .save(outputPath)
                .on('end', () => resolve(outputPath))
                .on('error', (err) => reject(new Error(`Camera effect failed: ${err.message}`)));
        });
    }

    /**
     * Builds mathematical expressions for FFmpeg zoompan and eq filters based on word timings.
     * This creates micro-zooms on strong phonemes and micro-fades on pauses.
     */
    private buildAudioReactiveExpressions(wordTimings: any[], duration: number): { zoomExpr: string, brightExpr: string } {
        if (!wordTimings || wordTimings.length === 0) return { zoomExpr: "", brightExpr: "" };

        let zoomPulses: string[] = [];
        let brightFades: string[] = [];
        let lastEnd = 0;

        for (let i = 0; i < wordTimings.length; i++) {
            const w = wordTimings[i];
            const startSec = w.startMs / 1000;
            const endSec = w.end / 1000;
            const gap = startSec - lastEnd;

            // Attack zoom: first word or after a decent pause
            if (i === 0 || gap > 0.3) {
                // Gaussian pulse on zoom: +0.02 at the peak, lasting ~0.2s
                zoomPulses.push(`0.02*exp(-pow(time-${startSec.toFixed(3)}, 2)*40)`);
            }

            // Pause fade: gap larger than 0.4s
            if (gap > 0.4) {
                const pauseMid = (lastEnd + (gap / 2)).toFixed(3);
                // Gaussian dip on brightness: -0.08 at the peak in the middle of the pause
                brightFades.push(`-0.08*exp(-pow(t-${pauseMid}, 2)*25)`);
            }

            lastEnd = endSec;
        }

        return {
            zoomExpr: "",
            brightExpr: brightFades.length > 0 ? `eq=brightness='${brightFades.join('+')}',` : ""
        };
    }

    /**
     * Creates a video clip from an image with a zoom/pan effect (Ken Burns) and audio-reactive dynamics.
     */
    async createPanningClip(
        imagePath: string,
        duration: number,
        outputPath: string,
        aspectRatio: string = '16:9',
        resolutionPreset: string = '720p',
        backgroundColor?: string,
        cameraAction?: { type: string, intensity: string, duration?: number },
        wordTimings: any[] = [],
        keywordVisuals: Array<{ imagePath: string; start: number; end: number }> = []
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const resolution = this.getResolution(aspectRatio, resolutionPreset);
            const [w, h] = resolution.split('x').map(Number);
            const bgColor = this.normalizeColor(backgroundColor);
            const frameCount = Math.round(duration * 25);

            const reactive = this.buildAudioReactiveExpressions(wordTimings, duration);

            let zBaseExpr = "min(1.003^on,1.5)";
            let x = "iw/2-(iw/zoom/2)";
            let y = "ih/2-(ih/zoom/2)";

            if (cameraAction) {
                const intensity = cameraAction.intensity === 'high' ? 0.005 : cameraAction.intensity === 'low' ? 0.001 : 0.003;

                if (cameraAction.type === 'zoom-out') {
                    zBaseExpr = `max(1.5-${intensity}*on,1.0)`;
                } else if (cameraAction.type === 'zoom-in') {
                    zBaseExpr = `min(1.0+${intensity}*on,1.5)`;
                } else if (cameraAction.type === 'pan-right') {
                    zBaseExpr = "1.3";
                    x = `(iw/2-(iw/zoom/2)) + (on*${intensity * 100})`;
                } else if (cameraAction.type === 'pan-left') {
                    zBaseExpr = "1.3";
                    x = `(iw/2-(iw/zoom/2)) - (on*${intensity * 100})`;
                }
            }

            // Full zoom expression: Base Ken Burns + Audio Reactive Pulses
            const zExpr = `${zBaseExpr}${reactive.zoomExpr}`;

            // Add the eq filter for brightness dips during pauses, followed by the responsive zoompan
            let filterString = `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},${reactive.brightExpr}zoompan=z='${zExpr}':d=${frameCount}:x='${x}':y='${y}':s=${resolution}`;

            // Add keyword visual overlays
            const ffmpegCommand = ffmpeg().input(imagePath).inputOptions(['-loop 1']);

            if (keywordVisuals.length > 0) {
                let lastOutput = '[v_base]';
                let complexFilter = `[0:v]${filterString}[v_base];`;

                keywordVisuals.forEach((kv, idx) => {
                    ffmpegCommand.input(kv.imagePath).inputOptions(['-loop 1']);
                    const inputIdx = idx + 1;
                    const nextOutput = `[v_kv_${idx}]`;
                    // Scale each keyword visual to match resolution and overlay it at the exact timing
                    complexFilter += `[${inputIdx}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[kv_s_${idx}];`;
                    complexFilter += `${lastOutput}[kv_s_${idx}]overlay=enable='between(t,${kv.start},${kv.end})'${idx === keywordVisuals.length - 1 ? '' : nextOutput};`;
                    lastOutput = nextOutput;
                });

                ffmpegCommand.complexFilter(complexFilter);
            } else {
                ffmpegCommand.outputOptions(['-vf', filterString]);
            }

            ffmpegCommand
                .outputOptions([
                    '-c:v libx264',
                    '-preset veryfast',
                    '-crf 20',
                    '-t', `${duration}`,
                    '-pix_fmt yuv420p',
                    '-r 25'
                ])
                .save(outputPath)
                .on('end', () => resolve(outputPath))
                .on('error', (err) => reject(new Error(`Panning clip creation failed: ${err.message}`)));
        });
    }

    /**
     * Creates a composed video clip from multiple layers with entry animations.
     */
    async createComposedClip(
        backgroundPath: string,
        layers: Array<{
            path: string,
            x: number,
            y: number,
            scale: number,
            animation?: { type: string, delay: number, duration: number }
        }>,
        duration: number,
        outputPath: string,
        aspectRatio: string = '16:9',
        resolutionPreset: string = '720p',
        keywordVisuals: Array<{ imagePath: string; start: number; end: number }> = []
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const resolution = this.getResolution(aspectRatio, resolutionPreset);
            const [width, height] = resolution.split('x').map(Number);
            const fps = 25;

            let command = ffmpeg();

            // 1. Add background
            command = command.input(backgroundPath).inputOptions(['-loop 1']);

            // 2. Add all layers
            layers.forEach(layer => {
                command = command.input(layer.path).inputOptions(['-loop 1']);
            });

            // 3. Add keyword visuals as additional inputs
            keywordVisuals.forEach(kv => {
                command = command.input(kv.imagePath).inputOptions(['-loop 1']);
            });

            // 4. Build complex filter
            let filterChain = `[0:v]scale=${width}:${height}[bg];`;
            let lastOutput = 'bg';

            // Process layers
            layers.forEach((layer, index) => {
                const inputIdx = index + 1;
                const inputLabel = `layer${inputIdx}`;
                const outputLabel = `v${inputIdx}`;

                // Scale layer (base width is 40% of frame width, then adjusted by scale factor)
                const layerWidth = Math.round(width * 0.4 * layer.scale);
                filterChain += `[${inputIdx}:v]scale=${layerWidth}:-1[${inputLabel}_scaled];`;

                // Anchor logic
                let xExpr = `(W-w)*${layer.x}`;
                let yExpr = `(H-h)*${layer.y}`;
                let alphaFilter = "";
                const type = layer.animation?.type || 'none';
                const delay = layer.animation?.delay || 0;
                const animDuration = layer.animation?.duration || 0.5;

                if (type === 'pop-in') {
                    alphaFilter = `,fade=t=in:st=${delay}:d=0.01:alpha=1`;
                } else if (type === 'fade-in') {
                    alphaFilter = `,fade=t=in:st=${delay}:d=${animDuration}:alpha=1`;
                } else if (delay > 0) {
                    alphaFilter = `,fade=t=in:st=${delay}:d=0.01:alpha=1`;
                }

                filterChain += `[${inputLabel}_scaled]format=rgba${alphaFilter}[${inputLabel}_anim];`;
                filterChain += `[${lastOutput}][${inputLabel}_anim]overlay=x='${xExpr}':y='${yExpr}':shortest=1[${outputLabel}];`;

                lastOutput = outputLabel;
            });

            // Process keyword visuals (overlays that swap the whole frame)
            if (keywordVisuals.length > 0) {
                const layerCount = layers.length;
                keywordVisuals.forEach((kv, idx) => {
                    const inputIdx = 1 + layerCount + idx;
                    const kvInputLabel = `kv_input_${idx}`;
                    const kvOutputLabel = `kv_final_${idx}`;

                    // Scale keyword visual to full frame
                    filterChain += `[${inputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[${kvInputLabel}];`;

                    // Overlay with time-based enable (covers the whole frame)
                    filterChain += `[${lastOutput}][${kvInputLabel}]overlay=enable='between(t,${kv.start},${kv.end})'[${kvOutputLabel}];`;

                    lastOutput = kvOutputLabel;
                });
            }

            command
                .complexFilter(filterChain.endsWith(';') ? filterChain.slice(0, -1) : filterChain)
                .map(`[${lastOutput}]`)
                .outputOptions([
                    `-t ${duration}`,
                    '-pix_fmt yuv420p',
                    `-r ${fps}`,
                    '-c:v libx264'
                ])
                .on('start', (cmd) => console.log(`[VideoAssembler-Composition] Command: ${cmd}`))
                .on('error', (err, stdout, stderr) => {
                    console.error('[VideoAssembler] Composition failed:', err.message);
                    console.error('[VideoAssembler] stderr:', stderr);
                    reject(err);
                })
                .on('end', () => resolve(outputPath))
                .save(outputPath);
        });
    }

    /**
     * Creates a video clip from an image with no background motion, but includes audio-reactive dynamics.
     */
    async createStaticClip(
        imagePath: string,
        duration: number,
        outputPath: string,
        aspectRatio: string = '16:9',
        resolutionPreset: string = '720p',
        backgroundColor?: string,
        wordTimings: any[] = [],
        keywordVisuals: Array<{ imagePath: string; start: number; end: number }> = []
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const resolution = this.getResolution(aspectRatio, resolutionPreset);
            const [width, height] = resolution.split('x').map(Number);
            const bgColor = this.normalizeColor(backgroundColor);

            const reactive = this.buildAudioReactiveExpressions(wordTimings, duration);

            // For static clips, we still use zoompan to enable the reactive micro-zooms
            const zExpr = `1.0${reactive.zoomExpr}`;
            const x = "iw/2-(iw/zoom/2)";
            const y = "ih/2-(ih/zoom/2)";
            const frameCount = Math.round(duration * 25);

            let filterString = `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},${reactive.brightExpr}zoompan=z='${zExpr}':d=${frameCount}:x='${x}':y='${y}':s=${resolution}`;

            const ffmpegCommand = ffmpeg().input(imagePath).inputOptions(['-loop 1']);

            if (keywordVisuals.length > 0) {
                let lastOutput = '[v_base]';
                let complexFilterParts = [`[0:v]${filterString}[v_base]`];

                keywordVisuals.forEach((kv, idx) => {
                    ffmpegCommand.input(kv.imagePath).inputOptions(['-loop 1']);
                    const inputIdx = idx + 1;
                    const kvScaled = `[kv_s_${idx}]`;
                    const overlayOutput = idx === keywordVisuals.length - 1 ? '[outv]' : `[v_kv_${idx}]`;

                    complexFilterParts.push(`[${inputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}${kvScaled}`);
                    complexFilterParts.push(`${lastOutput}${kvScaled}overlay=enable='between(t,${kv.start},${kv.end})'${overlayOutput}`);

                    lastOutput = overlayOutput;
                });

                ffmpegCommand.complexFilter(complexFilterParts.join(';'));
                ffmpegCommand.outputOptions(['-map', '[outv]']);
            } else {
                ffmpegCommand.outputOptions(['-vf', filterString]);
            }

            ffmpegCommand
                .outputOptions([
                    '-c:v libx264',
                    '-preset veryfast',
                    '-crf 20',
                    '-t', `${duration}`,
                    '-pix_fmt yuv420p',
                    '-r 25'
                ])
                .save(outputPath)
                .on('end', () => resolve(outputPath))
                .on('error', (err) => reject(new Error(`Static clip creation failed: ${err.message}`)));
        });
    }

    /**
     * Resolves the start/end timing for a keyword or phrase in the narration.
     */
    private getKeywordTiming(keyword: string, wordTimings: WordTiming[]): { start: number; end: number } | null {
        if (!keyword || wordTimings.length === 0) return null;

        const clean = (s: string) => s.toLowerCase().replace(/[.,!?;:()"]/g, '').trim();
        const target = clean(keyword);
        const targetWords = target.split(/\s+/);

        // Try to find the phrase in the timings
        for (let i = 0; i <= wordTimings.length - targetWords.length; i++) {
            let match = true;
            for (let j = 0; j < targetWords.length; j++) {
                if (clean(wordTimings[i + j].word) !== targetWords[j]) {
                    match = false;
                    break;
                }
            }

            if (match) {
                return {
                    start: wordTimings[i].start,
                    end: wordTimings[i + targetWords.length - 1].end
                };
            }
        }

        return null;
    }

    /**
     * Processes an AI video clip to match the target duration (loop or speed change) and format.
     */
    async processAiClip(videoPath: string, targetDuration: number, outputPath: string, aspectRatio: string = '16:9', resolutionPreset: string = '720p'): Promise<string> {
        return new Promise((resolve, reject) => {
            const resolution = this.getResolution(aspectRatio, resolutionPreset);
            const [width, height] = resolution.split('x').map(Number);
            const bgColor = this.normalizeColor('black');

            const filterString = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=25`;

            ffmpeg(videoPath)
                .inputOptions(['-stream_loop -1'])
                .outputOptions([
                    '-vf', filterString,
                    '-c:v libx264',
                    '-preset veryfast',
                    '-crf 20',
                    '-t', `${targetDuration}`,
                    '-pix_fmt yuv420p',
                    '-r 25'
                ])
                .save(outputPath)
                .on('end', () => resolve(outputPath))
                .on('error', (err) => reject(new Error(`AI clip processing failed: ${err.message}`)));
        });
    }

    private normalizeColor(color: string | undefined): string {
        if (!color) return 'white';

        const colorName = color.toLowerCase().trim();
        const validColors = ['white', 'black', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'transparent'];
        if (validColors.includes(colorName)) {
            return colorName;
        }

        // Handle hex colors
        let hex = colorName.replace('#', '');
        // Expand short hex (e.g., FFF to FFFFFF)
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        // Ensure it's 6 characters and valid hex
        if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
            return `0x${hex}`;
        }
        // Fallback to white if invalid
        return 'white';
    }

    private getResolution(aspectRatio: string, preset: string = '720p'): string {
        // Heights based on resolution preset
        let baseHeight = 720;
        if (preset === '1080p') baseHeight = 1080;
        if (preset === '4k') baseHeight = 2160;

        // Ensure dimension is even for libx264
        const makeEven = (val: number) => {
            const rounded = Math.round(val);
            return rounded % 2 === 0 ? rounded : rounded + 1;
        };

        switch (aspectRatio) {
            case '9:16':
                return `${makeEven(baseHeight * (9 / 16))}x${makeEven(baseHeight)}`;
            case '1:1':
                return `${makeEven(baseHeight)}x${makeEven(baseHeight)}`;
            case '16:9':
            default:
                return `${makeEven(baseHeight * (16 / 9))}x${makeEven(baseHeight)}`;
        }
    }

    private buildTempoFilterChain(tempoRatio: number): string {
        const MIN_TEMPO = 0.5;
        const MAX_TEMPO = 2.0;
        const TEMPO_EPSILON = 0.01;

        if (Math.abs(tempoRatio - 1.0) < TEMPO_EPSILON) return '';

        if (tempoRatio >= MIN_TEMPO && tempoRatio <= MAX_TEMPO) {
            return `atempo=${tempoRatio.toFixed(4)}`;
        }

        const filters: string[] = [];
        let remaining = tempoRatio;

        if (tempoRatio < MIN_TEMPO) {
            while (remaining < MIN_TEMPO && filters.length < 10) {
                filters.push(`atempo=${MIN_TEMPO.toFixed(4)}`);
                remaining /= MIN_TEMPO;
            }
            if (Math.abs(remaining - 1.0) > TEMPO_EPSILON && remaining >= MIN_TEMPO && remaining <= MAX_TEMPO) {
                filters.push(`atempo=${remaining.toFixed(4)}`);
            }
        } else {
            while (remaining > MAX_TEMPO && filters.length < 10) {
                filters.push(`atempo=${MAX_TEMPO.toFixed(4)}`);
                remaining /= MAX_TEMPO;
            }
            if (Math.abs(remaining - 1.0) > TEMPO_EPSILON && remaining >= MIN_TEMPO && remaining <= MAX_TEMPO) {
                filters.push(`atempo=${remaining.toFixed(4)}`);
            }
        }

        return filters.join(',');
    }

    /**
     * Calculates the narration speed-up rate based on scene tension.
     */
    private getAtempoRate(tension: number): number {
        if (tension <= 2) return 0.88; // slow, contemplative
        if (tension <= 4) return 0.94; // building, measured
        if (tension <= 6) return 1.00; // standard
        if (tension <= 8) return 1.08; // urgent, high stakes
        return 1.16; // peak drama, rapid delivery
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
        skipNarration: boolean = false
    ): Promise<string> {
        // ── Tension-Driven Audio Parameters ──
        const atempoRate = this.getAtempoRate(tension);

        // Soundscape ducking ratio (how much the ambient is suppressed during narration)
        // Low tension = gentle duck (ambient stays present). High tension = near-mute.
        let ambientBaseVolume: number;
        let duckingRatio: number;
        if (tension <= 3) {
            ambientBaseVolume = 0.45; duckingRatio = 5;  // Calm: ambient is prominent
        } else if (tension <= 6) {
            ambientBaseVolume = 0.30; duckingRatio = 10; // Standard: balanced mix
        } else {
            ambientBaseVolume = 0.15; duckingRatio = 20; // High: ambient retreats fully
        }

        console.log(`[VideoAssembler] Mixing audio | tension: ${tension} | atempo: ${atempoRate.toFixed(2)}x | ambVol: ${ambientBaseVolume} | duck ratio: ${duckingRatio}`);

        return new Promise((resolve, reject) => {
            const cmd = ffmpeg().input(videoPath);

            let currentInputIndex = 1;

            // Input: Narration (skipped if using global audio)
            if (!skipNarration) {
                cmd.input(narrationPath);
                currentInputIndex++;
            }

            // Input: Soundscape (if any)
            const hasSoundscape = soundscapePath && fs.existsSync(soundscapePath);
            let ambInputStr = '';
            if (hasSoundscape) {
                cmd.input(soundscapePath!).inputOptions(['-stream_loop', '-1']);
                ambInputStr = `[${currentInputIndex}:a]`;
                currentInputIndex++;
            }

            // Inputs: SFX
            const activeSFX: Array<{ path: string; timestamp: number; volume: number }> = [];
            const sfxStartIndex = currentInputIndex;
            for (const sfx of soundEffects) {
                const sfxPath = this.sfxService.resolveSFX(sfx.type);
                if (sfxPath && fs.existsSync(sfxPath)) {
                    cmd.input(sfxPath);
                    activeSFX.push({
                        path: sfxPath,
                        timestamp: sfx.timestamp,
                        volume: sfx.volume ?? 0.8
                    });
                    currentInputIndex++;
                }
            }

            const filterParts: string[] = [];
            const delayMs = Math.floor(startPadding * 1000);
            let currentAudioLabel = "";

            // Label [narr]: Delayed + pitch-corrected speed-up via atempo
            if (!skipNarration) {
                filterParts.push(`[1:a]adelay=${delayMs}|${delayMs},atempo=${atempoRate.toFixed(4)},volume=1.0[narr]`);
                currentAudioLabel = '[narr]';
            }

            // Handle Soundscape with Tension-Aware Ducking
            if (hasSoundscape) {
                // Base volume rises with calm, falls during peak tension. 
                // Ducking ratio: calm = gentle sidechain, peak = aggressive suppression.
                filterParts.push(`${ambInputStr}volume=${ambientBaseVolume}[amb_vol]`);

                if (skipNarration) {
                    // No narration means no ducking needed, just use ambient
                    currentAudioLabel = '[amb_vol]';
                } else {
                    filterParts.push(`[amb_vol][narr]sidechaincompress=threshold=0.03:ratio=${duckingRatio}:attack=20:release=400:makeup=1[amb_ducked]`);
                    // Mix narration and ambient
                    filterParts.push(`[narr][amb_ducked]amix=inputs=2:duration=first[mixed_base]`);
                    currentAudioLabel = '[mixed_base]';
                }
            } else if (skipNarration) {
                // Neither narration nor soundscape: start with silence
                filterParts.push(`anullsrc=r=44100:cl=stereo:d=${duration}[silent_base]`);
                currentAudioLabel = '[silent_base]';
            }

            // Handle SFX
            if (activeSFX.length > 0) {
                const sfxLabels: string[] = [];
                for (let i = 0; i < activeSFX.length; i++) {
                    const sfxInputIdx = sfxStartIndex + i;
                    // SFX timestamp is relative to scene start (after padding is applied visually, but SFX might be relative to narration?)
                    // Usually SFX are tied to animation which starts at 0, so delay = timestamp * 1000.
                    // If we want it relative to the visual start (including startPadding), it's sfx.timestamp * 1000.
                    const sfxDelayMs = Math.floor(activeSFX[i].timestamp * 1000);
                    const sfxLabel = `[sfx${i}]`;
                    filterParts.push(`[${sfxInputIdx}:a]adelay=${sfxDelayMs}|${sfxDelayMs},volume=${activeSFX[i].volume}${sfxLabel}`);
                    sfxLabels.push(sfxLabel);
                }

                const mixInputs = `${currentAudioLabel}${sfxLabels.join('')}`;
                const mixCount = sfxLabels.length + 1;
                filterParts.push(`${mixInputs}amix=inputs=${mixCount}:duration=first[final_a]`);
                currentAudioLabel = '[final_a]';
            }

            // Ensure the mixed audio is padded to full clip duration if narration is short
            filterParts.push(`${currentAudioLabel}apad[aout_padded]`);

            cmd
                .complexFilter(filterParts.join(';'))
                .outputOptions([
                    '-c:v copy',
                    '-map 0:v:0',
                    '-map [aout_padded]',
                    '-shortest',
                    `-t ${duration}`
                ])
                .on('end', () => resolve(outputPath))
                .on('error', (err) => {
                    console.error(`[VideoAssembler] mixSceneAudio failed: ${err.message}`);
                    reject(err);
                })
                .save(outputPath);
        });
    }

    /**
     * Public wrapper for simple audio muxing.
     */
    public async muxAudio(videoPath: string, audioPath: string, outputPath: string, duration: number, delayMs: number = 600): Promise<string> {
        return this.mixSceneAudio(videoPath, audioPath, null, [], outputPath, duration, delayMs / 1000);
    }

    /**
     * Resolves the best transition for a given scene based on its tension.
     * High tension = cut or pop. Low tension = fade.
     */
    private resolveTransition(suggested: string | undefined, tension: number, useAuto: boolean): string {
        // Peak drama (9-10) -> force hard cuts for extreme impact
        if (tension >= 9) return 'cut';

        // High stakes (7-8) -> prefer cuts or fast transitions
        if (tension >= 7) {
            if (suggested === 'fade') return 'cut';
            return suggested || (useAuto ? 'cut' : 'cut');
        }

        // Calm/Building (0-4) -> prefer fades
        if (tension <= 4) {
            if (suggested === 'cut' || suggested === 'pop') return 'fade';
            return suggested || 'fade';
        }

        // Mid tension (5-6) -> respect LLM or random if auto
        return suggested || (useAuto ? getRandomTransition() : 'fade');
    }

    /**
     * Maps our transition type names to FFmpeg xfade transition names and durations.
     */
    private getXfadeTransition(type: string | undefined, maxAllowedDuration?: number): { name: string; duration: number } | null {
        const map: Record<string, { name: string; duration: number }> = {
            'fade': { name: 'fade', duration: 0.6 },
            'slide-left': { name: 'slideleft', duration: 0.5 },
            'slide-right': { name: 'slideright', duration: 0.5 },
            'slide-up': { name: 'slideup', duration: 0.5 },
            'slide-down': { name: 'slidedown', duration: 0.5 },
            'wipe': { name: 'wipeleft', duration: 0.6 },
            'zoom-in': { name: 'circleopen', duration: 0.6 },
            'pop': { name: 'fadeblack', duration: 0.4 },
            'swish': { name: 'smoothleft', duration: 0.4 },
        };
        if (!type || type === 'cut' || type === 'none') return null;

        const transition = map[type] || { name: 'fade', duration: 0.5 };

        if (maxAllowedDuration !== undefined && transition.duration > maxAllowedDuration) {
            transition.duration = maxAllowedDuration;
        }

        return transition;
    }

    /**
     * Gets the duration of a video clip in seconds via ffprobe.
     */
    private getClipDuration(clipPath: string): Promise<number> {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(clipPath, (err, metadata) => {
                if (err) return reject(err);
                resolve(metadata.format.duration || 5);
            });
        });
    }

    /**
     * Stitches multiple video clips together with optional xfade transitions.
     * Falls back to fast concat demuxer when no transitions are present.
     */
    async stitchClips(clips: string[], outputPath: string, transitions: (string | undefined)[] = [], audioOverlap: number = 0.3): Promise<string> {
        if (clips.length === 0) throw new Error("No clips to stitch");
        if (clips.length === 1) {
            fs.copyFileSync(clips[0], outputPath);
            return outputPath;
        }

        // Check if any real transition is requested
        const hasTransitions = transitions.some(t => {
            const xf = this.getXfadeTransition(t);
            return xf !== null;
        });

        // If no transitions requested AND audioOverlap is 0, use fast concat
        if (!hasTransitions && audioOverlap <= 0) {
            // Fast path: simple concat (no re-encode)
            return this.stitchClipsSimple(clips, outputPath);
        }

        // ── xfade path (re-encodes but adds smooth transitions) ──
        console.log(`[VideoAssembler] Stitching ${clips.length} clips with xfade transitions...`);

        // 1. Get durations of all clips
        const durations: number[] = [];
        for (const clip of clips) {
            durations.push(await this.getClipDuration(clip));
        }

        // 2. Build complex filter chain
        const command = ffmpeg();
        clips.forEach(clip => command.input(clip));

        let filterComplex = '';
        const n = clips.length;

        // ── Video xfade chain ──
        // Running offset tracks the cumulative video timeline position
        let cumulativeOffset = 0;
        let lastVideoLabel = '[0:v]';

        for (let i = 1; i < n; i++) {
            // Safe transition max is half of the shortest adjacent clip
            const maxSafeOverlap = Math.min(durations[i - 1], durations[i]) / 2;
            const transition = this.getXfadeTransition(transitions[i - 1], maxSafeOverlap);

            // If 'none' or 'cut', we use a minimal 1-frame (0.04s) transition for video
            // but we will use audioOverlap for the actual timing if it's larger.
            const transitionDuration = transition ? transition.duration : 0.04;
            const transitionName = transition ? transition.name : 'fade';

            // We use audioOverlap as the actual overlap for the timeline if it's larger than the transition duration
            const effectiveOverlap = Math.max(transitionDuration, audioOverlap);
            const offset = Number(Math.max(0.01, cumulativeOffset + durations[i - 1] - effectiveOverlap).toFixed(3));

            const outLabel = `[v${i}]`;
            filterComplex += `${lastVideoLabel}[${i}:v]xfade=transition=${transitionName}:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}${outLabel};`;
            lastVideoLabel = outLabel;

            // Update cumulative offset
            if (i === 1) {
                cumulativeOffset = durations[0] - effectiveOverlap;
            } else {
                cumulativeOffset += durations[i - 1] - effectiveOverlap;
            }
        }

        // ── Audio crossfade chain ──
        let lastAudioLabel = '[0:a]';
        let audioCumulativeOffset = 0;

        for (let i = 1; i < n; i++) {
            const maxSafeOverlap = Math.min(durations[i - 1], durations[i]) / 2;
            const incomingTransitionType = transitions[i - 1];
            const transition = this.getXfadeTransition(incomingTransitionType, maxSafeOverlap);
            // Unified 0.04s (1 frame) fallback for 'none'/'cut'
            const transitionDuration = transition ? transition.duration : 0.04;
            const effectiveAudioOverlap = Math.max(transitionDuration, audioOverlap);

            const offset = (i === 1)
                ? durations[0] - effectiveAudioOverlap
                : audioCumulativeOffset + durations[i - 1] - effectiveAudioOverlap;

            const safeOffset = Math.max(0.01, offset);
            const outLabel = `[a${i}]`;
            // Use effectiveAudioOverlap for acrossfade duration
            filterComplex += `${lastAudioLabel}[${i}:a]acrossfade=d=${effectiveAudioOverlap.toFixed(3)}:c1=tri:c2=tri${outLabel};`;
            lastAudioLabel = outLabel;

            if (i === 1) {
                audioCumulativeOffset = durations[0] - effectiveAudioOverlap;
            } else {
                audioCumulativeOffset += durations[i - 1] - effectiveAudioOverlap;
            }
        }

        // Remove trailing semicolon
        filterComplex = filterComplex.slice(0, -1);

        return new Promise<string>((resolve, reject) => {
            command
                .complexFilter(filterComplex)
                .outputOptions([
                    '-map', lastVideoLabel,
                    '-map', lastAudioLabel,
                    '-c:v libx264',
                    '-preset fast',
                    '-pix_fmt yuv420p',
                    '-c:a aac',
                    '-movflags +faststart',
                ])
                .on('start', (cmd) => console.log(`[VideoAssembler] xfade command: ${cmd.substring(0, 300)}...`))
                .on('error', (err, stdout, stderr) => {
                    console.error('[VideoAssembler] xfade stitching failed:', err.message);
                    console.error('[VideoAssembler] stderr:', stderr?.substring(0, 500));
                    // Fallback to simple concat on xfade failure
                    console.warn('[VideoAssembler] Falling back to simple concat...');
                    this.stitchClipsSimple(clips, outputPath).then(resolve).catch(reject);
                })
                .on('end', () => {
                    console.log(`[VideoAssembler] ✅ xfade stitching complete`);
                    resolve(outputPath);
                })
                .save(outputPath);
        });
    }

    /**
     * Simple concat demuxer stitching (fast, no re-encode, no transitions).
     */
    private async stitchClipsSimple(clips: string[], outputPath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const command = ffmpeg();
            const listFileName = path.join(path.dirname(outputPath), 'concat_list.txt');
            const fileContent = clips.map(clip => `file '${clip}'`).join('\n');
            fs.writeFileSync(listFileName, fileContent);

            command
                .input(listFileName)
                .inputOptions(['-f concat', '-safe 0'])
                .outputOptions(['-c copy'])
                .save(outputPath)
                .on('end', () => {
                    fs.unlinkSync(listFileName);
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    if (fs.existsSync(listFileName)) fs.unlinkSync(listFileName);
                    reject(new Error(`Stitching failed: ${err.message}`));
                });
        });
    }

    private async getAudioDuration(audioPath: string): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(audioPath)) return resolve(5); // Default scene length

            ffmpeg.ffprobe(audioPath, (err, metadata) => {
                if (err) return reject(err);
                resolve(metadata.format.duration || 5);
            });
        });
    }

    /**
     * Detects the duration of leading silence at the start of an audio file.
     * Returns the duration of silence detected (in seconds), or 0 if no silence.
     * Uses ffmpeg's silencedetect filter with a noise threshold.
     */
    private async detectLeadingSilence(audioPath: string): Promise<number> {
        return new Promise((resolve) => {
            if (!fs.existsSync(audioPath)) return resolve(0);

            let firstSilenceEnd = 0;

            ffmpeg(audioPath)
                .audioFilters('silencedetect=n=-40dB:d=0.5')
                .format('null')
                .output('-')
                .on('stderr', (stderrLine) => {
                    // Parse silencedetect output to find leading silence
                    // Output format: [silencedetect @ ...] silence_end: X.XXXX | silence_duration: Y.YYYY
                    if (stderrLine.includes('silence_end:') && !stderrLine.includes('silence_start:')) {
                        const match = stderrLine.match(/silence_end:\s*([\d.]+)/);
                        if (match && firstSilenceEnd === 0) {
                            firstSilenceEnd = parseFloat(match[1]);
                        }
                    }
                })
                .on('error', () => resolve(0))
                .on('end', () => resolve(firstSilenceEnd))
                .run();
        });
    }

    /**
     * Detects the duration of trailing silence at the end of an audio file.
     * Returns the duration of silence detected (in seconds), or 0 if no silence.
     * Uses ffmpeg's silencedetect filter with a noise threshold.
     */
    private async detectTrailingSilence(audioPath: string): Promise<number> {
        return new Promise((resolve) => {
            if (!fs.existsSync(audioPath)) return resolve(0);

            let lastSilenceStart = 0;

            ffmpeg(audioPath)
                .audioFilters('silencedetect=n=-40dB:d=0.5')
                .format('null')
                .output('-')
                .on('stderr', (stderrLine) => {
                    // Parse silencedetect output to find trailing silence
                    // Track the LAST silence_start: for trailing silence at the end
                    if (stderrLine.includes('silence_start:')) {
                        const match = stderrLine.match(/silence_start:\s*([\d.]+)/);
                        if (match) {
                            lastSilenceStart = parseFloat(match[1]);
                        }
                    }
                })
                .on('error', () => resolve(0))
                .on('end', () => {
                    if (lastSilenceStart > 0) {
                        this.getAudioDuration(audioPath).then(totalDuration => {
                            const trailingSilence = Math.max(0, totalDuration - lastSilenceStart);
                            resolve(trailingSilence);
                        }).catch(() => resolve(0));
                    } else {
                        resolve(0);
                    }
                })
                .run();
        });
    }

    /**
     * Escapes text for FFmpeg drawtext filter
     */
    private escapeForFFmpeg(text: string): string {
        return text
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/:/g, '\\:')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]')
            .replace(/,/g, '\\,')
            .replace(/\n/g, '\\n');
    }

    /**
     * Gets x,y position coordinates based on text position preset
     */
    private getTextPosition(position: TextPosition): { x: string, y: string } {
        const positions: Record<TextPosition, { x: string, y: string }> = {
            'top': { x: '(w-text_w)/2', y: '50' },
            'center': { x: '(w-text_w)/2', y: '(h-text_h)/2' },
            'bottom': { x: '(w-text_w)/2', y: 'h-text_h-100' }, // More breathing room
            'top-left': { x: '50', y: '50' },
            'top-right': { x: 'w-text_w-50', y: '50' },
            'bottom-left': { x: '50', y: 'h-text_h-50' },
            'bottom-right': { x: 'w-text_w-50', y: 'h-text_h-50' },
            'none': { x: '0', y: '0' }
        };

        return positions[position] || positions.bottom;
    }

    /**
     * Wraps text to fit within max characters per line
     * Handles edge case where a single word is longer than maxCharsPerLine
     */
    private wrapText(text: string, maxCharsPerLine: number): string {
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = '';

        for (const word of words) {
            // Handle words that are longer than maxCharsPerLine
            if (word.length > maxCharsPerLine) {
                // Add current line if it exists
                if (currentLine) {
                    lines.push(currentLine);
                    currentLine = '';
                }
                // Split the long word into chunks
                for (let i = 0; i < word.length; i += maxCharsPerLine) {
                    lines.push(word.substring(i, i + maxCharsPerLine));
                }
                continue;
            }

            if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
                currentLine = (currentLine + ' ' + word).trim();
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) lines.push(currentLine);

        return lines.join('\n');
    }

    /**
     * Generates a global ASS file by aggregating word timings from all scenes.
     */
    private async generateGlobalASS(script: CompleteVideoScript, outputPath: string, options: VideoGenerationOptions): Promise<void> {
        console.log(`[VideoAssembler] Generating global ASS subtitles...`);
        const allWordTimings: WordTiming[] = [];

        // Tracks cumulative offset in ms
        let cumulativeOffsetMs = 0;
        const hasGlobalAudio = !!options.globalAudioPath;

        for (let i = 0; i < script.scenes.length; i++) {
            const scene = script.scenes[i];
            const sceneDuration = (scene.timeRange.end - scene.timeRange.start) || 5;
            let wordTimings = (scene as any).globalWordTimings || (scene as any).wordTimings || [];

            // FALLBACK: If no word timings, use full narration as a single block
            if (wordTimings.length === 0 && scene.narration) {
                wordTimings = [{
                    word: scene.narration,
                    start: 0,
                    end: sceneDuration,
                    startMs: 0,
                    durationMs: Math.round(sceneDuration * 1000)
                }];
            }

            // Ensure we have absolute timings for the global subtitle timeline
            if (hasGlobalAudio) {
                const absoluteTimingsFromScene = (scene as any).globalWordTimings;
                if (absoluteTimingsFromScene && absoluteTimingsFromScene.length > 0) {
                    allWordTimings.push(...absoluteTimingsFromScene);
                } else {
                    // Reconstruct absolute timings from relative wordTimings using scene start
                    const sceneBaseTime = scene.timeRange.start;
                    const reconstructed = wordTimings.map((w: any) => ({
                        ...w,
                        start: w.start + sceneBaseTime,
                        end: w.end + sceneBaseTime,
                        startMs: Math.round((w.start + sceneBaseTime) * 1000),
                        durationMs: w.durationMs
                    }));
                    allWordTimings.push(...reconstructed);
                }
            } else {
                // Fallback for non-global audio assembly via xfades
                const offsetTimings = wordTimings.map((w: any) => ({
                    ...w,
                    startMs: w.startMs + cumulativeOffsetMs,
                    end: (w.end * 1000 + cumulativeOffsetMs) / 1000
                }));
                allWordTimings.push(...offsetTimings);

                // Update cumulative offset for NEXT scene
                cumulativeOffsetMs += Math.round(sceneDuration * 1000);
            }
        }

        const aspectRatio = options.aspectRatio || "16:9";
        const dimensions = aspectRatio === "9:16" ? [720, 1280] : aspectRatio === "1:1" ? [1080, 1080] : [1280, 720];

        const assService = new AssCaptionService(dimensions[0], dimensions[1], options.assCaptions);
        const assContent = assService.buildASSFile(allWordTimings);
        fs.writeFileSync(outputPath, assContent);
    }
}
