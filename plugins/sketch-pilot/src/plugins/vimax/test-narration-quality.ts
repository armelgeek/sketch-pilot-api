import { LLMServiceFactory } from '../../services/llm'
import { VimaxNarrationAgent } from './agents/vimax-narration.agent'
import { LessonStore } from './core/lesson-store'
import { VimaxLLMAdapter } from './core/vimax-llm-adapter'
import type { SeriesContext, VimaxEvent } from './types'
import 'dotenv/config'

async function testNarration() {
  console.log('🧪 Test de qualité de Narration Vimax...')

  const PROVIDER = 'openai'
  const API_KEY = process.env.OPENAI_API_KEY

  if (!API_KEY) {
    console.error('❌ OPENAI_API_KEY manquante.')
    return
  }

  try {
    const globalLLM = await LLMServiceFactory.create({
      provider: PROVIDER,
      apiKey: API_KEY,
      modelId: 'gpt-4o-mini'
    })

    const llm = new VimaxLLMAdapter(globalLLM)
    const store = LessonStore.getInstance()
    await store.load()

    // Vérification de l'ADN
    const dna = store.getStylisticDNA('narration')
    console.log('🧬 ADN Stylistique détecté:', dna)

    const agent = new VimaxNarrationAgent(llm)

    const context: SeriesContext = {
      seriesBible: {
        genre: 'Thriller Noir',
        tone: 'Sombre',
        visualStyle: 'Cinématique',
        universeLaws: [],
        language: 'fr'
      }
    }

    const event: VimaxEvent = {
      description: 'Eliott découvre un vieux journal dans une malle au grenier.',
      duration: 10,
      isClimax: false
    }

    console.log('\n--- GÉNÉRATION DE NARRATION (DEBUG) ---')
    const result = await agent.generatePolishedNarration(event, context, '40-60 mots')

    console.log('\nNarration Finale :\n', result.narration)
    console.log('\n--- FIN DU TEST ---')
  } catch (error: any) {
    console.error('❌ Erreur:', error.message || error)
  }
}

testNarration()
