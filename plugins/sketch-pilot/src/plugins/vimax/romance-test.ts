import { LLMServiceFactory } from '../../services/llm'
import { VimaxLLMAdapter } from './core/vimax-llm-adapter'
import { VimaxAgent } from './pipeline/vimax.agent'
import type { SeriesContext } from './types'

/**
 * ROMANCE TEST : "LE DUEL DES SAVEURS"
 *
 * Version haute-densité : 8 scènes par épisode.
 * Valide :
 * 1. La gestion de 8 scènes/épisode (Pass 1.5 & Pass 2 loop)
 * 2. La fluidité narrative dans un genre dramatique/romantique
 * 3. La synchronisation Animation/Dialogue avec connaissance mutuelle
 */

const PROVIDER = 'openai'
const API_KEY = process.env.OPENAI_API_KEY

async function runRomanceTest() {
  console.log(`\n💖 Lancement du ROMANCE TEST : Le Duel des Saveurs (8 scènes/épisode)\n`)

  if (!API_KEY) {
    console.error('❌ Erreur : OPENAI_API_KEY manquante.')
    return
  }

  const globalLLM = await LLMServiceFactory.create({
    provider: PROVIDER,
    apiKey: API_KEY,
    modelId: 'gpt-4o-mini'
  })

  const agent = new VimaxAgent(new VimaxLLMAdapter(globalLLM))

  const context: SeriesContext = {
    seriesBible: {
      genre: 'Romance / Comédie Culinaire',
      tone: 'Chaleureux, un peu piquant',
      visualStyle: 'Whiteboard Animation Artistique',
      universeLaws: ['Les fruits sont des chefs cuisiniers', "Les émotions changent la couleur de l'arrière-plan"],
      language: 'fr'
    },
    characterRegistry: {},
    locationRegistry: {},
    previousEpisodes: []
  }

  const basicIdea =
    "Une histoire d'amour entre @Orange (chef étoilé rigide) et @Cerise (pâtissière rebelle) qui doivent sauver leur restaurant ensemble. Ils se détestent d'abord, puis découvrent qu'ils sont complémentaires."

  try {
    const serie = await agent.runSeries(basicIdea, {
      seriesContext: context,
      targetEpisodeCount: 2, // 2 épisodes pour tester la continuité
      maxScenes: 8, // EXPLICITE : 8 par épisode
      targetDuration: 60 // 60s pour 8 scènes (7.5s par scène env.)
    })

    console.log(`\n✅ ROMANCE TEST TERMINÉ !`)
    console.log(`🔹 Episodes générés : ${serie.episodes.length}`)

    serie.episodes.forEach((ep, i) => {
      console.log(`\n📸 ÉPISODE ${i + 1} : ${ep.screenplay.seriesMetadata.episodeSummary.slice(0, 100)}...`)
      console.log(`📊 Nombre de scènes : ${ep.screenplay.scenes.length}`)

      ep.screenplay.scenes.forEach((scene) => {
        console.log(`   🎬 Scène ${scene.sceneNumber} | ${scene.narration.slice(0, 50)}...`)
        console.log(`      ✨ Animation: ${scene.animationPrompt}`)
        console.log(`      💡 ImagePrompt: ${scene.imagePrompt.slice(0, 50)}...`)
        if (scene.dialogue?.length) {
          scene.dialogue.forEach((d) => console.log(`      💬 ${d.character}: "${d.text}" [${d.acting || 'neutral'}]`))
        }
      })
    })
  } catch (error) {
    console.error('❌ Échec du test romance :', error)
  }
}

runRomanceTest()
