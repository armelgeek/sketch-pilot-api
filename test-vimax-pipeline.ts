import process from 'node:process'
import dotenv from 'dotenv'
import { SeriesVideoGenerator } from './plugins/sketch-pilot/src/core/generators/series-video-generator'
import { createVisualRegistry } from './plugins/sketch-pilot/src/core/generators/series/visual-registry'
import { LLMServiceFactory } from './plugins/sketch-pilot/src/services/llm'

dotenv.config()

/**
 * Test Vimax Pipeline Standalone
 * This script demonstrates the Pass 0 to Pass 3 Vimax workflow.
 */
async function runVimaxTest() {
  console.info('🚀 Starting Vimax Pipeline Test...\n')

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('❌ Error: API Key not found in .env')
    return
  }

  // 1. Setup LLM Service
  const llmService = await LLMServiceFactory.create({
    provider: 'openai',
    apiKey,
    cacheSystemPrompt: true
  })

  // 2. Setup Series Context (Ep 1)
  const seriesContext: any = {
    seriesId: 'test-saga-001',
    episodeNumber: 1,
    videoGenre: 'Samurai Cyberpunk',
    artisticStyle: 'Style Anime',
    language: 'fr', // Force French output
    visualRegistry: createVisualRegistry(),
    characterRegistry: {},
    locationRegistry: {},
    assetRegistry: {},
    unresolvedThreads: []
  }

  const generator = new SeriesVideoGenerator({ apiKey } as any, seriesContext)

  // --- PASS 0: GLOBAL ARC ---
  console.info("--- PASS 0: GÉNÉRATION DE L'ARC GLOBAL ---")
  const idea = "Un samouraï futuriste dans Neo-Kyoto à la recherche d'un fantôme numérique perdu."
  const seriesArc = await generator.generateSeriesArc(idea, llmService)
  console.info('✅ Arc Generated:', `${seriesArc.bible.slice(0, 200)}...`)
  console.info('📋 Roadmap:', seriesArc.roadmap.map((r: any) => `Ep ${r.episodeNumber}: ${r.title}`).join(', '))
  console.info('\n')

  // Update context with the roadmap
  seriesContext.plannedEpisodes = seriesArc.roadmap
  seriesContext.totalEpisodes = seriesArc.totalEpisodes
  seriesContext.currentEpisodePitch = seriesArc.roadmap[0].summary

  // --- PASS 1: EPISODE PLAN ---
  console.info(`--- PASS 1: GÉNÉRATION DU PLAN POUR L'ÉPISODE ${seriesContext.episodeNumber} ---`)
  const episodePlan = await generator.generateEpisodePlan(seriesArc, llmService)
  seriesContext.episodePlan = episodePlan
  console.info("✅ Plan d'épisode généré:", episodePlan.scenes.map((s: any) => s.title).join(' -> '))
  console.info('\n')

  // --- PASS 1: NARRATION (SCREENPLAY) ---
  console.info('--- PASS 1: RÉDACTION DU SCÉNARIO ---')
  const script = await generator.generateNarrationWithVimax(llmService)
  console.info('✅ Scénario rédigé (caractères):', script.length)
  console.info('📄 Premiers 150 caractères:', `${script.slice(0, 150)}...`)
  console.info('\n')

  // --- PASS 2: VISUAL ENRICHMENT ---
  console.info('--- PASS 2: ENRICHISSEMENT VISUEL (STORYBOARD & SHOTS VIMAX) ---')
  const enrichedScript = await generator.enrichScriptWithVimax(
    {
      fullNarration: script,
      scenes: episodePlan.scenes,
      characters: [] // Character Extraction happens internally in actual flow
    },
    llmService
  )

  console.info('✅ Script enrichi avec les visuels Vimax :')
  enrichedScript.scenes.slice(0, 2).forEach((s: any, i: number) => {
    console.info(`🎬 Shot ${i}:`)
    console.info(`   - Camera Index: ${s.camIdx}`)
    console.info(`   - FF (Prompt): ${s.ffDesc.slice(0, 60)}...`)
    if (s.motionDesc) console.info(`   - Motion: ${s.motionDesc.slice(0, 60)}...`)
  })

  console.info('\n✨ Test du Pipeline Vimax terminé avec succès !')

  console.info('\n--- JSON FINAL: SERIES ARC ---')
  console.info(JSON.stringify(seriesArc, null, 2))

  console.info('\n--- JSON FINAL: EPISODE PLAN ---')
  console.info(JSON.stringify(episodePlan, null, 2))

  console.info('\n--- JSON FINAL: ENRICHED SCRIPT ---')
  console.info(JSON.stringify(enrichedScript, null, 2))
}

runVimaxTest().catch(console.error)
