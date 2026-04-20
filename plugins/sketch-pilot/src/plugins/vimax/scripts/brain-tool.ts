import fs from 'node:fs/promises'
import path from 'node:path'
import { LessonStore } from '../core/lesson-store'
import { VimaxBrain } from '../core/vimax-brain'

/**
 * VimaxBrain Tool
 * Usage: npx ts-node brain-tool.ts [command] [args]
 */
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  // Simulation d'un LLM Service pour l'outil CLI (à adapter selon ton setup)
  // En général on récupère l'instance depuis le container d'injection
  const llmStub: any = { generateContent: async () => '' }
  const brain = new VimaxBrain(llmStub)
  const store = LessonStore.getInstance()
  await store.load()

  switch (command) {
    case 'stats':
      const lessons = store.getLessonsFor('Global')
      console.log('\n=== VIMAX BRAIN STATS ===')
      console.log(`Leçons apprises : ${lessons.length}`)
      console.log(`Version du store : ${Date.now()}`)
      console.log('-------------------------')
      lessons.forEach((l) => {
        console.log(`[${l.agentName}] ${l.directive.slice(0, 60)}... (Conf: ${l.confidence})`)
      })
      break

    case 'episodes':
      const dir = path.join(process.cwd(), 'vimax-logs', 'learning-episodes')
      const files = await fs.readdir(dir)
      console.log(`\n=== ÉPISODES RECENSÉS (${files.length}) ===`)
      files.forEach((f) => console.log(`- ${f}`))
      break

    case 'feedback':
      const [episodeId, ...critiqueParts] = args.slice(1)
      const critique = critiqueParts.join(' ')
      if (!episodeId || !critique) {
        console.log('Usage: feedback [episodeId] [votre critique]')
        return
      }
      console.log(`[Brain] Injection du feedback sur ${episodeId}...`)
      const success = await brain.processHumanFeedback(episodeId, critique)
      console.log(success ? '✅ Feedback intégré et leçon apprise !' : "❌ Échec de l'intégration.")
      break

    default:
      console.log('Commandes disponibles : stats, episodes, feedback')
  }
}

main().catch(console.error)
