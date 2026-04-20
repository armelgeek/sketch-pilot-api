import { LLMServiceFactory } from '../../services/llm'
import { VimaxLLMAdapter } from './core/vimax-llm-adapter'
import { VimaxAgent } from './pipeline/vimax.agent'
import type { SeriesContext } from './types'

/**
 * ACTION & BETRAYAL TEST : "L'INFILTRÉ DU VERGER"
 *
 * Ce test démontre :
 * 1. L'intention 'dramatic' (Action, Trahison, Plot Twists).
 * 2. La flexibilité du nombre d'épisodes (l'IA décide).
 * 3. La richesse narrative sans contraintes rigides.
 */

const PROVIDER = 'openai'
const API_KEY = process.env.OPENAI_API_KEY

async function runActionTest() {
  console.log(`\n🕵️ Lancement du DRAMA TEST : L'Infiltré du Verger\n`)

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
      genre: 'Thriller / Action Espionnage',
      tone: 'Sombre et Paranoïaque',
      visualStyle: 'Noir & Blanc avec touches de rouge',
      universeLaws: ['Les fruits sont des agents secrets', 'Toute communication est surveillée'],
      language: 'fr'
    },
    characterRegistry: {},
    locationRegistry: {},
    previousEpisodes: []
  }

  // Idée riche en trahison et action
  const basicIdea =
    "Un groupe de résistants (mené par @Banane et @Poire) tente d'arrêter une bombe à la station de métro. Mais @Poire cache un secret : il travaille pour l'Empire des Mouches. Une trahison éclate au moment crucial, menant à une poursuite intense. Ne fige pas le nombre d'épisodes, laisse l'histoire se développer."

  try {
    const serie = await agent.runSeries(basicIdea, {
      seriesContext: context,
      // targetEpisodeCount: undefined, // LAISSE L'IA DÉCIDER
      maxScenes: 5, // Bonne densité pour l'action
      targetDuration: 45 // Épisodes de 45s
    })

    console.log(`\n✅ DRAMA TEST TERMINÉ !`)
    console.log(`🔹 Intention détectée : ${serie.intent}`)
    console.log(`🔹 Épisodes planifiés par l'IA : ${serie.episodes.length}`)

    serie.episodes.forEach((ep, i) => {
      console.log(`\n🎬 ÉPISODE ${i + 1} : ${ep.screenplay.seriesMetadata.episodeSummary.slice(0, 120)}...`)
      if (ep.screenplay.seriesMetadata.cliffhanger) {
        console.log(`⚠️ CLIFFHANGER : ${ep.screenplay.seriesMetadata.cliffhanger}`)
      }

      ep.screenplay.scenes.forEach((scene) => {
        console.log(`   🔸 Scène ${scene.sceneNumber} | ${scene.acting} | ${scene.animationPrompt}`)
        if (scene.dialogue?.length) {
          scene.dialogue.forEach((d) => console.log(`      💬 ${d.character}: "${d.text}"`))
        }
      })
    })
  } catch (error) {
    console.error('❌ Échec du test drama :', error)
  }
}

runActionTest()
