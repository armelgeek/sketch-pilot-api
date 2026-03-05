/**
 * Audio Service — application-layer facade.
 * Wraps the sketch-pilot audio service factory for use in the backend.
 */
export type {
  AudioService,
  AudioProvider,
  AudioServiceConfig,
  WordTiming,
  AudioGenerationResult,
} from '@sketch-pilot/services/audio'
export { AudioServiceFactory } from '@sketch-pilot/services/audio'
