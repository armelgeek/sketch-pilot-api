import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import dotenv from 'dotenv'
import { LessonStore } from '../core/lesson-store'
import { VimaxBrain } from '../core/vimax-brain'

/**
 * VimaxBrain Tool
 * Usage: npx ts-node brain-tool.ts [command] [args]
 */
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  dotenv.config()

  // Récupération de la clé API depuis l'environnement
  const apiKey = process.env.OPENAI_API_KEY
  let llm: any = { generateContent: async () => '' }

  if (apiKey) {
    const { LLMServiceFactory } = await import('../../../services/llm')
    const { VimaxLLMAdapter } = await import('../core/vimax-llm-adapter')

    const globalLLM = await LLMServiceFactory.create({
      provider: 'openai',
      apiKey,
      modelId: 'gpt-4o-mini'
    })
    llm = new VimaxLLMAdapter(globalLLM)
    console.log("✅ LLM Connecté pour le cycle d'apprentissage.")
  } else {
    console.warn('⚠️ OPENAI_API_KEY manquante, utilisation du stub (apprentissage limité).')
  }

  const brain = new VimaxBrain(llm)
  const store = LessonStore.getInstance()
  await store.load()

  switch (command) {
    case 'lessons':
      const lessons = store.getAllLessons()
      console.log(`\n=== LEÇONS APPRISES (${lessons.length}) ===`)
      lessons.forEach((l) => console.log(`- [${l.agentName}] [${l.category}] ${l.directive}`))
      break

    case 'stats':
      const allLessons = store.getAllLessons()
      console.log('\n=== VIMAX BRAIN STATS (v3.2) ===')
      console.log(`Intelligence totale : ${allLessons.length} leçons`)

      allLessons.forEach((l) => {
        const total = l.successCount + l.failCount
        const rate = total > 0 ? ((l.successCount / total) * 100).toFixed(1) : 'N/A'
        const tags = l.tags && l.tags.length > 0 ? `   Tags: ${l.tags.join(', ')}` : ''
        console.log(`[${l.agentName}] [${rate}%] ${l.directive.slice(0, 60)}...`)
        if (tags) console.log(tags)
      })
      break

    case 'analytics':
      const stats = await brain.getPerformanceStats()
      console.log('\n=== VIMAX QUALITY ANALYTICS ===')
      console.log(`Moyenne Globale : ${stats.totalAvg}/100`)
      console.log(`Épisodes évalués : ${stats.evaluatedCount}/${stats.totalCount}`)
      console.log('\n--- Détail par Saga ---')
      Object.keys(stats.sagas).forEach((id) => {
        const s = stats.sagas[id]
        const trend = s.scores.length > 1 ? (s.scores.at(-1) >= s.scores[0] ? '📈' : '📉') : '➖'
        console.log(`${trend} [${id.slice(0, 15)}...] Avg: ${s.avg}/100 (${s.count} épisodes)`)
      })
      break

    case 'learn':
      const seriesId = args[1]
      console.log(
        `[Brain] Lancement d'un cycle d'apprentissage / renforcement${seriesId ? ` pour ${seriesId}` : ''}...`
      )
      const newCount = await brain.autonomousLearning({ seriesId })
      console.log(`✅ Cycle terminé. ${newCount} épisodes traités (apprentissage ou renforcement).`)
      break

    case 'approve':
      const epIdToApprove = args[1]
      if (!epIdToApprove) {
        console.error('❌ Episode ID requis : approve <id>')
        process.exit(1)
      }
      console.log(`[Brain] Approbation manuelle de l'épisode ${epIdToApprove}...`)
      // On simule un feedback positif pour forcer l'apprentissage/renforcement
      await brain.processHumanFeedback(epIdToApprove, 'Approbation manuelle : Excellent résultat.')
      console.log(`✅ Épisode approuvé et leçons renforcées.`)
      break

    case 'episodes':
      const episodes = await (brain as any).loadEpisodes()
      console.log(`\n=== ÉPISODES RECENSÉS (${episodes.length}) ===`)
      episodes.forEach((e: any) => {
        const statusIcon = e.status === 'success' ? '✅' : '❌'
        const score = e.evaluation?.score !== undefined ? ` (Score: ${e.evaluation.score})` : ''
        console.log(`${statusIcon} [${e.agentName}] ${e.id} (Series: ${e.seriesId || 'N/A'})${score}`)
      })
      break
    case 'feedback': {
      const [episodeId, ...critiqueParts] = args.slice(1)
      const critique = critiqueParts.join(' ')
      if (!episodeId || !critique) {
        console.log('Usage: feedback [episodeId] [votre critique]')
        return
      }
      console.log(`[Brain] Injection du feedback sur ${episodeId}...`)
      const ok = await brain.processHumanFeedback(episodeId, critique)
      console.log(ok ? '✅ Feedback intégré et leçon apprise !' : "❌ Échec de l'intégration.")
      break
    }

    case 'inspect':
      const epIdToInspect = args[1]
      if (!epIdToInspect) {
        console.error('❌ Episode ID requis : inspect <epId>')
        process.exit(1)
      }

      console.log(`\n🔎 Recherche des prompts pour l'épisode : ${epIdToInspect}...`)
      try {
        const promptDir = path.join(process.cwd(), 'vimax-logs', 'prompts')

        // Vérifier si le dossier existe
        try {
          await fs.access(promptDir)
        } catch {
          console.log('❓ Aucun prompt archivé pour le moment (dossier absent).')
          break
        }

        const files = await fs.readdir(promptDir)
        const matches = files.filter((f) => f.includes(epIdToInspect))

        if (matches.length === 0) {
          console.log('❓ Aucun prompt trouvé pour cet identifiant.')
        } else {
          for (const file of matches) {
            const content = await fs.readFile(path.join(promptDir, file), 'utf8')
            console.log(`\n--- FICHIER : ${file} ---`)
            console.log(content)
            console.log('--- END ---\n')
          }
        }
      } catch (error) {
        console.error("❌ Erreur lors de l'inspection :", error)
      }
      break

    case 'audit': {
      const sagaId = args[1]
      if (!sagaId) {
        console.error('❌ Saga ID requis : audit <seriesId>')
        process.exit(1)
      }
      console.log(`🔎 Lancement d'un audit qualitatif complet pour la saga : ${sagaId}...`)
      // On force un cycle learn sur cette saga, ce qui déclenchera la phase 0 (Auto-Audit)
      await brain.autonomousLearning({ seriesId: sagaId })
      console.log(`✅ Audit terminé. Consultez 'analytics' ou 'episodes' pour les résultats.`)
      break
    }

    case 'plan': {
      const idea = args.slice(1).join(' ')
      if (!idea) {
        console.error('❌ Idée requise : plan <votre idée>')
        process.exit(1)
      }
      const { VimaxAgent } = await import('../pipeline/vimax.agent')
      const agent = new VimaxAgent(llm)
      console.log(`[VimaxAgent] Planification de la saga : "${idea}"...`)
      const seriesId = await agent.planSaga(idea)
      console.log(`✅ Saga planifiée ! ID : ${seriesId}`)
      console.log(`Utilisez 'episode ${seriesId} 1' pour générer le premier épisode.`)
      break
    }

    case 'episode': {
      const [seriesId, indexStr] = args.slice(1)
      const index = parseInt(indexStr)
      if (!seriesId || isNaN(index)) {
        console.error('❌ Usage : episode <seriesId> <index>')
        process.exit(1)
      }
      const { VimaxAgent } = await import('../pipeline/vimax.agent')
      const agent = new VimaxAgent(llm)
      console.log(`[VimaxAgent] Génération de l'épisode ${index} pour la saga ${seriesId}...`)
      const episode = await agent.runSingleEpisode(seriesId, index)
      console.log(`✅ Épisode ${index} généré : ${episode.id}`)
      console.log(`Narration : ${episode.summary}...`)
      break
    }

    case 'sagas': {
      const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas')
      try {
        const entries = await fs.readdir(sagaDir, { withFileTypes: true })
        const sagas = entries.filter((e) => e.isDirectory())
        console.log(`\n=== SAGAS RECENSÉES (${sagas.length}) ===`)
        for (const s of sagas) {
          const planPath = path.join(sagaDir, s.name, 'plan.json')
          let idea = '???'
          try {
            const plan = JSON.parse(await fs.readFile(planPath, 'utf8'))
            idea = plan.basicIdea || '???'
          } catch {}
          console.log(`- [${s.name}] : ${idea.slice(0, 50)}...`)
        }
      } catch {
        console.log('❓ Aucune saga trouvée (dossier vimax-logs/sagas absent).')
      }
      break
    }

    case 'view': {
      const sagaId = args[1]
      if (!sagaId) {
        console.error('❌ Saga ID requis : view <sagaId>')
        process.exit(1)
      }
      const sagaPath = path.join(process.cwd(), 'vimax-logs', 'sagas', sagaId)
      const planPath = path.join(sagaPath, 'plan.json')

      try {
        const plan = JSON.parse(await fs.readFile(planPath, 'utf8'))
        console.log(`\n=== VUE DÉTAILLÉE : ${sagaId} ===`)
        console.log(`💡 Idée : ${plan.basicIdea}`)
        console.log(`🎯 Intent : ${plan.plan.intent.tone || plan.plan.intent}`)
        console.log(`\n🎞️ ÉPISODES PRÉVUS :`)

        for (let i = 0; i < plan.episodeEvents.length; i++) {
          const event = plan.episodeEvents[i]
          const epFilePath = path.join(sagaPath, `episode-${i + 1}.json`)
          let status = '⏳ [Planifié]'
          let details = ''

          try {
            const epData = JSON.parse(await fs.readFile(epFilePath, 'utf8'))
            status = '✅ [Généré]'
            details = `\n    └─ Résumé : ${epData.summary.slice(0, 100)}...\n    └─ Scènes : ${epData.scenes.length}`
          } catch {}

          console.log(`${i + 1}. ${status} ${event.description.slice(0, 60)}...${details}`)
        }
      } catch (error: any) {
        console.error(`❌ Impossible de lire la saga ${sagaId} : ${error.message}`)
      }
      break
    }

    case 'help':

    default:
      console.log(`
Usage: brain-tool.ts <command> [args]

Commands:
  lessons             Liste toutes les leçons apprises
  stats               Statistiques de fiabilité par leçon
  analytics           Moyennes de qualité et évolution
  learn [seriesId]    Apprentissage (échecs) & Renforcement (succès)
  feedback <epId> <c> Critique humaine pour distilliation
  approve <epId>      Approuve un épisode (Renforcement+)
  audit <seriesId>    Audit qualitatif automatique via Vision
  episodes            Liste brute des épisodes
  inspect <epId>      Affiche les prompts réels envoyés au LLM
  plan <idée>         Planifie une saga et génère son plan structurel
  episode <id> <n>    Génère l'épisode numéro n pour la saga id
  sagas               Liste toutes les séries/sagas de production
  view <id>           Affiche le plan détaillé et l'état d'avancement d'une saga
      `)
      break
  }
}

main().catch(console.error)
