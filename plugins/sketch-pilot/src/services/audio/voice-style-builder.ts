/**
 * Voice Style Builder Utility
 *
 * Provides helpers for constructing natural language style directives
 * for Gemini Speech Generation TTS with advanced control over tone,
 * accent, pacing, and other vocal characteristics.
 */

export interface VoiceStyleConfig {
  emotion?: string
  pace?: 'slow' | 'normal' | 'fast' | 'variable'
  accent?: string
  tone?: string
  breathing?: boolean
  emphasis?: string[] | readonly string[]
  volume?: 'soft' | 'normal' | 'loud'
  energy?: 'low' | 'medium' | 'high'
}

export interface AudioProfileConfig {
  characterName: string
  characterRole: string
  characterAge?: string
  characterBackground?: string
}

export interface SceneContext {
  location: string
  environment: string
  mood: string
  timeOfDay?: string
  background?: string
}

export interface DirectorNotes {
  style?: string
  pacing?: string
  accent?: string
  breathing?: string
  emphasis?: string
  [key: string]: string | undefined
}

/**
 * Builds a simple style directive string
 */
export function buildStyleDirective(style: VoiceStyleConfig): string {
  const directives: string[] = []

  if (style.emotion) {
    directives.push(`Say with a ${style.emotion} tone`)
  }

  if (style.pace) {
    const paceMap = {
      slow: 'slowly and deliberately',
      normal: 'at a natural pace',
      fast: 'quickly and energetically',
      variable: 'with varied pacing'
    }
    directives.push(paceMap[style.pace])
  }

  if (style.accent) {
    directives.push(`with a ${style.accent} accent`)
  }

  if (style.tone) {
    directives.push(`in a ${style.tone} tone`)
  }

  if (style.volume) {
    const volumeMap = {
      soft: 'softly (almost whispering)',
      normal: 'at normal volume',
      loud: 'with projection'
    }
    directives.push(volumeMap[style.volume])
  }

  if (style.energy) {
    const energyMap = {
      low: 'with low energy',
      medium: 'with moderate energy',
      high: 'with high energy and enthusiasm'
    }
    directives.push(energyMap[style.energy])
  }

  if (style.breathing && style.breathing === true) {
    directives.push('with natural breathing pauses')
  }

  if (style.emphasis && style.emphasis.length > 0) {
    const emphasized = Array.from(style.emphasis)
      .map((e) => `"${e}"`)
      .join(', ')
    directives.push(`emphasizing the words: ${emphasized}`)
  }

  return directives.join(', ')
}

/**
 * Builds complete audio profile prompt with scene and director notes
 * For highly controlled performances
 */
export function buildCompleteAudioProfile(config: {
  profile: AudioProfileConfig
  scene: SceneContext
  directorNotes: DirectorNotes
  transcript: string
}): string {
  const lines: string[] = []

  // Audio Profile Section
  lines.push(`# AUDIO PROFILE: ${config.profile.characterName}`)
  lines.push(`## "${config.profile.characterRole}"`)

  if (config.profile.characterAge || config.profile.characterBackground) {
    lines.push('### Character Details')
    if (config.profile.characterAge) lines.push(`- Age: ${config.profile.characterAge}`)
    if (config.profile.characterBackground) lines.push(`- Background: ${config.profile.characterBackground}`)
  }

  // Scene Section
  lines.push('')
  lines.push('## THE SCENE')
  lines.push(`Location: ${config.scene.location}`)
  lines.push(`Environment: ${config.scene.environment}`)
  lines.push(`Mood: ${config.scene.mood}`)
  if (config.scene.timeOfDay) lines.push(`Time: ${config.scene.timeOfDay}`)
  if (config.scene.background) lines.push(`Background: ${config.scene.background}`)

  // Director's Notes Section
  lines.push('')
  lines.push("### DIRECTOR'S NOTES")

  const directorLines = Object.entries(config.directorNotes)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)

  lines.push(directorLines.join('\n'))

  // Transcript Section
  lines.push('')
  lines.push('## TRANSCRIPT')
  lines.push(config.transcript)

  return lines.join('\n')
}

/**
 * Predefined voice styles for common use cases
 */
export const VOICE_STYLES = {
  cheerful: {
    emotion: 'cheerful',
    energy: 'high',
    tone: 'bright and uplifting',
    volume: 'normal'
  },
  serious: {
    emotion: 'serious',
    energy: 'medium',
    tone: 'professional and authoritative',
    volume: 'normal'
  },
  whisper: {
    emotion: 'mysterious',
    volume: 'soft',
    breathing: true,
    energy: 'low'
  },
  excited: {
    emotion: 'excited',
    energy: 'high',
    pace: 'fast',
    tone: 'enthusiastic and passionate',
    volume: 'loud'
  },
  calm: {
    emotion: 'calm',
    energy: 'low',
    pace: 'slow',
    tone: 'soothing and peaceful',
    volume: 'soft'
  },
  sarcastic: {
    emotion: 'sarcastic',
    tone: 'witty and ironic',
    pace: 'variable',
    energy: 'medium'
  },
  dramatic: {
    emotion: 'dramatic',
    energy: 'high',
    tone: 'theatrical and expressive',
    volume: 'loud',
    breathing: true,
    emphasis: ['key words', 'climactic moments']
  },
  robotic: {
    tone: 'mechanical and artificial',
    pace: 'normal',
    breathing: false,
    energy: 'low'
  },
  storyteller: {
    emotion: 'engaging',
    pace: 'variable',
    tone: 'warm and inviting',
    energy: 'medium',
    breathing: true
  },
  newscaster: {
    emotion: 'professional',
    tone: 'authoritative and clear',
    pace: 'normal',
    energy: 'medium',
    volume: 'normal'
  }
} as const

/**
 * Predefined character profiles
 */
export const CHARACTER_PROFILES = {
  youngChild: {
    characterName: 'Young Voice',
    characterRole: 'child',
    characterAge: '6-8 years old',
    characterBackground: 'curious and playful'
  },
  teenager: {
    characterName: 'Teen Voice',
    characterRole: 'teenager',
    characterAge: '13-16 years old',
    characterBackground: 'energetic and expressive'
  },
  businessExecutive: {
    characterName: 'Executive',
    characterRole: 'business professional',
    characterAge: '35-50 years old',
    characterBackground: 'experienced and confident'
  },
  teacher: {
    characterName: 'Educator',
    characterRole: 'teacher',
    characterAge: '30-50 years old',
    characterBackground: 'knowledgeable and patient'
  },
  narrator: {
    characterName: 'Narrator',
    characterRole: 'story narrator',
    characterAge: '40-60 years old',
    characterBackground: 'polished and articulate'
  },
  announcer: {
    characterName: 'Announcer',
    characterRole: 'broadcast announcer',
    characterAge: '30-45 years old',
    characterBackground: 'professional and clear'
  }
} as const

/**
 * Predefined scene contexts
 */
export const SCENE_CONTEXTS = {
  studioRecording: {
    location: 'Professional recording studio',
    environment: 'Sound-treated, bright, and modern',
    mood: 'Focused and professional'
  },
  liveInterview: {
    location: 'Interview setting',
    environment: 'Dynamic and interactive',
    mood: 'Engaging and conversational'
  },
  audiobook: {
    location: 'Isolated recording studio',
    environment: 'Peaceful and undisturbed',
    mood: 'Immersive and intimate'
  },
  podcast: {
    location: 'Home or studio setup',
    environment: 'Relaxed and informal',
    mood: 'Conversational and friendly'
  },
  dramaTheater: {
    location: 'Theater stage',
    environment: 'Grand and theatrical',
    mood: 'Dramatic and impactful'
  },
  newsRoom: {
    location: 'News broadcasting studio',
    environment: 'Professional and controlled',
    mood: 'Serious and authoritative'
  }
} as const

/**
 * Helper to create a quick style directive from preset
 */
export function getPresetStyle(presetName: keyof typeof VOICE_STYLES): string {
  const preset = VOICE_STYLES[presetName]
  return buildStyleDirective(preset)
}

/**
 * Helper to create director notes from a text description
 */
export function buildDirectorNotesFromDescription(description: string): DirectorNotes {
  return {
    style: description,
    pacing: 'Adjust pacing as needed for natural delivery'
  }
}

/**
 * Builds a multi-speaker dialogue prompt with character introductions
 */
export function buildDialoguePrompt(speakers: Array<{ name: string; dialogue: string; style?: string }>): string {
  return speakers
    .map((speaker) => {
      const intro = speaker.style ? `${speaker.name} (${speaker.style}):` : `${speaker.name}:`
      return `${intro} ${speaker.dialogue}`
    })
    .join('\n')
}

/**
 * Validates that a style configuration is reasonable and complete
 */
export function validateStyleConfig(style: Partial<VoiceStyleConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (style.pace && !['slow', 'normal', 'fast', 'variable'].includes(style.pace)) {
    errors.push('Invalid pace value. Must be: slow, normal, fast, or variable')
  }

  if (style.volume && !['soft', 'normal', 'loud'].includes(style.volume)) {
    errors.push('Invalid volume value. Must be: soft, normal, or loud')
  }

  if (style.energy && !['low', 'medium', 'high'].includes(style.energy)) {
    errors.push('Invalid energy value. Must be: low, medium, or high')
  }

  if (style.emphasis && typeof style.emphasis !== 'object') {
    errors.push('Emphasis must be an array of words')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Example wrapper combining all components
 */
export function createVoicePerformance(config: {
  text: string
  character: AudioProfileConfig
  scene: SceneContext
  style: VoiceStyleConfig
  notes?: Partial<DirectorNotes>
}): {
  simplePrompt: string
  fullPrompt: string
  styleDirective: string
} {
  const styleDirective = buildStyleDirective(config.style)

  const simplePrompt = `${styleDirective}: "${config.text}"`

  const fullPrompt = buildCompleteAudioProfile({
    profile: config.character,
    scene: config.scene,
    directorNotes: {
      style: config.style.emotion,
      pacing: config.style.pace === 'variable' ? 'Vary pacing for emphasis' : `Speak ${config.style.pace}`,
      accent: config.style.accent,
      ...config.notes
    },
    transcript: config.text
  })

  return {
    simplePrompt,
    fullPrompt,
    styleDirective
  }
}
