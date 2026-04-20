import { LLMServiceFactory } from '../../services/llm'
import { VimaxLLMAdapter } from './core/vimax-llm-adapter'
import { VimaxAgent } from './pipeline/vimax.agent'
import type { SeriesContext } from './types'

/**
 * TEST DRAMA : Trahison Silencieuse
 * Test du pipeline pour un drame psychologique réaliste (Pass 1 & 2).
 */
async function main() {
  console.log('🎬 Démarrage du pipeline Vimax - MODE DRAME...')

  const PROVIDER = 'openai'
  const API_KEY = process.env.OPENAI_API_KEY

  if (!API_KEY) {
    console.error('❌ OPENAI_API_KEY manquante.')
    return
  }

  // 1. Définition de la Bible Dramatique
  const context: SeriesContext = {
    seriesBible: {
      genre: 'Drame Psychologique',
      tone: 'Intense, Lucide, Mélancolique',
      visualStyle: 'Cinématographique Réaliste (Éclairage naturel, tons froids)',
      universeLaws: [
        'La vérité se manifeste dans les détails et le silence',
        'Réactions émotionnelles contenues mais viscérales',
        'Aucun dialogue superflu'
      ],
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

    const dramaIdea = `
Une jeune femme vit une relation qu’elle croit sincère et profonde avec un homme attentionné. 
Peu à peu, des changements subtils apparaissent : distance, excuses répétées, comportements étranges. 
Refusant d’abord d’y croire, elle finit par découvrir qu’il mène une double vie. 
La vérité s’impose dans le silence. 
Blessée mais lucide, elle choisit de se reconstruire.
`.trim()

    console.log(`⏳ Utilisation de la Bible : ${context.seriesBible?.genre}`)

    const result = await agent.runSeries(dramaIdea, {
      seriesContext: context,
      targetDuration: 60, // 60s total
      maxScenes: 8,
      manualEpisodes: [
        'Épisode 1 : Clara découvre que Lucas mène une double vie en trouvant un second téléphone dans sa sacoche.',
        'Épisode 2 : Elle décide de le confronter silencieusement en préparant son départ définitif dans le calme absolu.'
      ]
    })

    console.log('\n✅ Génération DRAME terminée !')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📺 ANALYSE DE LA NARRATION')

    if (result.episodes[0]) {
      result.episodes[0].screenplay.scenes.forEach((s) => {
        console.log(`\n🎬 Scène ${s.sceneNumber} (${s.duration.toFixed(1)}s):`)
        if (s.dialogue && s.dialogue.length > 0) {
          console.log(`💬 Dialogue: ${s.dialogue.map((d) => `${d.character}: "${d.text}"`).join(' | ')}`)
        }
        console.log(`📝 Narration: ${s.narration}`)
        console.log(`👁️ Visual DNA: ${s.imagePrompt.slice(0, 100)}...`)
      })
    }
  } catch (error: any) {
    console.error('❌ Erreur lors du test drame:', error.message || error)
    if (error.stack) console.error(error.stack)
  }
}

main()
