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

  switch (command) {
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

    case 'episodes':
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

    case 'consolidate':
      await brain.consolidateLessons()
      console.log('✅ Consolidation terminée. Votre cerveau Vimax est maintenant plus léger et plus précis.')
      break

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

    case 'audit-plan': {
      const sagaId = args[1]
      if (!sagaId) {
        console.error('❌ Saga ID requis : audit-plan <sagaId>')
        process.exit(1)
      }
      const { VimaxAgent } = await import('../pipeline/vimax.agent')
      const agent = new VimaxAgent(llm)
      const audit = await agent.auditSagaNarrative(sagaId)
      displayAudit(sagaId, 'plan', audit)
      break
    }

    case 'feedback': {
      const [sagaId, type, ...msgParts] = args.slice(1)
      const message = msgParts.join(' ')
      if (!sagaId || !type || !message) {
        console.error('❌ Usage : feedback <sagaId> <type> <message>')
        console.error('   Exemple : feedback series-123 plan "Ajoute plus de suspense"')
        process.exit(1)
      }

      const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', sagaId)
      const auditPath = path.join(sagaDir, `audit-${type}-manual.json`)

      let audit: any = {
        score: 0,
        globallyCoherent: true,
        characterArcsAnalysis: 'Feedback manuel utilisateur',
        themesAnalyzed: [],
        feedbacks: []
      }

      try {
        const raw = await fs.readFile(auditPath, 'utf8')
        audit = JSON.parse(raw)
      } catch {
        // Nouveau fichier audit manuel
      }

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
      console.log(`📌 Action suivante possible :`)
      console.log(`   - Appliquer : npm run vimax:apply-feedback -- ${sagaId} ${type} manual ${audit.feedbacks.length}`)
      console.log(`   - Apprendre : npm run vimax:learn-audit -- ${sagaId} ${type} manual ${audit.feedbacks.length}`)
      break
    }

    case 'audit-item': {
      const [sagaId, type, id] = args.slice(1)
      if (!sagaId || !type) {
        console.error('❌ Usage : audit-item <sagaId> <type> [id]')
        console.error('   Types : plan, episode, scene, image, animation')
        process.exit(1)
      }

      const { VimaxAgent } = await import('../pipeline/vimax.agent')
      const agent = new VimaxAgent(llm)
      const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', sagaId)

      let data: any
      try {
        if (type === 'plan') {
          data = JSON.parse(await fs.readFile(path.join(sagaDir, 'plan.json'), 'utf8'))
        } else if (type === 'episode') {
          data = JSON.parse(await fs.readFile(path.join(sagaDir, `episode-${id}.json`), 'utf8'))
        } else {
          // Pour les types atomiques (image, animation, scene), on cherche dans les fichiers intermédiaires
          // ou l'épisode si disponible. Pour l'instant on limite aux gros blocs.
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

    case 'audit-show': {
      const [sagaId, type, id] = args.slice(1)
      if (!sagaId || !type) {
        console.error('❌ Usage : audit-show <sagaId> <type> [id]')
        process.exit(1)
      }

      // Correction : Fallback intelligent pour l'ID
      const finalId = id || (type === 'plan' ? 'initial' : 'current')
      const auditPath = path.join(process.cwd(), 'vimax-logs', 'sagas', sagaId, `audit-${type}-${finalId}.json`)
      try {
        const audit = JSON.parse(await fs.readFile(auditPath, 'utf8'))
        displayAudit(id || sagaId, type, audit)
      } catch {
        console.error(`❌ Impossible de trouver l'audit : ${auditPath}`)
      }
      break
    }

    case 'apply-feedback': {
      let [sagaId, type, id, feedbackIndexStr] = args.slice(1)

      // Si le 3ème argument est un nombre, c'est l'index, et l'id doit être déduit
      if (!isNaN(parseInt(id)) && feedbackIndexStr === undefined) {
        feedbackIndexStr = id
        id = type === 'plan' ? 'initial' : 'current'
      }

      const feedbackIndex = parseInt(feedbackIndexStr)
      if (!sagaId || !type || !id || isNaN(feedbackIndex)) {
        console.error('❌ Usage : apply-feedback <sagaId> <type> [id] <feedbackIndex>')
        process.exit(1)
      }

      const { VimaxAgent } = await import('../pipeline/vimax.agent')
      const agent = new VimaxAgent(llm)
      const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', sagaId)
      const auditPath = path.join(sagaDir, `audit-${type}-${id}.json`)

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
          console.error(`❌ Feedback ${feedbackIndex} non trouvé.`)
          process.exit(1)
        }

        const refined = await agent.refineItemFromFeedback(type, originalData, feedback)

        // Marquer comme traité dans l'audit
        feedback.processed = true
        await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8')

        // Sauvegarde de la nouvelle version (on garde un backup .old)
        await fs.copyFile(filePath, `${filePath}.old`)
        await fs.writeFile(filePath, JSON.stringify(refined, null, 2), 'utf8')

        console.log(`✅ ${type.toUpperCase()} mis à jour avec succès via le feedback ${feedbackIndex} !`)
        console.log(`📂 Original sauvegardé dans ${path.basename(filePath)}.old`)
      } catch (error: any) {
        console.error(`❌ Erreur lors du raffinement : ${error.message}`)
      }
      break
    }

    case 'learn-audit': {
      let [sagaId, type, id, feedbackIndexStr] = args.slice(1)

      // Si le 3ème argument est un nombre, c'est l'index, et l'id doit être déduit
      if (!isNaN(parseInt(id)) && feedbackIndexStr === undefined) {
        feedbackIndexStr = id
        id = type === 'plan' ? 'initial' : 'current'
      }

      const feedbackIndex = parseInt(feedbackIndexStr)
      if (!sagaId || !type || !id || isNaN(feedbackIndex)) {
        console.error('❌ Usage : learn-audit <sagaId> <type> [id] <feedbackIndex>')
        console.error('   Exemple : learn-audit series-123 plan 1')
        process.exit(1)
      }

      const auditPath = path.join(process.cwd(), 'vimax-logs', 'sagas', sagaId, `audit-${type}-${id}.json`)
      try {
        const audit = JSON.parse(await fs.readFile(auditPath, 'utf8'))
        const feedback = audit.feedbacks[feedbackIndex - 1]

        if (!feedback) {
          console.error(`❌ Feedback ${feedbackIndex} non trouvé dans l'audit de ${sagaId}.`)
          process.exit(1)
        }

        console.log(`🧠 Apprentissage du feedback : "${feedback.issue}"...`)
        const lesson = await brain.registerLessonFromFeedback(feedback)

        // Marquer comme traité dans l'audit
        feedback.processed = true
        await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8')

        console.log(`✅ Leçon enregistrée avec succès ! (ID: ${lesson.id})`)
      } catch (error: any) {
        console.error(`❌ Impossible de lire l'audit pour ${sagaId} : ${error.message}`)
      }
      break
    }

    case 'continue-plan': {
      const sagaId = args[1]
      const count = parseInt(args[2] || '4')
      if (!sagaId) {
        console.error('❌ Saga ID requis : continue-plan <sagaId> [count]')
        process.exit(1)
      }
      const { VimaxAgent } = await import('../pipeline/vimax.agent')
      const agent = new VimaxAgent(llm)
      await agent.extendSaga(sagaId, count)
      break
    }

    case 'plan': {
      let idea: string
      let count: number | undefined

      const lastArg = args.at(-1)
      if (lastArg && args.length > 2 && !isNaN(parseInt(lastArg))) {
        count = parseInt(lastArg)
        idea = args.slice(1, -1).join(' ')
      } else {
        idea = args.slice(1).join(' ')
      }

      if (!idea) {
        console.error('❌ Idée requise : plan <votre idée> [nb_épisodes]')
        process.exit(1)
      }

      const { VimaxAgent } = await import('../pipeline/vimax.agent')
      const agent = new VimaxAgent(llm)
      console.log(`[VimaxAgent] Planification de la saga : "${idea}"...`)
      if (count) console.log(`📈 Cible : ${count} épisodes.`)

      const seriesId = await agent.planSaga(idea, { targetEpisodeCount: count })
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
        console.log('❓ Aucune saga trouvée.')
      }
      break
    }

    case 'lessons': {
      const lessons = await brain.getAllLessons()
      console.log(`\n📚 BIBLIOTHÈQUE DES LEÇONS (${lessons.length}) :`)
      lessons.forEach((l, i) => {
        const status = l.verified ? '✅' : '🧠'
        console.log(`[${i + 1}] ID: ${l.id} ${status}`)
        console.log(`    Directive: ${l.directive}`)
        console.log(`    Tags: ${l.tags?.join(', ')} | Confiance: ${l.confidence}`)
        console.log('---')
      })
      break
    }

    case 'refine-lesson': {
      const lessonId = args[1]
      const feedback = args.slice(2).join(' ')
      if (!lessonId || !feedback) {
        console.error('❌ Usage : refine-lesson <lessonId> <feedback>')
        process.exit(1)
      }
      const refined = await brain.refineLesson(lessonId, feedback)
      console.log(`✅ Leçon ${lessonId} raffinée avec succès !`)
      console.log(`📢 Nouvelle directive : ${refined.directive}`)
      break
    }

    case 'delete-lesson': {
      const lessonId = args[1]
      if (!lessonId) {
        console.error('❌ Usage : delete-lesson <lessonId>')
        process.exit(1)
      }
      await brain.deleteLesson(lessonId)
      console.log(`🗑️ Leçon ${lessonId} supprimée.`)
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
            details = `\n    └─ ID : ${epData.id}\n    └─ Résumé : ${epData.summary.slice(0, 100)}...\n    └─ Scènes : ${epData.scenes.length}`
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
=== 🧠 VIMAX BRAIN TOOL ===
Usage: brain-tool.ts <command> [args]

Commands:
  lessons             Liste toutes les leçons du cerveau Vimax
  refine-lesson <id> <fb> Raffine une leçon avec un nouveau feedback
  delete-lesson <id>  Supprime définitivement une leçon
  
  audit-plan <id>     Audit narratif du plan (type=plan, id=initial)
  audit-item <sagaId> <type> [id] - Relance un audit complet (coûte des tokens)
  audit-show <sagaId> <type> [id] - Affiche un audit existant (gratuit)
    
  learn-audit <sagaId> <type> [id] <index>
    Extrait un feedback de l'audit et l'enregistre comme leçon globale.
    
  apply-feedback <sagaId> <type> [id] <index>  
    Applique la correction suggérée par un feedback à l'objet original.
    
  plan <idée> [nb]     Planifie une saga avec cible d'épisodes
  episode <id> <n>    Génère l'épisode numéro n pour la saga id
  feedback <sagaId> <type> <msg> Enregistre un feedback manuel sur un plan/épisode
  consolidate         Consolide et fusionne les leçons pour éviter le surpoids (Anti-Bloat)
  continue-plan <id>  Ajoute des épisodes (extension) à une saga existante
  
  sagas               Liste toutes les séries/sagas de production
  view <id>           Affiche l'état d'avancement d'une saga
  episodes [idSaga]   Liste les épisodes générés (Learning)
  show <epId>         Détails complets d'un épisode
  inspect <epId>      Prompts réels envoyés au LLM
      `)
      break
  }
}

function displayAudit(target: string, type: string, audit: any) {
  console.log(`\n=== 🎭 AUDIT ${type.toUpperCase()} : ${target} ===`)
  console.log(`📊 Score Global : ${audit.score}/100`)
  console.log(`✅ Cohérence : ${audit.globallyCoherent ? 'OUI' : 'NON'}`)
  console.log(`\n🧐 ANALYSE :\n${audit.characterArcsAnalysis}`)
  console.log(`\n💡 THEMES : ${audit.themesAnalyzed.join(', ')}`)

  console.log(`\n👉 FEEDBACKS (${audit.feedbacks.length}) :`)
  audit.feedbacks.forEach((f: any, i: number) => {
    const priorityIcon = f.priority === 'high' ? '🔴' : f.priority === 'medium' ? '🟡' : '🔵'
    const statusText = f.processed ? ' ✅ [TRAITÉ]' : ''
    console.log(`\n${i + 1}. ${priorityIcon} ${f.issue}${statusText}`)
    console.log(`   Problème : ${f.rationale}`)
    console.log(`   Correction : ${f.correction}`)
    if (f.example) console.log(`   Exemple : ${f.example}`)
  })
}

main().catch(console.error)
