/**
 * Main entry point for the Stickman Generator
 *
 * This file exports all the main components and services
 */

// Core Engine
export { NanoBananaEngine } from './core/nano-banana-engine'
export { VideoScriptGenerator } from './core/video-script-generator'
export { PromptGenerator } from './core/prompt-generator'
export { PromptManager, PromptManagerConfig } from './core/prompt-manager'

// Services
export {
  AnimationProvider,
  AnimationService,
  AnimationServiceConfig,
  AnimationServiceFactory
} from './services/animation'
export { AudioProvider, AudioService, AudioServiceConfig, AudioServiceFactory, WordTiming } from './services/audio'
export { VideoAssembler } from './services/video/video-assembler.service'
export { AssCaptionService } from './services/video/ass-caption.service'
export type { AssCaptionConfig, AssCaptionStyle } from './services/video/ass-caption.service'

// Utils
export { TaskQueue } from './utils/task-queue'

// Types
export * from './types/video-script.types'
