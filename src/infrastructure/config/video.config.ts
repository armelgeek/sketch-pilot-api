export interface CreditPack {
  id: string
  credits: number
  price: number
  currency: string
  priceId: string
}

export const WELCOME_CREDITS = 0

export const CREDIT_COSTS = {
  SCRIPT_GENERATION: 10,
  IMAGE_FREE: 2,
  IMAGE_CREATOR: 10,
  IMAGE_REPROMPT: 5,
  TTS_VOICE: 3,
  SUBTITLES: 2,
  SUGGEST_TOPIC: 5,
  EXPORT_720P: 5,
  EXPORT_1080P: 10,
  STUDIO_PASS_SURCHARGE: 5, // Fee for ScriptDoctor + ArtDirector + Director passes
  THUMBNAIL_GENERATION: 2,
  CHARACTER_GENERATION: 10
}

export const VOICES = {
  elevenlabs: [
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', language: 'en', gender: 'female' },
    { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', language: 'en', gender: 'male' },
    { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', language: 'en', gender: 'female' },
    { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', language: 'en', gender: 'female' },
    { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', language: 'en', gender: 'male' }
  ],
  google: [
    { id: 'en-US-Neural2-A', name: 'US Female A', language: 'en-US', gender: 'female' },
    { id: 'en-US-Neural2-D', name: 'US Male D', language: 'en-US', gender: 'male' },
    { id: 'fr-FR-Neural2-A', name: 'FR Female A', language: 'fr-FR', gender: 'female' },
    { id: 'fr-FR-Neural2-B', name: 'FR Male B', language: 'fr-FR', gender: 'male' }
  ],
  kokoro: [
    { id: 'af_heart', name: 'Heart', language: 'en-US', gender: 'female' },
    { id: 'af_bella', name: 'Bella', language: 'en-US', gender: 'female' },
    { id: 'am_adam', name: 'Adam', language: 'en-US', gender: 'male' },
    { id: 'am_michael', name: 'Michael', language: 'en-US', gender: 'male' },
    { id: 'bf_emma', name: 'Emma', language: 'en-GB', gender: 'female' },
    { id: 'bm_george', name: 'George', language: 'en-GB', gender: 'male' }
  ]
}

export const MUSIC_TRACKS = [
  { id: 'lofi-1', name: 'Chill Lo-Fi', path: 'lofi-beat.mp3', tags: ['chill', 'lo-fi', 'educational', 'tutorial'] },
  {
    id: 'upbeat-1',
    name: 'Upbeat Corporate',
    path: 'upbeat-corporate.mp3',
    tags: ['upbeat', 'business', 'motivational', 'promo']
  },
  { id: 'ambient-1', name: 'Soft Ambient', path: 'soft-ambient.mp3', tags: ['sad', 'emotional', 'story', 'quiet'] },
  { id: 'fun-1', name: 'Funky Groove', path: 'funky-groove.mp3', tags: ['fun', 'entertainment', 'kids'] }
]
