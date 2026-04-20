import { LLMServiceFactory } from '../../services/llm'
import { VimaxLLMAdapter } from './core/vimax-llm-adapter'
import { VimaxAgent } from './pipeline/vimax.agent'
import type { SeriesContext } from './'

/**
 * EXEMPLE D'AUTOMATISATION VIMAX (VERSION FRANÇAISE)
 *
 * Cet exemple montre comment lancer une série complète d'épisodes
 * à partir d'un sujet (topic) unique, en utilisant la factory
 * globale pour le LLM.
 */

// ─── Configuration ────────────────────────────

// Choisis ton sujet ici !
const TOPIC = process.env.TOPIC || 'Un détective privé découvre que sa ville est contrôlée par une IA secrète'

const PROVIDER = 'openai'
const API_KEY = process.env.OPENAI_API_KEY

// ─── Contexte métier par défaut ─────────────────

const context: SeriesContext = {
  seriesBible: {
    genre: 'Science-Fiction / Noir',
    tone: 'Sombre et réaliste'
  },
  characterRegistry: {}, // Sera rempli dynamiquement par l'agent
  locationRegistry: {}, // Sera rempli dynamiquement par l'agent
  previousEpisodes: []
}

// ─── Pipeline Automatisé ──────────────────────

async function demarrerAutomatisation() {
  console.log(`\n🎬 Démarrage du pipeline Vimax en Français...`)
  console.log(`📌 Sujet : "${TOPIC}"`)
  console.log(`🤖 Fournisseur : ${PROVIDER.toUpperCase()}\n`)

  if (!API_KEY) {
    console.error(`❌ Erreur : API_KEY manquante pour ${PROVIDER}.`)
    return
  }

  try {
    // 1. Initialisation du LLM via Factory et Adaptateur
    const globalLLM = await LLMServiceFactory.create({
      provider: PROVIDER,
      apiKey: API_KEY,
      modelId: PROVIDER === 'openai' ? 'gpt-4o' : 'gemini-2.0-flash'
    })

    const agent = new VimaxAgent(new VimaxLLMAdapter(globalLLM))

    // 2. Lancement de la génération de la série complète
    console.log(`⏳ Planification et génération de la série (Pass 0, 1, 2)...`)

    const serie = await agent.runSeries(TOPIC, {
      seriesContext: context,
      compressionThreshold: 3,
      targetDuration: 60,
      maxScenes: 4 // Hard limit: 4 scènes
    })

    // 3. Affichage des résultats
    console.log(`\n✅ Génération terminée avec succès !`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`📺 RÉSUMÉ DE LA SÉRIE`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`🔹 Intention détectée : ${serie.intent}`)
    console.log(`🔹 Nombre d'épisodes : ${serie.episodes.length}`)

    serie.episodes.forEach((episode, i) => {
      console.log(`\n🔸 ÉPISODE ${i + 1} : ${episode.screenplay.seriesMetadata.episodeSummary.slice(0, 100)}...`)
      console.log(`   🎬 Scènes : ${episode.screenplay.scenes.length}`)
      console.log(`   👥 Personnages : ${episode.characterProfiles.map((p) => p.identifier).join(', ')}`)
      console.log(`   📍 Cliffhanger : ${episode.screenplay.seriesMetadata.cliffhanger.description}`)
    })

    console.log(`\n✨ Prêt pour la production vidéo.`)
  } catch (error) {
    console.error(`\n❌ Une erreur est survenue pendant le pipeline :`, error)
  }
}

demarrerAutomatisation()
