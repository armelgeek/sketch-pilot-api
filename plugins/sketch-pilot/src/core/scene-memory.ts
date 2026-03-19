import type { CharacterSheet, CompleteVideoScript, EnrichedScene } from '../types/video-script.types'

/**
 * Minimum scene fields required by SceneMemoryBuilder.
 * Using a structural subtype avoids forcing callers to cast partially-built scenes.
 */
export type SceneMemoryInput = Pick<EnrichedScene, 'id' | 'expression' | 'characterIds' | 'props'> & {
  locationId?: string | null
  background?: string | null
  lighting?: string | null
}

/**
 * A visually established location with its reference prompt and origin scene ID.
 */
export interface SceneMemoryLocation {
  /** The background/environment prompt established when this location first appeared */
  prompt: string
  /** Scene ID where this location was first visually established */
  referenceImageId: string
}

/**
 * A recurring character with their current visual state.
 */
export interface SceneMemoryCharacter {
  /** Full character description (name, appearance, clothing) */
  description: string
  /** Scene ID where this character was first introduced */
  referenceImageId: string
  /** Props currently carried/associated with this character */
  currentProps: string[]
  /** Current emotional state */
  currentEmotion: string
}

/**
 * Inter-scene visual memory structure.
 *
 * Populated by SceneMemoryBuilder before image generation, then injected
 * into buildImagePrompt() to ensure visual continuity across scenes.
 *
 * @example
 * // Scene 2 establishes a train station; scene 8 reuses the same background
 * memory.locations.get("train-station")
 * // => { prompt: "Paris train station, stone arches, glass roof...", referenceImageId: "scene-2" }
 *
 * // Character "Alex" carries a backpack from scene 1 through scene 9
 * memory.characters.get("Alex")
 * // => { ..., currentProps: ["backpack"], currentEmotion: "focused" }
 */
export interface SceneMemory {
  /** Visually established locations, keyed by locationId */
  locations: Map<string, SceneMemoryLocation>
  /** Recurring characters and their current visual state, keyed by character name or ID */
  characters: Map<string, SceneMemoryCharacter>
  /** Established time of day for the narrative (e.g. "morning", "evening") */
  timeOfDay: string
  /** Established weather conditions for the narrative (e.g. "sunny", "rainy") */
  weather: string
}

/**
 * Analyzes a generated video script and builds a SceneMemory structure
 * that captures visual continuities across scenes.
 *
 * Used before image generation to ensure:
 * - Locations look the same across all scenes that share a locationId
 * - Characters maintain their appearance (props, emotions) across scenes
 * - Time of day and weather remain consistent throughout the narrative
 *
 * @example
 * const builder = new SceneMemoryBuilder()
 * const memory = builder.build(completeScript)
 * // Then pass memory to promptManager.buildImagePrompt(scene, ..., memory)
 */
export class SceneMemoryBuilder {
  /**
   * Build a SceneMemory from a complete script (includes character sheets for richer descriptions).
   */
  build(script: CompleteVideoScript): SceneMemory
  /**
   * Build a SceneMemory from an array of scene inputs (a subset of EnrichedScene fields).
   * Accepts partially-built scenes so callers need not cast before image prompts are generated.
   */
  build(scenes: SceneMemoryInput[]): SceneMemory
  build(scriptOrScenes: CompleteVideoScript | SceneMemoryInput[]): SceneMemory {
    if (Array.isArray(scriptOrScenes)) {
      return this.buildFromScenes(scriptOrScenes, [])
    }
    return this.buildFromScenes(scriptOrScenes.scenes, scriptOrScenes.characterSheets ?? [])
  }

  private buildFromScenes(scenes: SceneMemoryInput[], characterSheets: CharacterSheet[]): SceneMemory {
    const memory: SceneMemory = {
      locations: new Map(),
      characters: new Map(),
      timeOfDay: '',
      weather: ''
    }

    // Build a character name/id → description lookup from the character sheets
    const charDescriptionMap = this.buildCharDescriptionMap(characterSheets)

    for (const scene of scenes) {
      this.processScene(scene, memory, charDescriptionMap)
    }

    return memory
  }

  /**
   * Builds the character lookup map for processing scenes.
   */
  public buildCharDescriptionMap(characterSheets: CharacterSheet[]): Map<string, string> {
    const charDescriptionMap = new Map<string, string>()
    for (const sheet of characterSheets) {
      const desc = [sheet.name, sheet.appearance?.description, sheet.appearance?.clothing].filter(Boolean).join(', ')
      if (sheet.id) charDescriptionMap.set(sheet.id, desc)
      charDescriptionMap.set(sheet.name, desc)
    }
    return charDescriptionMap
  }

  /**
   * Incrementally processes a single scene into the given SceneMemory object.
   */
  public processScene(scene: SceneMemoryInput, memory: SceneMemory, charDescriptionMap: Map<string, string>): void {
    this.processLocation(scene, memory)
    this.processCharacters(scene, memory, charDescriptionMap)
    this.processTemporalContext(scene, memory)
  }

  /**
   * Register a new location the first time we encounter its locationId.
   * Subsequent scenes with the same locationId will reuse the established prompt.
   */
  private processLocation(scene: SceneMemoryInput, memory: SceneMemory): void {
    const locationId = scene.locationId
    if (!locationId || !scene.background) return

    if (!memory.locations.has(locationId)) {
      memory.locations.set(locationId, {
        prompt: scene.background,
        referenceImageId: scene.id
      })
    }
  }

  /**
   * Track character state (props, emotion) as we progress through the narrative.
   * First appearance registers the character; later scenes update their current state.
   */
  private processCharacters(
    scene: SceneMemoryInput,
    memory: SceneMemory,
    charDescriptionMap: Map<string, string>
  ): void {
    if (!scene.characterIds || scene.characterIds.length === 0) return

    for (const charId of scene.characterIds) {
      if (!charId) continue

      const existing = memory.characters.get(charId)
      const description = charDescriptionMap.get(charId) ?? charId

      if (!existing) {
        // First appearance — register the character with initial state
        memory.characters.set(charId, {
          description,
          referenceImageId: scene.id,
          currentProps: scene.props ?? [],
          currentEmotion: scene.expression ?? ''
        })
      } else {
        // Later appearance — update current props and emotion
        if (scene.props !== undefined) {
          existing.currentProps = scene.props
        }
        if (scene.expression !== undefined && scene.expression !== null) {
          existing.currentEmotion = scene.expression
        }
      }
    }
  }

  /**
   * Extract time-of-day and weather from scene metadata.
   * Only records the first values encountered to maintain narrative consistency.
   */
  private processTemporalContext(scene: SceneMemoryInput, memory: SceneMemory): void {
    if (!memory.timeOfDay) {
      const lighting = (scene.lighting ?? '').toLowerCase()
      if (lighting.includes('morning') || lighting.includes('dawn') || lighting.includes('sunrise')) {
        memory.timeOfDay = 'morning'
      } else if (lighting.includes('noon') || lighting.includes('midday') || lighting.includes('afternoon')) {
        memory.timeOfDay = 'afternoon'
      } else if (lighting.includes('evening') || lighting.includes('sunset') || lighting.includes('dusk')) {
        memory.timeOfDay = 'evening'
      } else if (lighting.includes('night') || lighting.includes('midnight')) {
        memory.timeOfDay = 'night'
      }
    }

    if (!memory.weather) {
      const bg = (scene.background ?? '').toLowerCase()
      if (bg.includes('rain') || bg.includes('rainy')) {
        memory.weather = 'rainy'
      } else if (bg.includes('snow') || bg.includes('snowy')) {
        memory.weather = 'snowy'
      } else if (bg.includes('sunny') || bg.includes('clear sky')) {
        memory.weather = 'sunny'
      } else if (bg.includes('cloud') || bg.includes('overcast')) {
        memory.weather = 'cloudy'
      } else if (bg.includes('fog') || bg.includes('mist')) {
        memory.weather = 'foggy'
      }
    }
  }
}
