import * as path from 'node:path'

/**
 * Character Model Manager
 * Loads and manages character reference images.
 * These images are used to maintain character consistency during image generation.
 *
 * 100% Dynamic Version: No hardcoded model maps or local file fallbacks.
 * Everything must be provided via the external loader (e.g. Database).
 */

export interface CharacterModel {
  name: string
  path: string
  base64: string
  mimeType: string
}

export type CharacterModelLoader = (identifier: {
  id?: string
  name?: string
  gender?: string
  age?: string
}) => Promise<CharacterModel | null>

export class CharacterModelManager {
  private cache: Map<string, CharacterModel> = new Map()
  private externalLoader: CharacterModelLoader | null = null

  constructor() {
    // No local models directory needed anymore for fallbacks
  }

  /**
   * Set an external loader (e.g. from database)
   */
  setExternalLoader(loader: CharacterModelLoader): void {
    this.externalLoader = loader
    this.cache.clear()
  }

  /**
   * Load a specific character model by ID, name, or metadata
   */
  async loadCharacterModel(identifier: {
    id?: string
    name?: string
    gender?: string
    age?: string
  }): Promise<CharacterModel | null> {
    const cacheKey = identifier.id || identifier.name || `${identifier.gender}-${identifier.age}`
    if (!cacheKey) return null

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) || null
    }

    // Use external loader (e.g. database)
    if (this.externalLoader) {
      try {
        const externalModel = await this.externalLoader(identifier)
        if (externalModel) {
          this.cache.set(cacheKey, externalModel)
          return externalModel
        }
      } catch (error) {
        console.error(`[CharacterModels] External loader error for ${JSON.stringify(identifier)}:`, error)
      }
    }

    return null
  }

  /**
   * Load a specific character model by ID
   */
  async loadCharacterModelById(id: string): Promise<CharacterModel | null> {
    return this.loadCharacterModel({ id })
  }

  /**
   * Load all available character models
   */
  async loadAllModels(): Promise<CharacterModel[]> {
    // Without local modelMap, we can't "pre-guess" which models to load.
    // This is primarily used for UI lists if needed.
    return Array.from(this.cache.values())
  }

  /**
   * Get base64-encoded reference images for image generation
   * Returns an array with a single model or multiple models for consistency
   */
  async getReferenceImagesForCharacter(characterVariant?: string): Promise<string[]> {
    const variant = characterVariant || 'standard'
    const model = await this.loadCharacterModel({ name: variant })

    if (!model) {
      // Return empty to signify no reference images should be used
      return []
    }

    // Return array with the base64 data
    return [model.base64]
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase()
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg'
      case '.png':
        return 'image/png'
      case '.webp':
        return 'image/webp'
      default:
        return 'image/jpeg'
    }
  }

  /**
   * Clear cache (useful for testing or reloading)
   */
  clearCache(): void {
    this.cache.clear()
  }
}

// Singleton instance
let instance: CharacterModelManager | null = null

export function getCharacterModelManager(): CharacterModelManager {
  if (!instance) {
    instance = new CharacterModelManager()
  }
  return instance
}
