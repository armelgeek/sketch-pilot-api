import { LLMServiceFactory } from '../../services/llm'
import { VimaxLLMAdapter } from './core/vimax-llm-adapter'
import { VimaxAgent } from './pipeline/vimax.agent'

async function testIncremental() {
  console.log('🚀 Test de génération incrémentale Vimax...')

  const provider = 'openai'
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    console.error(`❌ Erreur : OPENAI_API_KEY manquante.`)
    return
  }

  const globalLLM = await LLMServiceFactory.create({
    provider,
    apiKey,
    modelId: 'gpt-4o'
  })

  const agent = new VimaxAgent(new VimaxLLMAdapter(globalLLM))

  const BIBLE = {
    title: "Les Chroniques de l'IA",
    style: 'Whiteboard animation, minimaliste, feutre noir sur tableau blanc',
    rules: ['Pas de visages humains détaillés', 'Symbolisme fort']
  }

  // État initial de la série
  let context = {
    seriesBible: BIBLE,
    characterRegistry: {},
    locationRegistry: {},
    previousEpisodes: [] as string[]
  }

  // ÉPISODE 1
  const event1 = {
    index: 0,
    description: 'Le détective James découvre une puce étrange dans un vieux réveil.',
    processChain: ['James ouvre le réveil', 'Il trouve la puce', 'La puce émet une lumière bleue'],
    isLast: false
  }

  const result1 = await agent.runNextEpisode(event1, {
    seriesContext: context,
    maxScenes: 4
  })

  console.log('✅ Épisode 1 généré.')
  console.log('--- Résumé :', result1.episode.screenplay.seriesMetadata.episodeSummary)

  // Le contexte a évolué !
  context = result1.updatedContext as any

  // ÉPISODE 2
  const event2 = {
    index: 1,
    description: "James apporte la puce à une hackeuse nommée Sarah pour l'analyser.",
    processChain: ['James entre dans le labo de Sarah', 'Sarah examine la puce', "Sarah a l'air terrifiée"],
    isLast: true
  }

  console.log("\n--- Passage à l'épisode 2 avec continuité automatique ---")
  const result2 = await agent.runNextEpisode(event2, {
    seriesContext: context,
    maxScenes: 4
  })

  console.log('✅ Épisode 2 généré.')
  console.log('--- Résumé :', result2.episode.screenplay.seriesMetadata.episodeSummary)
  console.log('--- Registre Personnages :', JSON.stringify(result2.updatedContext.characterRegistry, null, 2))

  console.log('\n✨ Test incrémental terminé avec succès.')
}

testIncremental().catch(console.error)
