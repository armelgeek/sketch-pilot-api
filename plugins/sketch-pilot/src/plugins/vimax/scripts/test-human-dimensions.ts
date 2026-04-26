import dotenv from 'dotenv'
import { LLMServiceFactory } from '../../../services/llm'
import { CharacterUniverseStore } from '../core/character-universe-store'
import { VimaxLLMAdapter } from '../core/vimax-llm-adapter'
import { VimaxAgent } from '../pipeline/vimax.agent'

async function main() {
  dotenv.config()
  const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('❌ API KEY required (OPENAI_API_KEY or GEMINI_API_KEY)')
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
  console.log('🎬 TEST HUMAN DIMENSIONS (V5.5)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 1. Préparation d'une saga avec intention complexe
  console.log('🕵️ Planning de la saga...')
  const basicIdea = `
Une saga neo-noir sur @DetectiveSmith. 
Il traque un fantôme du passé. 
La saga doit inclure des moments de banalité (petit déjeuner), 
des épisodes choraux où on voit la ville sans lui, 
et l'évolution physique de ses cicatrices.
`

  // On force le mode 'all' pour activer la maturation
  const seriesId = await agent.planSaga(basicIdea, {
    brainMode: 'all',
    targetEpisodeCount: 2
  })

  console.log(`✅ Saga planifiée : ${seriesId}`)

  // 2. Génération d'un épisode pour voir la maturation et les flags
  console.log("\n🚀 Génération de l'épisode 1 (avec Cycle de Maturation)...")
  const episode = await agent.runSingleEpisode(seriesId, 1)

  console.log('\n🔍 ANALYSE V5.5 :')

  const hasDailyLife = episode.scenes.some((s) => (s as any).isDailyLife)
  const hasChoral = episode.scenes.some((s) => (s as any).isChoral)
  const hasAbsence = episode.scenes.some((s) => (s as any).absentProtagonists?.length > 0)
  const hasMaturation = episode.scenes.some((s) => (s as any).maturationCycle?.passCount > 1)

  console.log(`- Scènes de Quotidien détectées : ${hasDailyLife ? '✅' : '❌'}`)
  console.log(`- Narration Chorale détectée : ${hasChoral ? '✅' : '❌'}`)
  console.log(`- Effet d'Absence détecté : ${hasAbsence ? '✅' : '❌'}`)
  console.log(`- Cycle de Maturation appliqué : ${hasMaturation ? '✅' : '❌'}`)

  // 3. Vérification des Traces dans l'Univers
  const universe = CharacterUniverseStore.getInstance()
  await universe.load()
  const Smith = universe.getCharacter('@DetectiveSmith')

  if (Smith?.traces && Smith.traces.length > 0) {
    console.log(`✅ Traces enregistrées pour @DetectiveSmith: ${Smith.traces.map((t) => t.description).join(', ')}`)
  } else {
    console.log('❌ Aucune trace enregistrée pour @DetectiveSmith.')
  }

  console.log('\n🏁 Test terminé.')
}

main().catch(console.error)
