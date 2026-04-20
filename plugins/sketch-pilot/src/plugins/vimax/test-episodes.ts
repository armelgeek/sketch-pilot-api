import { LLMServiceFactory } from '../../services/llm'
import { VimaxLLMAdapter } from './core/vimax-llm-adapter'
import { VimaxAgent } from './pipeline/vimax.agent'
import type { SeriesContext } from './types'

async function main() {
  console.log('🎬 Démarrage du pipeline Vimax - 5 EPISODES TEST...')

  const PROVIDER = 'openai'
  const API_KEY = process.env.OPENAI_API_KEY

  if (!API_KEY) {
    console.error('❌ OPENAI_API_KEY manquante.')
    return
  }

  const context: SeriesContext = {
    seriesBible: {
      genre: 'Comédie Absurde',
      tone: 'Décalé',
      visualStyle: 'Whiteboard Animation',
      universeLaws: ['Les fruits font du business'],
      language: 'fr'
    }
  }

  try {
    const globalLLM = await LLMServiceFactory.create({
      provider: PROVIDER,
      apiKey: API_KEY,
      modelId: 'gpt-4o-mini'
    })

    const agent = new VimaxAgent(new VimaxLLMAdapter(globalLLM))

    const result = await agent.runSeries('Une pomme et une banane montent une start-up de jus de fruits bio.', {
      seriesContext: context,
      targetEpisodeCount: 5, // <-- FORCE 5 EPISODES
      targetDuration: 150, // 150s total => 30s per episode
      maxScenes: 4 // 4 scenes per episode
    })

    console.log('\n✅ Test 5 épisodes terminé !')
    console.log(`🔹 Nombre d'épisodes générés : ${result.episodes.length}`)

    result.episodes.forEach((ep) => {
      console.log(`📺 Épisode ${ep.eventIndex + 1}: ${ep.eventDescription} (${ep.screenplay.scenes.length} scènes)`)
    })
  } catch (error: any) {
    console.error('❌ Erreur:', error.message || error)
    if (error.stack) console.error(error.stack)
  }
}

main()
