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
      const allLessons = store.getAllLessons()
      console.log('\n=== VIMAX BRAIN STATS (v3.0) ===')
      console.log(`Intelligence totale : ${allLessons.length} leçons`)
      console.log(`Top Tags : ${Array.from(new Set(allLessons.flatMap((l) => l.tags || []))).join(', ')}`)
      console.log('-------------------------')
      allLessons.forEach((l) => {
        const total = l.successCount + l.failCount
        const rate = total > 0 ? ((l.successCount / total) * 100).toFixed(1) : 'N/A'
        console.log(`[${l.agentName}] [${rate}%] ${l.directive.slice(0, 50)}...`)
        if (l.tags?.length) console.log(`   Tags: ${l.tags.join(', ')}`)
      })
      break

    case 'episodes':
      // Utilisation de la méthode récursive déjà présente dans le store/brain si possible
      // Ici on simule pour l'outil CLI
      const episodes = await (brain as any).loadEpisodes()
      console.log(`\n=== ÉPISODES RECENSÉS (${episodes.length}) ===`)
      episodes.forEach((e: any) => {
        const statusIcon = e.status === 'success' ? '✅' : '❌'
        console.log(`${statusIcon} [${e.agentName}] ${e.id} (Series: ${e.seriesId || 'N/A'})`)
      })
      break

    case 'learn':
      console.log("[Brain] Lancement d'un cycle d'apprentissage autonome...")
      const newCount = await brain.autonomousLearning()
      console.log(`✅ Cycle terminé. ${newCount} nouvelles leçons distillées.`)
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
      console.log('Commandes disponibles : stats, episodes, learn, feedback')
  }
}

main().catch(console.error)
