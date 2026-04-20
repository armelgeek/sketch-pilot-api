import { LLMServiceFactory } from '../../services/llm'
import { VimaxLLMAdapter } from './core/vimax-llm-adapter'
import { VimaxAgent } from './pipeline/vimax.agent'
import type { SeriesContext } from './types'

async function main() {
  console.log('🎬 Démarrage du pipeline Vimax - BIBLE TEST...')

  const PROVIDER = 'openai'
  const API_KEY = process.env.OPENAI_API_KEY

  if (!API_KEY) {
    console.error('❌ OPENAI_API_KEY manquante.')
    return
  }

  const context: SeriesContext = {
    seriesBible: {
      genre: 'Sketch Viral / Comédie Absurde',
      tone: 'Complètement loufoque et parodique',
      visualStyle: 'Whiteboard Animation colorée',
      universeLaws: [
        'La physique est celle des cartoons (ex: Tom & Jerry)',
        'Les personnages sont excessivement dramatiques pour des problèmes triviaux',
        'Chaque scène finit sur une chute visuelle ou un malentendu'
      ],
      language: 'fr'
    }
  }

  try {
    const globalLLM = await LLMServiceFactory.create({
      provider: PROVIDER,
      apiKey: API_KEY,
      modelId: 'gpt-4o'
    })

    const agent = new VimaxAgent(new VimaxLLMAdapter(globalLLM))

    const result = await agent.runSeries('Une banane pleure car elle est séparée de sa pomme préférée.', {
      seriesContext: context,
      targetDuration: 30,
      maxScenes: 2
    })

    console.log('\n✅ Terminé !')
    console.log(`🔹 Style : ${result.episodes[0].screenplay.scenes[0].imagePrompt}`)
  } catch (error) {
    console.error('❌ Erreur:', error)
  }
}

main()
