/**
 * VimaxEvent represents a narrative event to be broken down into scenes.
 */
export interface VimaxEvent {
  id: string
  description: string
  processChain: string[]
  metadata?: Record<string, any>
}

/**
 * VimaxScene represents a single structured scene within the screenplay.
 */
export interface VimaxScene {
  idx: number
  isLast: boolean
  environment: {
    slugline: string
    description: string
  }
  characters: VimaxCharacterRequirement[]
  script: string
}

/**
 * VimaxCharacterRequirement details what a character should look like/do.
 */
export interface VimaxCharacterRequirement {
  name: string
  features: {
    static: string
    dynamic: string
  }
  isOnScreen: boolean
}
