import type { CompleteVideoScript } from '../types/video-script.types'

/**
 * Minimum scene fields required by SceneMemoryBuilder.
 */
export interface SceneMemoryInput {
  id: string
  locationId?: string | null
  background?: string | null
  imagePrompt?: string | null
}

/**
 * A visually established location with its reference prompt and origin scene ID.
 */
export interface SceneMemoryLocation {
  prompt: string
  referenceImageId: string
}

/**
 * Inter-scene visual memory structure.
 */
export interface SceneMemory {
  locations: Map<string, SceneMemoryLocation>
  timeOfDay: string
  weather: string
}

/**
 * Analyzes a generated video script and builds a SceneMemory structure.
 */
export class SceneMemoryBuilder {
  /**
   * Build a SceneMemory from a complete script.
   */
  build(script: CompleteVideoScript): SceneMemory
  /**
   * Build a SceneMemory from an array of scene inputs.
   */
  build(scenes: SceneMemoryInput[]): SceneMemory
  build(scriptOrScenes: CompleteVideoScript | SceneMemoryInput[]): SceneMemory {
    if (Array.isArray(scriptOrScenes)) {
      return this.buildFromScenes(scriptOrScenes)
    }
    return this.buildFromScenes(scriptOrScenes.scenes)
  }

  private buildFromScenes(scenes: SceneMemoryInput[]): SceneMemory {
    const memory: SceneMemory = {
      locations: new Map(),
      timeOfDay: '',
      weather: ''
    }

    for (const scene of scenes) {
      this.processScene(scene, memory)
    }

    return memory
  }

  /**
   * Incrementally processes a single scene into the given SceneMemory object.
   */
  public processScene(scene: SceneMemoryInput, memory: SceneMemory): void {
    this.processLocation(scene, memory)
  }

  private processLocation(scene: SceneMemoryInput, memory: SceneMemory): void {
    const locationId = scene.locationId
    const prompt = scene.background || scene.imagePrompt
    if (!locationId || !prompt) return

    if (!memory.locations.has(locationId)) {
      memory.locations.set(locationId, {
        prompt,
        referenceImageId: scene.id
      })
    }
  }
}
