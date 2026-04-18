/**
 * Vimax Unified Type System
 * Ported from Vimax Python Interfaces
 */

export interface VimaxCharacterInScene {
  idx: number
  identifierInScene: string
  isVisible: boolean
  staticFeatures: string
  dynamicFeatures?: string
  cameoPhotoUrl?: string // [V52] AutoCameo support
}

export interface VimaxCharacterInEvent {
  index: number
  identifierInEvent: string
  activeScenes: Record<number, string>
  staticFeatures: string
  cameoPhotoUrl?: string
}

export interface VimaxCharacterInNovel {
  index: number
  identifierInNovel: string
  activeEvents: Record<number, string>
  staticFeatures: string
  cameoPhotoUrl?: string
}

export interface VimaxEnvironmentInScene {
  slugline: string
  description: string
}

export interface VimaxScene {
  idx: number
  isLast: boolean
  environment: VimaxEnvironmentInScene
  characters: VimaxCharacterInScene[]
  script: string
}

export interface VimaxEvent {
  index: number
  isLast: boolean
  description: string
  processChain: string[]
}

export interface VimaxShotBriefDescription {
  idx: number
  isLast: boolean
  camIdx: number
  visualDesc: string
  audioDesc: string | null
}

export interface VimaxShotDescription {
  idx: number
  isLast: boolean
  camIdx: number
  visualDesc: string
  variationType: 'large' | 'medium' | 'small'
  variationReason: string
  ffDesc: string
  ffVisCharIdxs: number[]
  lfDesc: string
  lfVisCharIdxs: number[]
  motionDesc: string
  audioDesc: string | null
}

export interface VimaxCamera {
  idx: number
  activeShotIdxs: number[]
  parentCamIdx: number | null
  parentShotIdx: number | null
  reason: string | null
  isParentFullyCoversChild: boolean | null
  missingInfo: string | null
}

// Helper types for pipeline orchestration
export interface VimaxRegistry {
  characters: Record<string, VimaxCharacterInNovel>
  locations: Record<string, VimaxEnvironmentInScene>
}

export interface VimaxSagaContext {
  arc: string
  registry: VimaxRegistry
  history: VimaxEvent[]
}
