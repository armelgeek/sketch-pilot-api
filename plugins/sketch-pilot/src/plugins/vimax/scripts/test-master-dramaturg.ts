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

  // 1. INITIALISATION DE LA MÉMOIRE GLOBALE (@Alexandre)
  const universe = CharacterUniverseStore.getInstance()
  await universe.load()
  console.log('📦 Initialisation du Character Universe...')
  await universe.recordEvolution({
    identifier: '@Alexandre',
    physicalDescription:
      'Homme de 65 ans, cheveux longs argentés, manteau en cuir noir usé. Une cicatrice en forme de clé sur la paume droite.',
    personalityTraits: ['Énigmatique', 'Savant', 'Hanté par le futur'],
    roleInSaga: 'Gardien des Portails',
    currentMood: 'Vigilant'
  })
  console.log('✅ @Alexandre enregistré dans le Multivers.\n')

  // 2. TEST 1 : FORMAT TIKTOK (Kids/Teen, Rythmé)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🎬 SIMULATION TIKTOK : @Alexandre et la Clé Perdue')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const tiktokIdea =
    "@Alexandre court dans un couloir infini. Il doit trouver la sortie avant que le couloir ne s'effondre. Format court TikTok pour ados."
  const seriesIdTiktok = await agent.planSaga(tiktokIdea, { targetDuration: 30, maxScenes: 3 })

  // On charge le plan pour voir si l'audience a été capturée
  const tiktokPlan = JSON.parse(
    await fs.readFile(path.join(process.cwd(), 'vimax-logs', 'sagas', seriesIdTiktok, 'plan.json'), 'utf8')
  )
  console.log(
    `📍 Audience détectée : ${tiktokPlan.plan.intent.audience?.platform} (${tiktokPlan.plan.intent.audience?.expectedPace})`
  )

  console.log("\n🚀 Génération de l'épisode TikTok...")
  const epTiktok = await agent.runSingleEpisode(seriesIdTiktok, 1, tiktokPlan)

  console.log(`\n📊 ANALYSE PACING TIKTOK :`)
  epTiktok.scenes.forEach((s) => {
    console.log(
      `- Scène ${s.sceneNumber}: Durée ${s.duration.toFixed(1)}s | Poids ${s.paceWeight} | Tension ${s.tensionState.level}`
    )
  })

  // 3. TEST 2 : FORMAT CINÉMA (Adult, Lent/Atmosphérique)
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🎬 SIMULATION CINÉMA : Le Dernier Voyage de @Alexandre')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const cinemaIdea =
    "@Alexandre marche seul dans une ville déserte sous la pluie fine. Il repense à ses erreurs passées. Film d'auteur atmosphérique pour adultes."
  const seriesIdCinema = await agent.planSaga(cinemaIdea, { targetDuration: 60, maxScenes: 3 })

  const cinemaPlan = JSON.parse(
    await fs.readFile(path.join(process.cwd(), 'vimax-logs', 'sagas', seriesIdCinema, 'plan.json'), 'utf8')
  )
  console.log(
    `📍 Audience détectée : ${cinemaPlan.plan.intent.audience?.platform} (${cinemaPlan.plan.intent.audience?.expectedPace})`
  )

  console.log("\n🚀 Génération de l'épisode Cinéma...")
  const epCinema = await agent.runSingleEpisode(seriesIdCinema, 1, cinemaPlan)

  console.log(`\n📊 ANALYSE PACING CINÉMA :`)
  epCinema.scenes.forEach((s) => {
    console.log(
      `- Scène ${s.sceneNumber}: Durée ${s.duration.toFixed(1)}s | Poids ${s.paceWeight} | Tension ${s.tensionState.level}`
    )
  })

  console.log('\n✨ Vérification terminée !')
}

main().catch(console.error)
