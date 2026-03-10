import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Character Model Manager
 * Loads and manages character reference images from the models directory.
 * These images are used to maintain character consistency during image generation.
 */

export interface CharacterModel {
  name: string
  path: string
  base64: string
  mimeType: string
}

export class CharacterModelManager {
  private modelsDir: string
  private cache: Map<string, CharacterModel> = new Map()

  constructor(modelsDir?: string) {
    this.modelsDir = modelsDir || path.join(process.cwd(), 'models')
  }

  /**
   * Load a specific character model by name
   * Supports: 'standard', 'model-1', 'model-2', 'model-3', 'model-4'
   */
  loadCharacterModel(characterName: string): CharacterModel | null {
    // Check cache first
    if (this.cache.has(characterName)) {
      return this.cache.get(characterName) || null
    }

    // Map character names to model files
    const modelMap: { [key: string]: string } = {
      standard: 'model.jpg',
      'model-1': 'model.jpg',
      'model-2': 'stick/model-2.webp',
      'model-3': 'stick/model-3.webp',
      'model-4': 'stick/model-4.webp',
      professor: 'model.jpg',
      farmer: 'model.jpg',
      robot: 'model.jpg',
      baby: 'model.jpg',
      investor: 'model.jpg',
      king: 't1.jpg',
      roi: 't1.jpg'
    }

    const modelFile = modelMap[characterName] || 'model.jpg'
    let modelPath = path.join(this.modelsDir, modelFile)

    // Fallback to standard model if specific model file doesn't exist
    if (!fs.existsSync(modelPath) && characterName !== 'standard') {
      console.warn(`[CharacterModels] Model for ${characterName} (${modelFile}) not found. Falling back to standard.`)
      return this.loadCharacterModel('standard')
    }

    // Final sanity check for file existence
    if (!fs.existsSync(modelPath)) {
      console.error(`[CharacterModels] CRITICAL: Standard model file not found at ${modelPath}`)
      // Last resort: try to find ANY image in the directory
      try {
        const files = fs.readdirSync(this.modelsDir)
        const anyImage = files.find((f) => ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(f).toLowerCase()))
        if (anyImage) {
          console.warn(`[CharacterModels] Using last-resort fallback: ${anyImage}`)
          modelPath = path.join(this.modelsDir, anyImage)
        } else {
          return null
        }
      } catch {
        return null
      }
    }

    try {
      const buffer = fs.readFileSync(modelPath)
      const base64 = buffer.toString('base64')
      const mimeType = this.getMimeType(path.basename(modelPath))

      const model: CharacterModel = {
        name: characterName,
        path: modelPath,
        base64,
        mimeType
      }

      // Cache for future use
      this.cache.set(characterName, model)
      console.log(`[CharacterModels] Loaded model: ${characterName} (from ${path.basename(modelPath)})`)

      return model
    } catch (error) {
      console.error(`[CharacterModels] Error loading model ${characterName}:`, error)
      return null
    }
  }

  /**
   * Load all available character models
   */
  loadAllModels(): CharacterModel[] {
    const models: CharacterModel[] = []
    const characterNames = ['standard', 'professor', 'farmer', 'robot', 'baby', 'investor']

    for (const name of characterNames) {
      const model = this.loadCharacterModel(name)
      if (model) {
        models.push(model)
      }
    }

    return models
  }

  /**
   * Get base64-encoded reference images for image generation
   * Returns an array with a single model or multiple models for consistency
   */
  getReferenceImagesForCharacter(characterVariant?: string): string[] {
    const variant = characterVariant || 'standard'
    const model = this.loadCharacterModel(variant)

    if (!model) {
      console.warn(`[CharacterModels] No reference image for character: ${variant}`)
      return []
    }

    // Return array with the base64 data (format expected by image services)
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
