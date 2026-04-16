import type { EnrichedScene } from '../types/video-script.types'

export type CameraActionType =
  | 'none'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'shake'
  | 'breathing'
  | 'snap-zoom'
  | 'dutch-tilt'
  | 'static'

export type TransitionType =
  | 'none'
  | 'fade'
  | 'blur'
  | 'crossfade'
  | 'zoom-in'
  | 'zoom-out'
  | 'dissolve'
  | 'fade-black'
  | 'fade-white'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'circleopen'
  | 'circleclose'
  | 'pixelize'
  | 'radial'
  | 'smooth-left'
  | 'smooth-right'
  | 'smooth-up'
  | 'smooth-down'
  | 'squeezev'
  | 'squeezeh'
  | 'zoomin'
  | 'zoomout'
  | 'diagtl'
  | 'diagtr'
  | 'diagbl'
  | 'diagbr'

export interface CameraAction {
  type: CameraActionType
  intensity: 'low' | 'medium' | 'high'
  targetId?: string
}

export interface CinematicVisuals {
  cameraAction: CameraAction | CameraAction[]
  transition: TransitionType
}

/**
 * CinematicControlEngine
 *
 * Centralizes cinematic logic, camera movements, and shot rhythm rules.
 * Implements Rule 44 (Subject Tracking) and Rule 45 (Shot Scale Variation).
 */
export class CinematicControlEngine {
  private readonly CAMERA_LIST: CameraActionType[] = [
    'zoom-in',
    'zoom-out',
    'shake',
    'pan-left',
    'pan-right',
    'pan-up',
    'pan-down',
    'breathing',
    'snap-zoom',
    'dutch-tilt'
  ]

  private readonly TRANSITION_LIST: TransitionType[] = [
    'fade',
    'crossfade',
    'blur',
    'dissolve',
    'wipe-left',
    'wipe-right',
    'slide-left',
    'slide-right',
    'fade-black'
  ]

  /**
   * Suggest visuals for a scene based on its context and previous scenes' rhythm.
   */
  public suggestVisuals(
    scene: Partial<EnrichedScene>,
    index: number,
    totalScenes: number,
    history: CinematicVisuals[] = []
  ): CinematicVisuals {
    const tension = this.getPacingTension((scene as any).pacing || 'medium')
    const focusTarget = (scene as any).composition?.focusTarget

    // 1. Determine Camera Action
    const cameraAction: CameraAction | CameraAction[] = this.determineCameraAction(
      scene,
      index,
      tension,
      focusTarget,
      history
    )

    // 2. Determine Transition
    const transition: TransitionType = this.determineTransition(scene, index, totalScenes, tension, history)

    return { cameraAction, transition }
  }

  private determineCameraAction(
    scene: Partial<EnrichedScene>,
    index: number,
    pacingTension: number,
    focusTarget?: string,
    history: CinematicVisuals[] = []
  ): CameraAction | CameraAction[] {
    // If scene already has explicit cameraAction, try to normalize or enhance it
    const currentCamType = this.getCameraType(scene.cameraAction)
    if (scene.cameraAction && currentCamType !== 'none' && currentCamType !== 'static') {
      return this.normalizeCameraAction(scene.cameraAction)
    }

    // Rule 44: Subject Tracking Focus
    if (focusTarget) {
      const isCloseUp = (scene as any).shotType === 'CLOSE-UP'
      return {
        type: isCloseUp ? 'snap-zoom' : 'zoom-in',
        intensity: pacingTension > 7 ? 'high' : 'medium',
        targetId: focusTarget
      }
    }

    // Rule 45: Energy & Rhythm
    let type: CameraActionType = 'zoom-in'
    let intensity: 'low' | 'medium' | 'high' = 'medium'

    if (pacingTension > 7) {
      type = index % 3 === 0 ? 'snap-zoom' : 'shake'
      intensity = 'high'
    } else if (pacingTension <= 3) {
      type = 'breathing'
      intensity = 'low'
    } else {
      // Alternating moves
      const options: CameraActionType[] = ['pan-right', 'zoom-in', 'pan-left', 'zoom-out']
      const prevType = this.getLastCameraType(history)
      const available = options.filter((o) => o !== prevType)
      type = available[index % available.length]
      intensity = 'medium'
    }

    return { type, intensity }
  }

  private determineTransition(
    scene: Partial<EnrichedScene>,
    index: number,
    totalScenes: number,
    pacingTension: number,
    history: CinematicVisuals[] = []
  ): TransitionType {
    if (index === totalScenes - 1) return 'none'

    // Use explicit if present
    if (scene.transition && scene.transition !== 'none') {
      return this.normalizeTransition(scene.transition as string)
    }

    // Pacing-aware transitions
    if (pacingTension > 7) {
      return index % 3 === 0 ? 'slide-left' : 'wipe-right'
    } else if (pacingTension <= 3) {
      return 'fade'
    }

    // Default rhythmic alternating
    const options: TransitionType[] = ['dissolve', 'crossfade', 'blur']
    const lastHistory = history.at(-1)
    const prevTrans = lastHistory ? lastHistory.transition : 'none'
    const available = options.filter((o) => o !== prevTrans)
    return available[index % available.length]
  }

  private getPacingTension(pacing: string | number): number {
    if (typeof pacing === 'number') return pacing
    if (pacing === 'fast') return 8
    if (pacing === 'slow') return 2
    return 5
  }

  private getLastCameraType(history: CinematicVisuals[]): CameraActionType {
    const lastItem = history.at(-1)
    if (!lastItem) return 'none'
    const last = lastItem.cameraAction
    if (Array.isArray(last)) return last[0]?.type || 'none'
    return (last as CameraAction)?.type || 'none'
  }

  private normalizeCameraAction(cam: any): CameraAction | CameraAction[] {
    if (Array.isArray(cam)) return cam.map((c) => this.normalizeSingleCameraAction(c))
    return this.normalizeSingleCameraAction(cam)
  }

  private normalizeSingleCameraAction(cam: any): CameraAction {
    if (typeof cam === 'string') {
      return { type: cam as CameraActionType, intensity: 'medium' }
    }
    return {
      type: (cam.type || 'zoom-in') as CameraActionType,
      intensity: (cam.intensity || 'medium') as 'low' | 'medium' | 'high',
      targetId: cam.targetId
    }
  }

  private normalizeTransition(trans: string): TransitionType {
    const t = trans
      .toLowerCase()
      .trim()
      .replaceAll(/[-_\s]+/g, '')
    const mapping: Record<string, TransitionType> = {
      cut: 'none',
      fadeblack: 'fade-black',
      fadewhite: 'fade-white',
      crossfade: 'crossfade',
      swipeleft: 'wipe-left',
      swiperight: 'wipe-right',
      slideleft: 'slide-left',
      slideright: 'slide-right',
      zoomin: 'zoom-in',
      zoomout: 'zoom-out'
    }
    return mapping[t] || (trans as TransitionType)
  }

  /**
   * Deduplicate camera moves and transitions to ensure visual variety.
   */
  public deduplicate(scenes: Partial<EnrichedScene>[]): void {
    scenes.forEach((scene, idx) => {
      if (idx > 0) {
        const prev = scenes[idx - 1]

        // Camera Action Deduplication
        const currentType = this.getCameraType(scene.cameraAction)
        const prevType = this.getCameraType(prev.cameraAction)

        if (currentType && currentType !== 'static' && currentType === prevType) {
          const others = this.CAMERA_LIST.filter((c) => c !== currentType)
          const newType = others[idx % others.length]
          this.setCameraType(scene, newType)
          console.log(`[CinematicControl] 🎥 Fixed duplicate camera action in scene ${idx + 1}: ${newType}`)
        }

        // Transition Deduplication
        if (scene.transition && scene.transition !== 'none' && prev.transition === scene.transition) {
          const others = this.TRANSITION_LIST.filter((t) => t !== scene.transition)
          scene.transition = others[idx % others.length] as any
          console.log(`[CinematicControl] 🎞️ Fixed duplicate transition in scene ${idx + 1}: ${scene.transition}`)
        }
      }
    })
  }

  private getCameraType(cam: any): CameraActionType {
    if (!cam) return 'none'
    if (typeof cam === 'string') return cam as CameraActionType
    if (Array.isArray(cam)) return cam[0]?.type || 'none'
    return cam.type || 'none'
  }

  private setCameraType(scene: any, type: CameraActionType): void {
    if (Array.isArray(scene.cameraAction)) {
      if (scene.cameraAction[0]) scene.cameraAction[0].type = type
      else scene.cameraAction.push({ type, intensity: 'medium' })
    } else if (typeof scene.cameraAction === 'object' && scene.cameraAction) {
      scene.cameraAction.type = type
    } else {
      scene.cameraAction = type
    }
  }

  /**
   * Format the camera action into a text signal for AI animation prompts.
   */
  public formatCameraSignal(cam: any): string {
    const type = this.getCameraType(cam)
    if (!type || type === 'none' || type === 'static') return ''

    let intensity = 'medium'
    if (typeof cam === 'object' && !Array.isArray(cam) && cam.intensity) {
      intensity = cam.intensity
    } else if (Array.isArray(cam) && cam[0]?.intensity) {
      intensity = cam[0].intensity
    }

    const map: Record<CameraActionType, string> = {
      'pan-left': 'pan left slowly',
      'pan-right': 'pan right slowly',
      'pan-up': 'pan up slowly',
      'pan-down': 'pan down slowly',
      'zoom-in': 'slow zoom in into the scene',
      'zoom-out': 'slow zoom out from the scene',
      shake: 'handheld camera shake',
      breathing: 'subtle handheld breathing motion',
      'snap-zoom': 'fast snap zoom toward the subject',
      'dutch-tilt': 'dutch tilt angle, skewed perspective',
      none: '',
      static: ''
    }

    let signal = map[type] || type
    if (intensity === 'high') signal = signal.replace('slow', 'fast').replace('subtle', 'strong')
    if (intensity === 'low') signal = `very ${signal}`

    return `Camera: ${signal}.`
  }
}
