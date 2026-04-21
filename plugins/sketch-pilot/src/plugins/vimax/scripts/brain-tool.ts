import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import dotenv from 'dotenv'
import { LessonStore } from '../core/lesson-store'
import { VimaxBrain } from '../core/vimax-brain'
import type { NarrativeFeedbackItem } from '../types'

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

  const { VimaxAgent } = await import('../pipeline/vimax.agent')
  const agent = new VimaxAgent(llm)

  switch (command) {
    case 'stats': {
      const allLessons = store.getAllLessons()
      console.log('\n=== VIMAX BRAIN STATS (v3.6) ===')
      console.log(`Intelligence totale : ${allLessons.length} leçons`)

      allLessons.forEach((l) => {
        const total = l.successCount + l.failCount
        const rate = total > 0 ? ((l.successCount / total) * 100).toFixed(1) : 'N/A'
        const tags = l.tags && l.tags.length > 0 ? `   Tags: ${l.tags.join(', ')}` : ''
        console.log(`[${l.agentName}] [${rate}%] ${l.directive.slice(0, 60)}...`)
        if (tags) console.log(tags)
      })
      break
    }

    case 'analytics': {
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
    }

    case 'learn': {
      const seriesId = args[1]
      console.log(
        `[Brain] Lancement d'un cycle d'apprentissage / renforcement${seriesId ? ` pour ${seriesId}` : ''}...`
      )
      const newCount = await brain.autonomousLearning({ seriesId })
      console.log(`✅ Cycle terminé. ${newCount} épisodes traités (apprentissage ou renforcement).`)
      break
    }

    case 'episodes': {
      const filterSeriesId = args[1]
      let episodes = await (brain as any).loadEpisodes()

      if (filterSeriesId) {
        episodes = episodes.filter((e: any) => e.seriesId === filterSeriesId)
        console.log(`\n=== ÉPISODES RECENSÉS POUR LA SAGA : ${filterSeriesId} (${episodes.length}) ===`)
      } else {
        console.log(`\n=== ÉPISODES RECENSÉS (${episodes.length}) ===`)
      }

      episodes.forEach((e: any) => {
        const statusIcon = e.status === 'success' ? '✅' : '❌'
        const score = e.evaluation?.score !== undefined ? ` (Score: ${e.evaluation.score})` : ''
        console.log(`${statusIcon} [${e.agentName}] ${e.id}${score}`)
      })
      break
    }

    case 'consolidate':
      await brain.consolidateLessons()
      console.log('✅ Consolidation terminée. Votre cerveau Vimax est maintenant plus léger et plus précis.')
      break

    case 'rollback':
      await brain.rollbackLessons()
      console.log('✅ Restauration du dernier état stable effectuée.')
      break

    case 'upgrade': {
      const newVer = args[1] || '1.1.0'
      await brain.upgradeBrain(newVer)
      break
    }

    case 'inspect': {
      const epIdToInspect = args[1]
      if (!epIdToInspect) {
        console.error('❌ Episode ID requis : inspect <epId>')
        process.exit(1)
      }

      console.log(`\n🔎 Recherche des prompts pour l'épisode : ${epIdToInspect}...`)
      try {
        const promptDir = path.join(process.cwd(), 'vimax-logs', 'prompts')
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
    }

    case 'show': {
      const epIdToShow = args[1]
      if (!epIdToShow) {
        console.error('❌ Episode ID requis : show <epId>')
        process.exit(1)
      }
      const episodes = await (brain as any).loadEpisodes()
      const episode = episodes.find((e: any) => e.id === epIdToShow)
      if (!episode) {
        console.error(`❌ Épisode ${epIdToShow} non trouvé.`)
        process.exit(1)
      }
      console.log(`\n=== DÉTAILS DE L'ÉPISODE : ${epIdToShow} ===`)
      console.log(`📡 Agent : ${episode.agentName}`)
      console.log(`📅 Date : ${new Date(episode.timestamp).toLocaleString()}`)
      console.log(`📊 Status : ${episode.status}`)
      if (episode.evaluation) {
        console.log(`⭐ Score : ${episode.evaluation.score}`)
        console.log(`📝 Critique : ${episode.evaluation.critique || 'N/A'}`)
      }
      console.log(`\n--- USER PROMPT ---`)
      console.log(episode.userPrompt)
      console.log(`\n--- LLM RESPONSE ---`)
      console.log(episode.response)
      break
    }

    case 'audit-item': {
      const [sagaId, type, id] = args.slice(1)
      if (!sagaId || !type) {
        console.error('❌ Usage : audit-item <sagaId> <type> [id]')
        console.error('   Types : plan, episode, scene, image, animation')
        process.exit(1)
      }

      const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', sagaId)
      let data: any
      try {
        if (type === 'plan') {
          data = JSON.parse(await fs.readFile(path.join(sagaDir, 'plan.json'), 'utf8'))
        } else if (type === 'episode') {
          const finalId = id || 'current'
          data = JSON.parse(await fs.readFile(path.join(sagaDir, `episode-${finalId}.json`), 'utf8'))
        } else {
          console.error(`❌ Type ${type} nécessite une implémentation de chargement spécifique.`)
          process.exit(1)
        }
      } catch (error: any) {
        console.error(`❌ Erreur de chargement des données pour audit : ${error.message}`)
        process.exit(1)
      }

      const audit = await agent.auditItem(type, data, { id: id || 'current', sagaDir, seriesId: sagaId })
      displayAudit(id || sagaId, type, audit)
      break
    }

    case 'audit-plan': {
      const sagaId = args[1]
      if (!sagaId) {
        console.error('❌ Usage : audit-plan <sagaId>')
        process.exit(1)
      }

      const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', sagaId)
      try {
        const data = JSON.parse(await fs.readFile(path.join(sagaDir, 'plan.json'), 'utf8'))
        const audit = await agent.auditItem('plan', data, { id: 'initial', sagaDir, seriesId: sagaId })
        displayAudit(sagaId, 'plan', audit)
      } catch (error: any) {
        console.error(`❌ Erreur de chargement du plan pour audit : ${error.message}`)
        process.exit(1)
      }
      break
    }

    case 'feedback': {
      const [sagaId, type, ...msgParts] = args.slice(1)
      const message = msgParts.join(' ')
      if (!sagaId || !type || !message) {
        console.error('❌ Usage : feedback <sagaId> <type> <message>')
        process.exit(1)
      }

      const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', sagaId)
      const auditPath = path.join(sagaDir, `audit-${type}-manual.json`)

      let audit: any = { score: 0, globallyCoherent: true, feedbacks: [] }
      try {
        const raw = await fs.readFile(auditPath, 'utf8')
        audit = JSON.parse(raw)
      } catch {}

      const newItem: NarrativeFeedbackItem = {
        issue: message,
        rationale: 'Critique manuelle enregistrée via la CLI.',
        correction: 'À traiter selon le contexte du feedback.',
        priority: 'high',
        processed: false
      }

      audit.feedbacks.push(newItem)
      await fs.mkdir(sagaDir, { recursive: true })
      await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8')

      console.log(`✅ Feedback manuel enregistré pour ${type} (${sagaId}) !`)
      break
    }

    case 'apply-feedback': {
      const [sagaId, type, ...rest] = args.slice(1)
      let id: string | undefined
      let feedbackIndexStr: string

      if (rest.length === 1) {
        feedbackIndexStr = rest[0]
      } else {
        id = rest[0]
        feedbackIndexStr = rest[1]
      }

      const feedbackIndex = parseInt(feedbackIndexStr)
      if (!sagaId || !type || isNaN(feedbackIndex)) {
        console.error('❌ Usage : apply-feedback <sagaId> <type> <feedbackIndex> [id]')
        process.exit(1)
      }

      const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', sagaId)
      let auditPath: string | undefined

      if (id) {
        auditPath = path.join(sagaDir, `audit-${type}-${id}.json`)
      } else {
        const defaultId = type === 'plan' ? 'initial' : 'current'
        const candidatePaths = [
          path.join(sagaDir, `audit-${type}-${defaultId}.json`),
          path.join(sagaDir, `audit-${type}-manual.json`)
        ]
        for (const p of candidatePaths) {
          try {
            await fs.access(p)
            auditPath = p
            id = p.includes('manual') ? 'manual' : defaultId
            break
          } catch {}
        }
      }

      if (!auditPath) {
        console.error(`❌ Aucun fichier d'audit trouvé pour ${type} (${sagaId}).`)
        process.exit(1)
      }

      let filePath: string
      if (type === 'plan') filePath = path.join(sagaDir, 'plan.json')
      else if (type === 'episode') filePath = path.join(sagaDir, `episode-${id}.json`)
      else {
        console.error(`❌ Raffinement non supporté pour ${type}`)
        process.exit(1)
      }

      try {
        const audit = JSON.parse(await fs.readFile(auditPath, 'utf8'))
        const feedback = audit.feedbacks[feedbackIndex - 1]
        const originalData = JSON.parse(await fs.readFile(filePath, 'utf8'))
        if (!feedback) {
          console.error(`❌ Feedback ${feedbackIndex} non trouvé dans ${path.basename(auditPath)}.`)
          process.exit(1)
        }
        const refined = await agent.refineItemFromFeedback(type, originalData, feedback)
        feedback.processed = true
        await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8')
        await fs.copyFile(filePath, `${filePath}.old`)
        await fs.writeFile(filePath, JSON.stringify(refined, null, 2), 'utf8')
        console.log(`✅ ${type.toUpperCase()} mis à jour avec succès via le feedback ${feedbackIndex} !`)
      } catch (error: any) {
        console.error(`❌ Erreur lors du raffinement : ${error.message}`)
      }
      break
    }

    case 'learn-audit': {
      const [sagaId, type, ...rest] = args.slice(1)
      let id: string | undefined
      let feedbackIndexStr: string

      if (rest.length === 1) {
        feedbackIndexStr = rest[0]
      } else {
        id = rest[0]
        feedbackIndexStr = rest[1]
      }

      const feedbackIndex = parseInt(feedbackIndexStr)
      if (!sagaId || !type || isNaN(feedbackIndex)) {
        console.error('❌ Usage : learn-audit <sagaId> <type> <feedbackIndex> [id]')
        process.exit(1)
      }

      const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', sagaId)
      let auditPath: string | undefined

      if (id) {
        auditPath = path.join(sagaDir, `audit-${type}-${id}.json`)
      } else {
        const defaultId = type === 'plan' ? 'initial' : 'current'
        const candidatePaths = [
          path.join(sagaDir, `audit-${type}-${defaultId}.json`),
          path.join(sagaDir, `audit-${type}-manual.json`)
        ]
        for (const p of candidatePaths) {
          try {
            await fs.access(p)
            auditPath = p
            break
          } catch {}
        }
      }

      if (!auditPath) {
        console.error(`❌ Aucun fichier d'audit trouvé pour ${type} (${sagaId}).`)
        process.exit(1)
      }

      try {
        const audit = JSON.parse(await fs.readFile(auditPath, 'utf8'))
        const feedback = audit.feedbacks[feedbackIndex - 1]
        if (!feedback) {
          console.error(`❌ Feedback ${feedbackIndex} non trouvé dans ${path.basename(auditPath)}.`)
          process.exit(1)
        }
        console.log(`🧠 Apprentissage du feedback : "${feedback.issue.slice(0, 50)}..."`)
        const lesson = await brain.registerLessonFromFeedback(feedback)
        feedback.processed = true
        await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8')
        console.log(`✅ Leçon enregistrée avec succès ! (ID: ${lesson.id})`)
      } catch (error: any) {
        console.error(`❌ Erreur : ${error.message}`)
      }
      break
    }

    case 'validate-lesson': {
      const lessonId = args[1]
      if (!lessonId) {
        console.error('❌ Usage : validate-lesson <lessonId>')
        process.exit(1)
      }
      const success = await store.promoteLesson(lessonId)
      if (success) console.log(`✅ Leçon ${lessonId} validée et promue vers le Cortex.`)
      else console.error(`❌ Leçon ${lessonId} non trouvée dans l'Hippocampe.`)
      break
    }

    case 'lessons': {
      const allLessons = store.getAllLessons()
      console.log('\n=== VIMAX BRAIN LESSONS ===')
      allLessons.forEach((l) => {
        const type = l.verified ? ' [CORTEX]' : ' [HIPPOCAMPE]'
        console.log(
          `- [${l.id}] [${l.agentName}]${type} : ${l.directive.slice(0, 80)}${l.directive.length > 80 ? '...' : ''}`
        )
      })
      break
    }

    case 'delete-lesson': {
      const lessonId = args[1]
      if (!lessonId) {
        console.error('❌ Usage : delete-lesson <lessonId>')
        process.exit(1)
      }
      await store.deleteLesson(lessonId)
      console.log(`✅ Leçon ${lessonId} supprimée.`)
      break
    }

    case 'refine-lesson': {
      const [lessonId, ...msgParts] = args.slice(1)
      const feedback = msgParts.join(' ')
      if (!lessonId || !feedback) {
        console.error('❌ Usage : refine-lesson <lessonId> <feedback>')
        process.exit(1)
      }
      const lesson = await brain.refineLesson(lessonId, feedback)
      console.log(`✅ Leçon ${lessonId} raffinée avec succès !`)
      console.log(`Nouvelle directive : ${lesson.directive}`)
      break
    }

    case 'audit-show': {
      const [sagaId, type, id] = args.slice(1)
      if (!sagaId || !type) {
        console.error('❌ Usage : audit-show <sagaId> <type> [id]')
        process.exit(1)
      }
      const finalId = id || (type === 'plan' ? 'initial' : 'current')
      const auditPath = path.join(process.cwd(), 'vimax-logs', 'sagas', sagaId, `audit-${type}-${finalId}.json`)
      try {
        const raw = await fs.readFile(auditPath, 'utf8')
        const audit = JSON.parse(raw)
        displayAudit(finalId, type, audit)
      } catch (error: any) {
        console.error(`❌ Audit non trouvé : ${error.message}`)
      }
      break
    }

    case 'fix-all': {
      const [sagaId, type, id] = args.slice(1)
      if (!sagaId) {
        console.error('❌ Usage : fix-all <sagaId> [type] [id]')
        process.exit(1)
      }

      const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', sagaId)

      const applyFixToAudit = async (auditFile: string) => {
        const auditPath = path.join(sagaDir, auditFile)
        const parts = auditFile.replace('.json', '').split('-')
        const aType = parts[1]
        const aId = parts.slice(2).join('-')

        let filePath: string
        if (aType === 'plan') filePath = path.join(sagaDir, 'plan.json')
        else if (aType === 'episode') filePath = path.join(sagaDir, `episode-${aId}.json`)
        else return

        try {
          const rawAudit = await fs.readFile(auditPath, 'utf8')
          const audit = JSON.parse(rawAudit)
          const pendingFeedbacks = audit.feedbacks.filter((f: any) => !f.processed)
          if (pendingFeedbacks.length === 0) return

          console.log(`🧠 Résolution de ${pendingFeedbacks.length} feedbacks pour ${aType} (${aId})...`)
          const originalData = JSON.parse(await fs.readFile(filePath, 'utf8'))
          const refined = await agent.refineItemFromFeedbacks(aType, originalData, pendingFeedbacks)

          // Apprentissage & Marquage
          for (const f of pendingFeedbacks) {
            await brain.registerLessonFromFeedback(f)
            f.processed = true
          }

          await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8')
          await fs.copyFile(filePath, `${filePath}.old`)
          await fs.writeFile(filePath, JSON.stringify(refined, null, 2), 'utf8')
          console.log(`✅ Mise à jour de ${aType} (${aId}) terminée !`)
        } catch (error: any) {
          console.error(`❌ Erreur sur ${auditFile} : ${error.message}`)
        }
      }

      if (type) {
        const finalId = id || (type === 'plan' ? 'initial' : 'current')
        await applyFixToAudit(`audit-${type}-${finalId}.json`)
      } else {
        console.log(`🚀 Analyse globale des audits pour ${sagaId}...`)
        try {
          const files = await fs.readdir(sagaDir)
          const auditFiles = files.filter((f) => f.startsWith('audit-') && f.endsWith('.json'))
          if (auditFiles.length === 0) {
            console.log("❓ Aucun audit n'a été trouvé.")
          } else {
            for (const file of auditFiles) {
              await applyFixToAudit(file)
            }
            console.log('✨ Traitement batch terminé !')
          }
        } catch (error: any) {
          console.error(`❌ Erreur batch : ${error.message}`)
        }
      }
      break
    }

    case 'plan': {
      const idea = args[1]
      const count = parseInt(args[2] || '4')
      const isProd = args.includes('--prod')
      if (!idea) {
        console.error('❌ Usage : plan <idee> [count] [--prod]')
        process.exit(1)
      }

      console.log(`🎬 Planification de la saga (Mode: ${isProd ? 'STABLE' : 'EXPÉRIIMENTAL'})...`)
      const seriesId = await agent.planSaga(idea, {
        targetEpisodeCount: count,
        brainMode: isProd ? 'stable' : 'all'
      })
      console.log(`✅ Projet créé avec succès ! ID : ${seriesId}`)
      break
    }

    case 'episode': {
      const sagaId = args[1]
      const n = parseInt(args[2])
      const isProd = args.includes('--prod')
      if (!sagaId || isNaN(n)) {
        console.error('❌ Usage : episode <sagaId> <num> [--prod]')
        process.exit(1)
      }

      console.log(`🎬 Génération épisode ${n} pour ${sagaId} (Mode: ${isProd ? 'STABLE' : 'EXPÉRIIMENTAL'})...`)
      if (isProd) agent.setBrainMode('stable')
      const episode = await agent.runSingleEpisode(sagaId, n)
      console.log(`✅ Épisode ${n} généré : ${episode.summary}`)
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
        console.log('❓ Aucune saga trouvée.')
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
        console.log(`\n🎞️ ÉPISODES :`)
        for (let i = 0; i < plan.episodeEvents.length; i++) {
          const epFilePath = path.join(sagaPath, `episode-${i + 1}.json`)
          let status = '⏳'
          try {
            await fs.access(epFilePath)
            status = '✅'
          } catch {}
          console.log(`${i + 1}. ${status} ${plan.episodeEvents[i].description.slice(0, 60)}...`)
        }
      } catch (error: any) {
        console.error(`❌ Erreur : ${error.message}`)
      }
      break
    }

    case 'continue-plan': {
      const sagaId = args[1]
      const count = parseInt(args[2] || '4')
      if (!sagaId) {
        console.error('❌ Usage : continue-plan <sagaId> [count]')
        process.exit(1)
      }
      await agent.extendSaga(sagaId, count)
      break
    }

    case 'help':
    default:
      console.log(`
=== 🧠 VIMAX BRAIN TOOL v3.6 ===
Usage: brain-tool.ts <command> [args]

Commands:
  plan <idée> [nb] [--prod]     Planifie une saga
  episode <id> <n> [--prod]    Génère un épisode
  continue-plan <id> [nb]      Ajoute des épisodes à une saga
  
  audit-item <id> <type> [num] Analyse un élément (plan, episode)
  fix-all <id> [type] [num]    Applique TOUS les feedbacks à un élément (ou toute la saga)
  feedback <id> <type> <msg>    Enregistre un feedback manuel utilisateur
  apply-feedback <id> <type> <idx> [a_id] Applique la correction via l'IA
  learn-audit <id> <type> <idx> [a_id] Transforme un feedback en leçon (Hippocampe)
  
  lessons             Liste toutes les leçons
  validate-lesson <id> Promeut une leçon Hippocampe -> Cortex
  delete-lesson <id>  Supprime définitivement une leçon
  
  consolidate                  Fusionne Hippocampe -> Cortex
  rollback                     Rollback vers le dernier état stable
  upgrade <ver>                Baseline de production scellée
  
  sagas               Liste toutes les séries/sagas
  view <id>           Affiche l'état d'avancement d'une saga
  stats               Statistiques globales du cerveau
  inspect <epId>      Prompts réels envoyés au LLM (Debug)
      `)
      break
  }
}

function displayAudit(target: string, type: string, audit: any) {
  console.log(`\n=== 🎭 AUDIT ${type.toUpperCase()} : ${target} ===`)
  console.log(`📊 Score Global : ${audit.score}/100`)
  console.log(`\n👉 FEEDBACKS (${audit.feedbacks?.length || 0}) :`)
  audit.feedbacks?.forEach((f: any, i: number) => {
    const priorityIcon = f.priority === 'high' ? '🔴' : '🔵'
    console.log(`${i + 1}. ${priorityIcon} ${f.issue.toUpperCase()}`)
    console.log(`   💡 Rationale: ${f.rationale}`)
    console.log(`   ✅ Correction: ${f.correction}`)
    if (f.example) console.log(`   📝 Exemple: ${f.example}`)
    console.log('')
  })
}

main().catch(console.error)
