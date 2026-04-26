import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import dotenv from 'dotenv'
import { LLMServiceFactory } from '../../../services/llm'
import { CharacterUniverseStore } from '../core/character-universe-store'
import { VimaxLLMAdapter } from '../core/vimax-llm-adapter'
import { VimaxAgent } from '../pipeline/vimax.agent'

async function main() {
  dotenv.config()
  const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('❌ API KEY required (OPENAI_API_KEY or GEMINI_API_KEY)')
    process.exit(1)
  }

  const provider = process.env.OPENAI_API_KEY ? 'openai' : 'gemini'
  const modelId = provider === 'openai' ? 'gpt-4o' : 'gemini-2.5-flash'

  const llmService = await LLMServiceFactory.create({
    provider,
    apiKey,
    modelId
  })

  const agent = new VimaxAgent(new VimaxLLMAdapter(llmService))

  // 1. INITIALISATION DU PERSONNAGE
  const universe = CharacterUniverseStore.getInstance()
  await universe.load()
  await universe.recordEvolution({
    identifier: '@DetectiveSmith',
    physicalDescription:
      "Un homme sec, trench-coat gris, chapeau enfoncé, une montre à gousset qui ne donne pas l'heure.",
    personalityTraits: ['Cynique', 'Précis', 'Fatigué'],
    roleInSaga: 'Enquêteur',
    currentMood: 'Obsédé par les détails'
  })

  // 2. TEST : NARRATION À LA PREMIÈRE PERSONNE ET RYTHME STACCATO
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🎬 TEST NARRATIVE DNA : Voix Interne & Staccato')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const idea =
    'Saga policière. @DetectiveSmith entre dans une pièce sombre où une ampoule vacille. Il trouve une lettre ensanglantée sur le sol. Voix à la première personne, style néo-noir, rythme très syncopé (staccato), avec des tags de respiration pour ElevenLabs.'

  console.log('🕵️ Planning de la saga...')
  const seriesId = await agent.planSaga(idea, { targetDuration: 30, maxScenes: 2 })

  const plan = JSON.parse(
    await fs.readFile(path.join(process.cwd(), 'vimax-logs', 'sagas', seriesId, 'plan.json'), 'utf8')
  )

  console.log('📍 Narrative Intent détecté :')
  console.log(JSON.stringify(plan.plan.intent.narrativeIntent, null, 2))

  console.log("\n🚀 Génération de l'épisode...")
  const episode = await agent.runSingleEpisode(seriesId, 1, plan)

  console.log('\n🔍 ANALYSE DE LA NARRATION :')
  episode.scenes.forEach((s) => {
    console.log(`--- Scène ${s.sceneNumber} ---`)
    console.log(`POV: ${s.charactersInScene.join(', ')}`)
    console.log(`Narration: ${s.narration}`)
    const hasTags = s.narration.includes('<break')
    console.log(`Presence de tags ElevenLabs: ${hasTags ? '✅ OUI' : '❌ NON'}`)

    // Vérification simplifiée du staccato (phrases courtes)
    const sentences = s.narration.split(/[.!?]/).filter((s) => s.trim().length > 0)
    const avgWords =
      sentences.length > 0 ? sentences.reduce((acc, st) => acc + st.trim().split(' ').length, 0) / sentences.length : 0
    console.log(`Nombre de phrases: ${sentences.length} | Moyenne mots/phrase: ${avgWords.toFixed(1)}`)
  })

  console.log('\n✨ Terminé !')
}

main().catch(console.error)
