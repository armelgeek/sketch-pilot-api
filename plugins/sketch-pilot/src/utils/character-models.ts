import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Character Model Manager
 * Loads and manages character reference images from the models directory.
 * These images are used to maintain character consistency during image generation.
 */

export interface CharacterModel {
    name: string;
    path: string;
    base64: string;
    mimeType: string;
}

export class CharacterModelManager {
    private modelsDir: string;
    private cache: Map<string, CharacterModel> = new Map();

    constructor(modelsDir?: string) {
        this.modelsDir = modelsDir || path.join(process.cwd(), 'models');
    }

    /**
     * Load a specific character model by name
     * Supports: 'standard', 'model-1', 'model-2', 'model-3', 'model-4'
     */
    loadCharacterModel(characterName: string): CharacterModel | null {
        // Check cache first
        if (this.cache.has(characterName)) {
            return this.cache.get(characterName) || null;
        }

        // Map character names to model files
        const modelMap: { [key: string]: string } = {
            'standard': '  model.jpg',
            'model-1': '  model.jpg',
            'model-2': '  model.jpg',
            'model-3': '  model.jpg',
            'model-4': '  model.jpg',
            'professor': '  model.jpg',
            'farmer': '  model.jpg',
            'robot': '  model.jpg',
            'baby': '  model.jpg',
            'investor': '  model.jpg',
        };

        const modelFile = modelMap[characterName] || '  model.jpg';
        const modelPath = path.join(this.modelsDir, modelFile);

        if (!fs.existsSync(modelPath)) {
            console.warn(`[CharacterModels] Model file not found: ${modelPath}`);
            return null;
        }

        try {
            const buffer = fs.readFileSync(modelPath);
            const base64 = buffer.toString('base64');
            const mimeType = this.getMimeType(modelFile);

            const model: CharacterModel = {
                name: characterName,
                path: modelPath,
                base64,
                mimeType,
            };

            // Cache for future use
            this.cache.set(characterName, model);
            console.log(`[CharacterModels] Loaded model: ${characterName} (${modelFile})`);

            return model;
        } catch (error) {
            console.error(`[CharacterModels] Error loading model ${characterName}:`, error);
            return null;
        }
    }

    /**
     * Load all available character models
     */
    loadAllModels(): CharacterModel[] {
        const models: CharacterModel[] = [];
        const characterNames = ['standard', 'professor', 'farmer', 'robot', 'baby', 'investor'];

        for (const name of characterNames) {
            const model = this.loadCharacterModel(name);
            if (model) {
                models.push(model);
            }
        }

        return models;
    }

    /**
     * Get base64-encoded reference images for image generation
     * Returns an array with a single model or multiple models for consistency
     */
    getReferenceImagesForCharacter(characterVariant?: string): string[] {
        const variant = characterVariant || 'standard';
        const model = this.loadCharacterModel(variant);

        if (!model) {
            console.warn(`[CharacterModels] No reference image for character: ${variant}`);
            return [];
        }

        // Return array with the base64 data (format expected by image services)
        return [model.base64];
    }

    /**
     * Get MIME type from filename
     */
    private getMimeType(filename: string): string {
        const ext = path.extname(filename).toLowerCase();
        switch (ext) {
            case '.jpg':
            case '.jpeg':
                return 'image/jpeg';
            case '.png':
                return 'image/png';
            case '.webp':
                return 'image/webp';
            default:
                return 'image/jpeg';
        }
    }

    /**
     * Clear cache (useful for testing or reloading)
     */
    clearCache(): void {
        this.cache.clear();
    }
}

// Singleton instance
let instance: CharacterModelManager | null = null;

export function getCharacterModelManager(): CharacterModelManager {
    if (!instance) {
        instance = new CharacterModelManager();
    }
    return instance;
}
