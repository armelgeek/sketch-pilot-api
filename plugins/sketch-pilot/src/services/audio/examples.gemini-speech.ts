/**
 * Example: Gemini Speech Integration with NanoBananaEngine
 *
 * This file demonstrates how to integrate Gemini Speech Generation
 * into the sketch-pilot video generation workflow.
 */

import { AudioServiceFactory, type AudioServiceConfig, type GeminiSpeechOptions } from '../audio'
import {
  buildStyleDirective,
  CHARACTER_PROFILES,
  createVoicePerformance,
  SCENE_CONTEXTS,
  VOICE_STYLES
} from './voice-style-builder'
import type { GeminiVoiceName } from './gemini-speech.service'

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

const GEMINI_AUDIO_CONFIG: AudioServiceConfig = {
  provider: 'gemini-tts',
  apiKey: process.env.GOOGLE_GENAI_API_KEY,
  lang: 'en',
  geminiVoiceName: 'Kore'
}

// ═══════════════════════════════════════════════════════════════════════════════
// Example 1: Simple Single-Speaker Voiceover
// ═══════════════════════════════════════════════════════════════════════════════

export async function exampleSimpleSpeech() {
  console.log('📢 Example 1: Simple Single-Speaker Speech')

  const audioService = AudioServiceFactory.create(GEMINI_AUDIO_CONFIG)

  const scriptText = `Welcome to Sketch Pilot, your creative companion for visual storytelling.
    Today, we're exploring advanced techniques in digital animation and video production.`

  const result = await audioService.generateSpeech(scriptText, './output/intro.wav', {
    voice: 'Puck' as GeminiVoiceName,
    styleDirections: 'Say with enthusiasm and warmth'
  } as GeminiSpeechOptions)

  console.log('✨ Generated audio:', result)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Example 2: Styled Narrative with Director Notes
// ═══════════════════════════════════════════════════════════════════════════════

export async function exampleStyledNarrative() {
  console.log('📖 Example 2: Styled Narrative with Director Notes')

  const audioService = AudioServiceFactory.create(GEMINI_AUDIO_CONFIG)

  const performance = createVoicePerformance({
    text: 'Once upon a time, in a world of infinite possibilities, there lived a dreamer.',
    character: CHARACTER_PROFILES.narrator,
    scene: SCENE_CONTEXTS.audiobook,
    style: VOICE_STYLES.storyteller,
    notes: {
      style: 'Captivating and immersive storytelling',
      pacing: 'Measured and thoughtful with dramatic pauses'
    }
  })

  console.log('📝 Generated prompt:', performance.fullPrompt)

  const result = await audioService.generateSpeech(performance.fullPrompt, './output/narrative.wav', {
    voice: 'Achernar' as GeminiVoiceName
  })

  console.log('✨ Narrative generated:', result)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Example 3: Multi-Speaker Conversation
// ═══════════════════════════════════════════════════════════════════════════════

export async function exampleMultiSpeaker() {
  console.log('🎙️ Example 3: Multi-Speaker Conversation')

  const { GeminiSpeechService } = await import('./gemini-speech.service')
  const audioService = new GeminiSpeechService(process.env.GOOGLE_GENAI_API_KEY || '', 'en', 'Kore')

  const dialogue = `Host: Welcome to the podcast! Today we're discussing artificial intelligence and creativity.
Creator: Thanks for having me! I think AI is a powerful tool for artists.
Host: Can you give us an example?
Creator: Absolutely. AI can help generate ideas, handle repetitive tasks, and inspire new directions.`

  const result = await audioService.generateMultiSpeakerSpeech(dialogue, './output/podcast.wav', [
    {
      speaker: 'Host',
      voiceName: 'Puck',
      styleDirections: 'Sound professional and engaging'
    },
    {
      speaker: 'Creator',
      voiceName: 'Kore',
      styleDirections: 'Sound knowledgeable and passionate'
    }
  ])

  console.log('✨ Podcast generated:', result)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Example 4: Brand Voiceover with Personality
// ═══════════════════════════════════════════════════════════════════════════════

export async function exampleBrandVoiceover() {
  console.log('🎯 Example 4: Brand Voiceover')

  const audioService = AudioServiceFactory.create(GEMINI_AUDIO_CONFIG)

  const fullPrompt = `# AUDIO PROFILE: Sofia Chen
## "The Tech Innovator"

## THE SCENE
A sleek glass-walled office overlooking the San Francisco Bay. Sofia is standing at a standing desk,
gesturing as she speaks. The energy is dynamic and forward-thinking. Large screens display code and designs.

### DIRECTOR'S NOTES

Style:
* Confident and visionary
* Modern and approachable
* Authentically passionate about technology
* The listener should feel inspired and included

Pacing: Speaking at a brisk yet natural pace, with subtle pauses for emphasis on key concepts.
        Never rushed, but energetic.

Accent: Tech-savvy professional from Silicon Valley

## TRANSCRIPT
At Sketch Pilot, we believe creativity should be limitless. Our platform empowers artists,
filmmakers, and creators to bring their boldest visions to life. With cutting-edge AI and
intuitive tools, we're redefining what's possible in visual storytelling.`

  const result = await audioService.generateSpeech(fullPrompt, './output/brand_voiceover.wav', {
    voice: 'Puck' as GeminiVoiceName
  })

  console.log('✨ Brand voiceover generated:', result)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Example 5: Dynamic Style Selection Based on Content
// ═══════════════════════════════════════════════════════════════════════════════

interface ContentEntry {
  text: string
  emotion: 'cheerful' | 'serious' | 'excited' | 'calm' | 'dramatic'
  voicePreference?: GeminiVoiceName
}

export async function exampleDynamicStyle() {
  console.log('🎨 Example 5: Dynamic Style Selection')

  const audioService = AudioServiceFactory.create(GEMINI_AUDIO_CONFIG)

  const contentEntries: ContentEntry[] = [
    {
      text: 'Welcome to our amazing workshop!',
      emotion: 'excited',
      voicePreference: 'Puck'
    },
    {
      text: 'Safety is our top priority in any creative endeavor.',
      emotion: 'serious',
      voicePreference: 'Charon'
    },
    {
      text: 'And now, something magical happens when you press play.',
      emotion: 'dramatic',
      voicePreference: 'Kore'
    },
    {
      text: 'Take a moment to breathe and reflect on your work.',
      emotion: 'calm',
      voicePreference: 'Achernar'
    }
  ]

  for (const [i, entry] of contentEntries.entries()) {
    const stylePreset = VOICE_STYLES[entry.emotion as keyof typeof VOICE_STYLES]
    const styleDirective = buildStyleDirective(stylePreset)

    const result = await audioService.generateSpeech(
      `${styleDirective}: "${entry.text}"`,
      `./output/dynamic_style_${i + 1}.wav`,
      {
        voice: entry.voicePreference || 'Kore'
      }
    )

    console.log(`✨ Part ${i + 1} (${entry.emotion}):`, result.duration, 'seconds')
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Example 6: Using with NanoBananaEngine
// ═══════════════════════════════════════════════════════════════════════════════

export async function exampleWithNanoBananaEngine() {
  console.log('🚀 Example 6: Integration with NanoBananaEngine')

  // This would be used within your NanoBananaEngine workflow
  // to generate voiceovers for video scenes

  interface SceneWithVoiceover {
    sceneId: string
    script: string
    voiceConfig: {
      voice: GeminiVoiceName
      style: string
      character?: string
    }
  }

  const scenes: SceneWithVoiceover[] = [
    {
      sceneId: 'intro',
      script: 'Introducing the future of creative tools',
      voiceConfig: {
        voice: 'Puck',
        style: 'excited',
        character: 'Enthusiastic Host'
      }
    },
    {
      sceneId: 'features',
      script: 'With AI-powered features, you can create in hours what used to take days',
      voiceConfig: {
        voice: 'Kore',
        style: 'professional',
        character: 'Product Specialist'
      }
    },
    {
      sceneId: 'ending',
      script: 'Start your creative journey today',
      voiceConfig: {
        voice: 'Achernar',
        style: 'calm',
        character: 'Closing Narrator'
      }
    }
  ]

  const audioService = AudioServiceFactory.create(GEMINI_AUDIO_CONFIG)

  for (const scene of scenes) {
    const voiceoverPath = `./output/voiceover_${scene.sceneId}.wav`

    const result = await audioService.generateSpeech(
      `Say ${scene.voiceConfig.style}: "${scene.script}"`,
      voiceoverPath,
      {
        voice: scene.voiceConfig.voice
      }
    )

    console.log(`✨ Scene "${scene.sceneId}" voiceover:`, {
      duration: result.duration,
      path: result.audioPath
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Example 7: Accent and Regional Variations
// ═══════════════════════════════════════════════════════════════════════════════

export async function exampleAccents() {
  console.log('🌍 Example 7: Accent and Regional Variations')

  const audioService = AudioServiceFactory.create(GEMINI_AUDIO_CONFIG)

  const testText = 'The quick brown fox jumps over the lazy dog'

  const accentVariations = [
    {
      voiceName: 'Kore' as GeminiVoiceName,
      style: 'with a New York accent'
    },
    {
      voiceName: 'Achernar' as GeminiVoiceName,
      style: 'with a British accent'
    },
    {
      voiceName: 'Puck' as GeminiVoiceName,
      style: 'with a Southern accent'
    },
    {
      voiceName: 'Encelade' as GeminiVoiceName,
      style: 'with an Irish accent'
    }
  ]

  for (const variation of accentVariations) {
    const result = await audioService.generateSpeech(
      `Say ${variation.style}: "${testText}"`,
      `./output/accent_${variation.voiceName.toLowerCase()}.wav`,
      { voice: variation.voiceName }
    )

    console.log(`✨ ${variation.voiceName}:`, result.duration, 'seconds')
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main: Run all examples
// ═══════════════════════════════════════════════════════════════════════════════

export async function runAllExamples() {
  console.log('🎬 Gemini Speech Generation Examples\n')

  try {
    // await exampleSimpleSpeech()
    // await exampleStyledNarrative()
    // await exampleMultiSpeaker()
    // await exampleBrandVoiceover()
    // await exampleDynamicStyle()
    // await exampleWithNanoBananaEngine()
    // await exampleAccents()

    console.log('\n✅ All examples completed successfully!')
  } catch (error) {
    console.error('❌ Error running examples:', error)
  }
}

// Uncomment to run: runAllExamples()
