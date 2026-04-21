import dotenv from 'dotenv'
import { SeriesRepository } from '../../../../../../src/infrastructure/repositories/series.repository'
import { LLMServiceFactory } from '../../../services/llm'
import { SagaProductionService } from '../services/saga-production.service'

/**
 * TEST SAGA PRODUCTION
 * Script pour tester concrètement le service et ses hooks.
 */
async function test() {
  dotenv.config()

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY manquant dans le .env')
    process.exit(1)
  }

  console.log('🏁 Initialisation du test SagaProductionService...')

  const llm = await LLMServiceFactory.create({
    provider: 'openai',
    apiKey,
    modelId: 'gpt-4o-mini'
  })

  const repo = new SeriesRepository()
  const service = new SagaProductionService(llm, repo)

  // On ajoute un écouteur local pour vérifier le "temps réel"
  service.getAgent().registry.register({
    id: 'test-logger',
    onInitialize: async () => console.log('🔔 [HOOK] Agent initialisé'),
    onBeforePlanSaga: async () => console.log('🔔 [HOOK] Début de la planification...'),
    onAfterPlanSaga: async (agent, plan) => {
      console.log('✅ [HOOK] Planification terminée !')
      console.log(`   Saga ID: ${plan.seriesId}`)
      console.log(`   Épisodes prévus: ${plan.plan.episodes.length}`)
    },
    onBeforeEpisode: async (agent, params) => {
      console.log(`🔔 [HOOK] Début Épisode ${params.episodeNumber}...`)
    },
    onAfterEpisode: async (agent, episode) => {
      console.log(`✅ [HOOK] Épisode ${episode.episodeNumber} généré !`)
      console.log(`   Scènes: ${episode.scenes.length}`)
    }
  })

  try {
    const idea = 'Un détective privé qui découvre que son chat est un espion intergalactique'
    console.log(`\n🚀 Lancement de la saga : "${idea}"\n`)

    // Tester la production complète (Pass 0 + Episodes)
    // On limite à 1 épisode pour le test
    const series = await service.produceFullSaga(idea, {
      targetEpisodeCount: 1,
      brainMode: 'all'
    })

    console.log('\n✨ TEST RÉUSSI !')
    console.log('-----------------------------------')
    console.log(`Titre : ${series.title}`)
    console.log(`Nombre d'épisodes : ${series.episodes.length}`)
  } catch (error) {
    console.error('\n❌ ÉCHEC DU TEST :', error)
  }
}

test().catch(console.error)
