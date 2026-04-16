import { VideoGeneratorFactory } from './video-generator.factory'
import type { SeriesVideoGenerator } from './series-video-generator'

async function verify() {
  const config = {
    systemPrompt: 'Base system prompt'
  }

  const extraOptions = {
    seriesId: 'test-series',
    episodeNumber: 1,
    tiktokViral: true
  }

  const generator = VideoGeneratorFactory.create(config, extraOptions) as SeriesVideoGenerator

  console.log('--- NARRATIVE INSTRUCTIONS ---')
  console.log((generator as any).narrativeInstructions)

  const prompts = generator.buildTwoPassPrompts("Une histoire d'horreur", { duration: 60, tiktokViral: true } as any)

  console.log('\n--- PASS 1 SYSTEM PROMPT ---')
  console.log(prompts.pass1.system)

  const pass2 = generator.buildPass2Prompts('Narration test', 'Sujet test', { duration: 60, tiktokViral: true } as any)

  console.log('\n--- PASS 2 SYSTEM PROMPT ---')
  console.log(pass2.system)

  console.log('\n--- PASS 2 USER PROMPT (SCENE RANGE) ---')
  console.log(pass2.user)
}

verify().catch(console.error)
