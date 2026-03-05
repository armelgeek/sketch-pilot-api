/**
 * Main entry point for the Stickman Generator
 * 
 * This file exports all the main components and services
 */

// Core Engine
export { NanoBananaEngine } from './core/nano-banana-engine';
export { VideoScriptGenerator } from './core/video-script-generator';
export { PromptGenerator } from './core/prompt-generator';
export { PromptManager, PromptManagerConfig } from './core/prompt-manager';
export { NARRATIVE_ARCS, GENRE_STORYTELLING, buildNarrativeArcPrompt, scaleNarrativeArc } from './core/narrative-arc';
export type { NarrativeArc, NarrativeSceneRole, GenreStorytelling } from './core/narrative-arc';

// Services
export { 
    AnimationService, 
    AnimationServiceFactory, 
    AnimationServiceConfig,
    AnimationProvider 
} from './services/animation';
export { 
    AudioService, 
    AudioServiceFactory, 
    AudioServiceConfig,
    AudioProvider 
} from './services/audio';
export { VideoAssembler } from './services/video/video-assembler.service';
export { AssCaptionService } from './services/video/ass-caption.service';
export type { AssCaptionStyle, AssCaptionConfig, WordTiming as AssWordTiming } from './services/video/ass-caption.service';

// Utils
export { TaskQueue } from './utils/task-queue';

// Types
export * from './types/video-script.types';
