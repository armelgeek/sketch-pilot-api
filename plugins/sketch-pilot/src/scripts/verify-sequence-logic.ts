import { SeriesVideoGenerator } from '../core/generators/series-video-generator'
import type { SeriesContext } from '../core/generators/series-video-generator'
import type { VideoGeneratorConfig } from '../core/video-generator.abstract'

async function verifyPrompts() {
  const mockConfig: VideoGeneratorConfig = {
    projectId: 'test',
    systemPrompt: 'Default system prompt',
    userPrompt: '',
    onProgress: (p, m) => console.log(`[Progress ${p}%] ${m}`)
  }

  const mockContext: SeriesContext = {
    seriesId: 'test-saga',
    episodeNumber: 1,
    previousEpisodesContext: 'Une histoire commence.',
    characterRegistry: {
      '@Alaric': { description: 'Un guerrier fatigué' },
      '@Liana': { description: 'Une guérisseuse' }
    },
    locationRegistry: {
      old_temple: { description: 'Un temple en ruines' }
    },
    assetRegistry: {},
    tiktokViral: false
  }

  const generator = new SeriesVideoGenerator(mockConfig, mockContext)

  const narrativeBeats = JSON.stringify([
    "Alaric franchit le seuil du temple. Il s'arrête devant l'autel brisé.",
    "Liana apparaît dans l'ombre, une dague à la main, le regard méfiant."
  ])

  const options = {
    duration: 30,
    language: 'fr'
  }

  console.log('\n--- VERIFYING PASS 2 PROMPTS (SEQUENCE-BASED) ---\n')

  const prompts = generator.buildPass2Prompts(narrativeBeats, 'Test Topic', options as any)

  console.log('--- SYSTEM PROMPT SNIPPET ---')
  console.log(`${prompts.system.slice(0, 1000)}...`)

  console.log('\n--- USER PROMPT SNIPPET ---')
  console.log(prompts.user)

  // Verify that the new keywords are present
  const hasBeats = prompts.user.includes('BEATS NARRATIFS')
  const hasProjection = prompts.user.includes('Projetez visuellement chaque beat')
  const hasSequenceRule = prompts.system.includes('ARCHITECTURE v12.0')

  if (hasBeats && hasProjection && hasSequenceRule) {
    console.log('\n✅ PROMPT VERIFICATION PASSED: Logic is now sequence-based.')
  } else {
    console.error('\n❌ PROMPT VERIFICATION FAILED: Missing new logic indicators.')
  }
}

verifyPrompts().catch(console.error)
