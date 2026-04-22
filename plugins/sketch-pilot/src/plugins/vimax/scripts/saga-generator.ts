import * as path from 'node:path'
import dotenv from 'dotenv'
import { SeriesRepository } from '../../../../../../src/infrastructure/repositories/series.repository'
import { VideoRepository } from '../../../../../../src/infrastructure/repositories/video.repository'
import { LLMServiceFactory } from '../../../services/llm'
import { SagaProductionService } from '../services/saga-production.service'

/**
 * SAGA GENERATOR CLI
 * Focused on the production of a full saga using the decoupled Vimax architecture.
 */
async function main() {
  const args = process.argv.slice(2)
  const idea = args[0]
  const episodeCount = parseInt(args[1] || '3')
  const isProd = args.includes('--prod')

  dotenv.config()

  if (!idea) {
    console.error('❌ Usage: npx ts-node saga-generator.ts "<idea>" [episodeCount] [--prod]')
    process.exit(1)
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY is required.')
    process.exit(1)
  }

  console.log('\n🚀 Lancement du Saga Generator (Vimax Advanced)...')
  console.log(`🎬 Idée : "${idea}"`)
  console.log(`🎞️ Épisodes : ${episodeCount}`)
  console.log(`🧠 Mode : ${isProd ? 'Cortex (Stable)' : 'Hippocampe (Experimental)'}\n`)

  const globalLLM = await LLMServiceFactory.create({
    provider: 'openai',
    apiKey,
    modelId: 'gpt-4o'
  })

  // Use the central Saga Production Service
  const sagaService = new SagaProductionService(globalLLM, new SeriesRepository(), new VideoRepository())

  if (isProd) sagaService.getAgent().setBrainMode('stable')

  try {
    // --- PASS 0: PLANNING ---
    console.log("📝 [Pass 0] Planification de l'arc narratif...")
    const seriesId = await sagaService.createSaga('cli-user', idea, {
      userId: 'cli-user',
      targetEpisodeCount: episodeCount,
      brainMode: isProd ? 'stable' : 'all'
    })

    console.log(`✅ [Pass 0] Plan généré : ${seriesId}`)

    const sagaPlan = await sagaService.loadSagaPlan(seriesId)

    console.log(`\n📚 Bibliographie : ${sagaPlan.seriesBible.genre} - ${sagaPlan.seriesBible.tone}`)
    console.log(`👥 Personnages détectés : ${Object.keys(sagaPlan.characterRegistry).join(', ')}\n`)

    const episodes = []

    for (let i = 1; i <= sagaPlan.episodeEvents.length; i++) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`🎬 ÉPISODE ${i}/${sagaPlan.episodeEvents.length}`)
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

      // --- PASS 1: NARRATION ---
      console.log(`📖 [Pass 1] Rédaction de la narration...`)
      const episode = await sagaService.generateEpisode('cli-user', seriesId, i)

      console.log(`✅ [Pass 1] Narration terminée.`)
      console.log(`🎭 Résumé : ${episode.summary}`)

      // --- PASS 2: SCREENWRITING & VISUALS ---
      console.log(`✍️ [Pass 2] Structuration cinématique et planification visuelle terminée.`)
      console.log(`🎥 Scènes générées : ${episode.scenes.length}`)

      episodes.push(episode)
    }

    console.log(`\n✨ SAGA "${seriesId}" TERMINÉE AVEC SUCCÈS !`)
    const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', seriesId)
    console.log(`📂 Résultats disponibles dans : ${sagaDir}`)
  } catch (error: any) {
    console.error(`\n❌ Erreur pendant la génération :`, error.message)
    if (error.stack) console.error(error.stack)
    process.exit(1)
  }
}

main().catch(console.error)
