import { z } from '@hono/zod-openapi'

export const VideoOptionsSchema = z
  .object({
    duration: z.number().optional().openapi({ example: 30, description: 'Target duration in seconds' }),
    sceneCount: z.number().optional().openapi({ example: 5, description: 'Number of scenes' }),
    style: z
      .enum(['motivational', 'educational', 'storytelling', 'tutorial'])
      .optional()
      .openapi({ example: 'motivational' }),
    videoType: z
      .string()
      .optional()
      .openapi({ example: 'explainer', description: 'Type of video (tutorial, explainer, story, etc.)' }),
    videoGenre: z
      .string()
      .optional()
      .openapi({ example: 'tech', description: 'Genre/niche (tech, science, business, etc.)' }),
    language: z.string().optional().openapi({ example: 'en-US', description: 'Language code' }),
    imageProvider: z
      .enum(['gemini', 'grok'])
      .optional()
      .openapi({ example: 'gemini', description: 'AI provider for image generation' }),
    audioProvider: z
      .enum(['kokoro', 'google-tts', 'openai-tts', 'elevenlabs', 'demo'])
      .optional()
      .openapi({ example: 'kokoro', description: 'AI provider for audio generation' }),
    kokoroVoicePreset: z
      .string()
      .optional()
      .openapi({ example: 'af_heart', description: 'Voice preset ID for Kokoro TTS' }),
    llmProvider: z
      .enum(['gemini', 'grok', 'claude', 'haiku'])
      .optional()
      .openapi({ example: 'gemini', description: 'AI provider for script generation' }),
    qualityMode: z
      .enum(['low-cost', 'standard', 'high-quality'])
      .optional()
      .openapi({ example: 'standard', description: 'Target quality vs cost balance' }),
    characterConsistency: z
      .boolean()
      .optional()
      .openapi({ example: true, description: 'Maintain consistent characters across scenes' }),
    autoTransitions: z
      .boolean()
      .optional()
      .openapi({ example: true, description: 'Automatically add transitions between scenes' }),
    aspectRatio: z.enum(['9:16', '16:9', '1:1']).optional().openapi({ example: '16:9' }),
    resolution: z.enum(['720p', '1080p', '4k']).optional().openapi({ example: '720p' }),
    animationMode: z
      .enum(['ai', 'panning', 'composition', 'static', 'none'])
      .optional()
      .openapi({ example: 'static', description: 'Animation strategy' }),
    backgroundColor: z.string().optional().openapi({ example: '#FFFFFF' }),
    backgroundMusic: z.string().optional().openapi({ example: 'upbeat' }),
    wordsPerMinute: z.number().optional().openapi({ example: 150 }),
    audioOverlap: z.number().optional().openapi({ example: 0.3 }),
    skipAudio: z.boolean().optional().openapi({ example: false, description: 'Skip audio generation phase' }),
    generateOnlyScenes: z
      .boolean()
      .optional()
      .openapi({ example: false, description: 'Stop after scene generation for manual review' }),
    localOnlyImages: z
      .boolean()
      .optional()
      .openapi({ example: true, description: 'Disable AI image generation, use local assets only' })
  })
  .openapi('VideoOptions')
