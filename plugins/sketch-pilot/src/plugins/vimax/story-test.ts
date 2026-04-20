import { LLMServiceFactory } from '../../services/llm'
import { VimaxLLMAdapter } from './core/vimax-llm-adapter'
import { VimaxAgent } from './pipeline/vimax.agent'
import type { SeriesContext } from './types'

/**
 * STORY TEST : "LA QUÊTE DU FRUIT DE L'ESPACE"
 *
 * Ce test valide l'ensemble du pipeline ultra-granulaire :
 * 1. Directed Improvisation (manualEpisodes)
 * 2. Dedicated Animation Agent (Pass 2.2)
 * 3. Dialogue Agent (Pass 2.5) avec Acting
 * 4. Continuité épisodique
 */

const PROVIDER = 'openai'
const API_KEY = process.env.OPENAI_API_KEY

async function runStoryTest() {
  console.log(`\n🚀 Lancement du STORY TEST : La Quête du Fruit de l'Espace\n`)

  if (!API_KEY) {
    console.error('❌ Erreur : OPENAI_API_KEY manquante.')
    return
  }

  const globalLLM = await LLMServiceFactory.create({
    provider: PROVIDER,
    apiKey: API_KEY,
    modelId: 'gpt-4o-mini' // Rapide et efficace pour les tests
  })

  const agent = new VimaxAgent(new VimaxLLMAdapter(globalLLM))

  // --- Bible de l'univers ---
  const context: SeriesContext = {
    seriesBible: {
      genre: 'Aventure Spatiale / Comédie',
      tone: 'Héroïque et Absurde',
      visualStyle: 'Whiteboard Animation',
      universeLaws: ['Les fruits ont des corps humains', 'La gravité est optionnelle'],
      language: 'fr'
    },
    characterRegistry: {},
    locationRegistry: {},
    previousEpisodes: []
  }

  // --- Épisodes Guidés (Directed Improvisation) ---
  const manualEpisodes = [
    "Épisode 1 : @Pomme et @Banane découvrent une vieille carcasse de fusée dans une décharge. [Excité] @Pomme saute partout tandis que @Banane [Inquiet] vérifie le niveau d'huile avec dégoût.",
    "Épisode 2 : L'heure de la construction. @Pomme [Déterminé] soude des plaques de métal. [Maladroit] @Banane essaie de lire la notice à l'envers et [Pointe] une pièce manquante.",
    "Épisode 3 : Le décollage vers l'Inconnu. La fusée tremble. @Pomme [Confiant] tire le levier. [En larmes] @Banane fait ses adieux à la Terre. La fusée s'arrête net à 2 mètres du sol. [Surpris] 'On flotte ?'"
  ]

  try {
    const serie = await agent.runSeries('Une épopée spatiale fruitée', {
      seriesContext: context,
      manualEpisodes,
      targetEpisodeCount: 3,
      maxScenes: 4,
      targetDuration: 30 // 30s par épisode
    })

    console.log(`\n✅ STORY TEST TERMINÉ !`)
    console.log(`🔹 Episodes générés : ${serie.episodes.length}`)

    serie.episodes.forEach((ep, i) => {
      console.log(`\n📺 ÉPISODE ${i + 1} : ${ep.screenplay.seriesMetadata.episodeSummary.slice(0, 80)}...`)
      ep.screenplay.scenes.forEach((scene) => {
        console.log(`   🎬 Scène ${scene.sceneNumber} | Animation: ${scene.animationPrompt} | Acting: ${scene.acting}`)
        if (scene.dialogue?.length) {
          scene.dialogue.forEach((d) => console.log(`      💬 ${d.character} [${d.acting || 'neutral'}]: "${d.text}"`))
        }
      })
    })
  } catch (error) {
    console.error("❌ Échec du test d'histoire :", error)
  }
}

runStoryTest()
