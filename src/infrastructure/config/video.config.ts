import process from 'node:process'

export interface CreditPack {
  id: string
  credits: number
  price: number
  currency: string
  priceId: string
}

export const CREDIT_PACKS: Record<string, CreditPack> = {
  pack_100: {
    id: 'pack_100',
    credits: 100,
    price: 3,
    currency: 'usd',
    priceId: process.env.STRIPE_PRICE_PACK_100 || ''
  },
  pack_300: {
    id: 'pack_300',
    credits: 300,
    price: 7,
    currency: 'usd',
    priceId: process.env.STRIPE_PRICE_PACK_300 || ''
  },
  pack_600: {
    id: 'pack_600',
    credits: 600,
    price: 12,
    currency: 'usd',
    priceId: process.env.STRIPE_PRICE_PACK_600 || ''
  }
}

export const WELCOME_CREDITS = 100

export const CREDIT_COSTS = {
  SCRIPT_GENERATION: 10,
  IMAGE_FREE: 2,
  IMAGE_CREATOR: 10,
  IMAGE_REPROMPT: 5,
  TTS_VOICE: 3,
  SUBTITLES: 2,
  EXPORT_720P: 5,
  EXPORT_1080P: 10
}

export const PLAN_MONTHLY_LIMITS: Record<string, number> = {
  free: 0,

  creator: 500,
  professional: 2000,
  business: 5000,
  enterprise: -1
}

export const VIDEO_TYPES = [
  { id: 'tutorial', name: 'Tutorial', description: 'Step-by-step instructional content' },
  { id: 'explainer', name: 'Explainer', description: 'Explains a concept or idea clearly' },
  { id: 'story', name: 'Story', description: 'Narrative-driven content' },
  { id: 'promotional', name: 'Promotional', description: 'Marketing and product promotion' },
  { id: 'educational', name: 'Educational', description: 'Learning-focused content' },
  { id: 'entertainment', name: 'Entertainment', description: 'Fun and engaging content' }
]

export const VIDEO_GENRES = [
  { id: 'tech', name: 'Technology', description: 'Technology and programming topics' },
  { id: 'science', name: 'Science', description: 'Scientific concepts and discoveries' },
  { id: 'business', name: 'Business', description: 'Business, entrepreneurship and finance' },
  { id: 'health', name: 'Health & Wellness', description: 'Health, fitness and wellness' },
  { id: 'history', name: 'History', description: 'Historical events and figures' },
  { id: 'culture', name: 'Culture', description: 'Art, culture and society' },
  { id: 'sports', name: 'Sports', description: 'Sports and athletics' },
  { id: 'news', name: 'News', description: 'Current events and news' },
  { id: 'motivation', name: 'Motivation', description: 'Motivational and self-improvement' },
  { id: 'comedy', name: 'Comedy', description: 'Humor and entertainment' }
]

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
