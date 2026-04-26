import dotenv from 'dotenv'
import { LLMServiceFactory } from '../../../services/llm'
import { VimaxLLMAdapter } from '../core/vimax-llm-adapter'
import { VimaxAgent } from '../pipeline/vimax.agent'

async function main() {
  dotenv.config()
  const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('❌ API KEY required')
    process.exit(1)
  }

  const provider = process.env.OPENAI_API_KEY ? 'openai' : 'gemini'
  const modelId = provider === 'openai' ? 'gpt-4o' : 'gemini-2.0-flash'

  const llmService = await LLMServiceFactory.create({
    provider,
    apiKey,
    modelId
  })

  const agent = new VimaxAgent(new VimaxLLMAdapter(llmService))

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('⚡ BENCHMARK : PARALLEL GENERATION (V6.0)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const idea = "Un duel au sommet sur le toit d'un train à grande vitesse entre @DetectiveSmith et son rival."

  console.log('🕵️ Planning...')
  const seriesId = await agent.planSaga(idea, { targetDuration: 30, maxScenes: 2 })

  console.log('\n🚀 Starting Episode Generation (Parallel Active)...')
  const start = Date.now()

  const episode = await agent.runSingleEpisode(seriesId, 1)

  const end = Date.now()
  const duration = (end - start) / 1000

  console.log(`\n✅ Episode generated in ${duration.toFixed(2)}s`)
  console.log(`- Total Scenes: ${episode.scenes.length}`)
  console.log(`- Avg Time/Scene: ${(duration / episode.scenes.length).toFixed(2)}s`)

  // Verification of assets
  const firstScene = episode.scenes[0]
  const hasVisual = !!firstScene.imagePrompt
  const hasMeta = !!firstScene.cameraAction
  const hasAnim = !!firstScene.animationPrompt

  console.log(`\n🔍 Integrity Check :`)
  console.log(`- Visuals synced: ${hasVisual ? '✅' : '❌'}`)
  console.log(`- Metadata (Camera) synced: ${hasMeta ? '✅' : '❌'}`)
  console.log(`- Animation synced: ${hasAnim ? '✅' : '❌'}`)

  console.log('\n🏁 Benchmark finished.')
}

main().catch(console.error)
