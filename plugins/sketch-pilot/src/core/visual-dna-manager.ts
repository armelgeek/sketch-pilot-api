import type { EnrichedScene } from '../types/video-script.types'
import type { VideoTypeSpecification } from './prompt-maker.types'

export class VisualDNAManager {
  /**
   * Injects Character and Location Visual DNA into the scene prompt.
   *
   * 1. Character Visual DNA: Verbatim text description of characters in scene.
   * 2. Location DNA: Persistent environment description for background consistency.
   */
  public static inject(
    prompt: string,
    scene: EnrichedScene,
    characterRegistry: Record<string, { visualDNA?: string; description?: string }>,
    locationRegistry: Record<string, { visualDNA?: string; description?: string }>,
    spec?: VideoTypeSpecification
  ): string {
    let finalPrompt = prompt

    // 1. Inject Character Visual DNA
    const charactersInScene = scene.charactersInScene || []
    const dnaBlocks: string[] = []

    for (const charId of charactersInScene) {
      const normalizedId = charId.startsWith('@') ? charId : `@${charId}`
      const registryKey = Object.keys(characterRegistry).find(
        (key) => (key.startsWith('@') ? key : `@${key}`).toLowerCase() === normalizedId.toLowerCase()
      )

      if (registryKey) {
        const charData = characterRegistry[registryKey]
        const dna = charData.visualDNA || charData.description
        if (dna) {
          dnaBlocks.push(`[IDENTITY:${charId}] ${dna}`)
        }
      }
    }

    // 2. Inject Location DNA
    if (scene.locationId) {
      const locId = scene.locationId
      // Registry keys might be snake_case or normalizeId version
      const registryKey = Object.keys(locationRegistry).find((key) => key.toLowerCase() === locId.toLowerCase())

      if (registryKey) {
        const locData = locationRegistry[registryKey]
        const dna = locData.visualDNA || locData.description
        if (dna) {
          dnaBlocks.push(`[PLACE:${locId}] ${dna}`)
        }
      }
    }

    if (dnaBlocks.length > 0) {
      finalPrompt = `${dnaBlocks.join(' | ')}. ${finalPrompt}`
    }

    return finalPrompt
  }
}
