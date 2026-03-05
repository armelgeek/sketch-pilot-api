import {
    EnrichedScene,
    ImagePrompt,
    AnimationPrompt,
} from '../types/video-script.types';
import { PromptManager } from './prompt-manager';

/**
 * Generates image and animation prompts from enriched scene descriptions.
 *
 * @deprecated All prompt logic has been centralised in PromptManager.
 * This class is kept as a thin facade for backward compatibility.
 * New code should use PromptManager directly.
 */
export class PromptGenerator {
    readonly manager: PromptManager;

    constructor(manager?: PromptManager) {
        this.manager = manager ?? new PromptManager();
    }

    /**
     * Set the background color for prompts
     */
    setBackgroundColor(color: string) {
        this.manager.setBackgroundColor(color);
    }

    /**
     * Generate a detailed paragraph-style image prompt for a scene.
     * When hasReferenceImages is true, reference image backgrounds are preserved.
     */
    generateImagePrompt(scene: EnrichedScene, hasReferenceImages: boolean = false): ImagePrompt {
        return this.manager.buildImagePrompt(scene, hasReferenceImages);
    }

    /**
     * Generate animation instructions for a scene
     */
    generateAnimationPrompt(scene: EnrichedScene): AnimationPrompt {
        return this.manager.buildAnimationPrompt(scene);
    }
}
