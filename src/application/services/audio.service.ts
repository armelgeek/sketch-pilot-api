/**
 * Audio Service — application-layer facade.
 * Wraps the sketch-pilot audio service factory for use in the backend.
 */
export type {
  AudioGenerationResult,
  AudioProvider,
  AudioService,
  AudioServiceConfig,
  WordTiming
} from '@sketch-pilot/services/audio'
export { AudioServiceFactory } from '@sketch-pilot/services/audio'
