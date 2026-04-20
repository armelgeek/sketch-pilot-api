import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { VimaxPromptRefinery } from '../agents/vimax-prompt-refinery.agent'
import { VimaxSagaSentinel } from '../agents/vimax-saga-sentinel.agent'
import { VimaxVisionAuditor } from '../agents/vimax-vision-auditor.agent'
import type { LearningEpisode, Lesson } from '../types'
import { LessonStore } from './lesson-store'
import type { LLMService } from './llm.interface'

/**
 * VimaxBrain
 * Unité centrale d'intelligence et d'auto-amélioration.
 * Gère le cycle de vie des leçons, le feedback humain et l'audit post-saga.
 */
export class VimaxBrain {
  private refinery: VimaxPromptRefinery
  private visionAuditor: VimaxVisionAuditor
  private sagaSentinel: VimaxSagaSentinel
  private store: LessonStore
  private maxTokensPerCycle: number = 50000 // Défaut : 50k tokens par cycle (~0.15$)

  constructor(
    private llm: LLMService,
    options?: { maxTokensPerCycle?: number }
  ) {
    this.refinery = new VimaxPromptRefinery(llm)
    this.visionAuditor = new VimaxVisionAuditor(llm)
    this.sagaSentinel = new VimaxSagaSentinel(llm)
    this.store = LessonStore.getInstance()
    if (options?.maxTokensPerCycle) {
      this.maxTokensPerCycle = options.maxTokensPerCycle
    }
  }

  /**
   * Pipeline d'apprentissage autonome (Shadow Loop).
   * Analyse les derniers épisodes et met à jour le store.
   */
  async autonomousLearning(options?: { seriesId?: string }): Promise<number> {
    await this.store.load()
    let episodes = await this.loadEpisodes()
    if (episodes.length === 0) {
      await this.cleanupOldEpisodes()
      return 0
    }

    if (options?.seriesId) {
      episodes = episodes.filter((e) => e.seriesId === options.seriesId)
      console.log(`[VimaxBrain] Filtrage par contexte : ${options.seriesId} (${episodes.length} épisodes trouvés).`)
    }

    // 0. PHASE D'AUTO-AUDIT QUALITATIF (Audit 2.0)
    // On audit les épisodes "pending" ou sans évaluation
    const toAudit = episodes.filter((ep) => !ep.evaluation || ep.evaluation.score === undefined)
    if (toAudit.length > 0) {
      console.log(`[VimaxBrain] Audit 2.0 : Évaluation qualitative de ${toAudit.length} épisodes...`)
      for (const ep of toAudit) {
        const result = await this.visionAuditor.scoreEpisode(ep)
        ep.evaluation = {
          score: result.score,
          isValid: result.score >= 80,
          issues: result.issues,
          critique: result.rationale,
          source: 'vision'
        }
        ep.status = result.score >= 80 ? 'success' : 'failure'
        await this.saveEpisode(ep)
      }
    }

    // 0.5. PHASE DE SENTINEL DE SAGA (Continuité Long-Terme)
    if (options?.seriesId) {
      const sagaEpisodes = episodes
        .filter((e) => e.seriesId === options.seriesId)
        .sort((a, b) => a.timestamp - b.timestamp)

      if (sagaEpisodes.length > 1) {
        console.log(`[VimaxBrain] SagaSentinel : Audit de continuité pour ${sagaEpisodes.length} épisodes...`)
        // On audit chaque épisode (sauf le premier) par rapport à ses prédécesseurs
        for (let i = 1; i < sagaEpisodes.length; i++) {
          const current = sagaEpisodes[i]
          const history = sagaEpisodes
            .slice(0, i)
            .map((e, idx) => `[ÉPISODE ${idx + 1}] ${e.narration || 'Résumé indisponible'}`)

          const audit = await this.sagaSentinel.auditSagaContinuity(
            { narration: current.narration || 'Nouveau script', screenplay: current.response },
            history
          )

          if (!audit.isConsistent) {
            console.warn(
              `[VimaxBrain] Rupture de continuité détectée dans l'épisode ${current.id}: ${audit.violations.join(', ')}`
            )
            current.status = 'failure'
            current.evaluation = {
              isValid: false,
              issues: audit.violations,
              critique: audit.reasoning,
              source: 'saga-sentinel',
              score: 0.4
            }
            await this.saveEpisode(current)
          }
        }
      }
    }

    // 1. PHASE DE RENFORCEMENT DARWINISTE (Succès)
    const successes = episodes.filter(
      (ep) => (ep.status === 'success' || (ep.evaluation?.score || 0) > 80) && !ep.learningApplied
    )
    if (successes.length > 0) {
      console.log(`[VimaxBrain] Renforcement Darwiniste sur les succès (${successes.length} épisodes)...`)
      for (const success of successes) {
        if (success.appliedLessonIds && success.appliedLessonIds.length > 0) {
          await this.store.recordSuccess(success.appliedLessonIds)
        }
        success.learningApplied = true
        await this.saveEpisode(success)
      }
    }

    // 2. PHASE D'APPRENTISSAGE PAR L'ÉCHEC
    const failures = episodes.filter(
      (ep) => (ep.status === 'failure' || (ep.evaluation && !ep.evaluation.isValid)) && !ep.learningApplied
    )
    if (failures.length === 0) return successes.length

    // THRESHOLD : Si on a trop d'échecs, on passe en mode "Thematic Scaling"
    if (failures.length > 50) {
      return this.massThematicLearning(failures)
    }

    console.log(`[VimaxBrain] Apprentissage standard (${failures.length} épisodes)...`)

    // NOUVEAU V2 : Audit Visuel pour les épisodes qui ont des images
    for (const ep of episodes.filter((e) => e.status === 'success' && (e as any).renderedImages)) {
      await this.performVisionAudit(ep, (ep as any).renderedImages)
    }

    // On re-calcule les échecs après l'audit visuel
    const updatedFailures = episodes.filter(
      (ep) => ep.status === 'failure' || (ep.evaluation && !ep.evaluation.isValid)
    )
    if (updatedFailures.length === 0) return 0

    // Vérification budget avant de commencer
    if (this.checkBudgetExceeded()) return 0

    const newLessonPartials = await this.refinery.refine(updatedFailures)
    const count = await this.applyLessons(newLessonPartials, updatedFailures)

    // Darwinisme : Fin de vie des leçons inefficaces
    await this.scoreLessons(episodes)

    // Nettoyage après apprentissage
    await this.cleanupOldEpisodes()

    return count
  }

  private checkBudgetExceeded(): boolean {
    const currentUsage = this.refinery.getMetrics().estimatedTokens
    if (currentUsage >= this.maxTokensPerCycle) {
      console.warn(`[VimaxBrain] 🚨 BUDGET ATTEINT (${currentUsage} tokens). Arrêt du cycle pour protéger ton compte.`)
      return true
    }
    return false
  }

  /**
   * Traitement de masse pour 50+ feedbacks.
   */
  private async massThematicLearning(failures: LearningEpisode[]): Promise<number> {
    console.log(`[VimaxBrain] MODE SCALING : Traitement thématique de ${failures.length} épisodes...`)

    // On convertit temporairement en "leçons candidates" pour le clustering
    const candidates: Lesson[] = failures.map((f, i) => ({
      id: `fail-${i}`,
      agentName: f.agentName,
      directive: f.evaluation?.critique || f.evaluation?.issues?.join(', ') || 'Unknown failure',
      category: 'logic',
      confidence: f.evaluation?.source === 'human' ? 1 : 0.5,
      successCount: 0,
      failCount: 1,
      lastUpdated: Date.now()
    }))

    const trendLessons = await this.refinery.thematicConsolidate(candidates)

    for (const trend of trendLessons) {
      await this.store.addLesson(trend)
    }

    return trendLessons.length
  }

  private async applyLessons(partials: any[], failures: LearningEpisode[]): Promise<number> {
    let count = 0
    for (const partial of partials) {
      // Vérification budget avant chaque shadow test (qui coûte des tokens)
      if (this.checkBudgetExceeded()) break

      const relevantFailure = failures.find((f) => f.agentName === partial.agentName)
      const success = relevantFailure ? await this.refinery.shadowTest(relevantFailure, partial.directive || '') : true

      if (success) {
        await this.store.addLesson({
          id: `lesson-${Date.now()}-${count}`,
          agentName: partial.agentName || 'Global',
          directive: partial.directive || '',
          category: (partial.category as any) || 'logic',
          confidence: partial.confidence || 0.8,
          successCount: 1,
          failCount: 0,
          tags: partial.tags || [],
          lastUpdated: Date.now()
        })
        count++
      }

      // Marathon Hardening : On marque l'épisode comme traité quoi qu'il arrive (success ou shadow fail)
      if (relevantFailure) {
        relevantFailure.learningApplied = true
        await this.saveEpisode(relevantFailure)
      }
    }
    return count
  }

  /**
   * Agrège les statistiques de performance par saga et par temps.
   */
  async getPerformanceStats(): Promise<any> {
    const episodes = await this.loadEpisodes()
    if (episodes.length === 0) return { sagas: {}, totalAvg: 0 }

    const sagas: Record<string, { count: number; totalScore: number; avg: number; scores: number[] }> = {}
    let grandTotalScore = 0
    let evaluatedCount = 0

    episodes.forEach((ep) => {
      const seriesId = ep.seriesId || 'Unknown'
      if (!sagas[seriesId]) {
        sagas[seriesId] = { count: 0, totalScore: 0, avg: 0, scores: [] }
      }
      sagas[seriesId].count++

      if (ep.evaluation?.score !== undefined) {
        const score = ep.evaluation.score
        sagas[seriesId].totalScore += score
        sagas[seriesId].scores.push(score)
        grandTotalScore += score
        evaluatedCount++
      }
    })

    // Calcul des moyennes
    Object.keys(sagas).forEach((id) => {
      const s = sagas[id]
      const scores = s.scores
      s.avg = scores.length > 0 ? Math.round(s.totalScore / scores.length) : 0
    })

    return {
      sagas,
      totalAvg: evaluatedCount > 0 ? Math.round(grandTotalScore / evaluatedCount) : 0,
      totalCount: episodes.length,
      evaluatedCount
    }
  }

  private async saveEpisode(episode: LearningEpisode): Promise<void> {
    const dir = path.join(process.cwd(), 'vimax-logs', 'learning-episodes')
    const episodes = await this.loadEpisodes() // Un peu lourd, on pourrait optimiser

    const findPath = async (currentDir: string): Promise<string | null> => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        const res = path.join(currentDir, entry.name)
        if (entry.isDirectory()) {
          const found = await findPath(res)
          if (found) return found
        } else if (entry.name === `${episode.id}.json`) {
          return res
        }
      }
      return null
    }

    const filePath = await findPath(dir)
    if (filePath) {
      await fs.writeFile(filePath, JSON.stringify(episode, null, 2), 'utf8')
    }
  }

  /**
   * Audit visuel d'un épisode si des images sont disponibles.
   */
  async performVisionAudit(episode: LearningEpisode, images: string[]): Promise<boolean> {
    console.log(`[VimaxBrain] Audit visuel multimodal pour l'épisode ${episode.id}...`)

    for (const imgUrl of images) {
      const report = await this.visionAuditor.auditImage(imgUrl, episode.userPrompt, [])
      if (!report.isValid) {
        console.warn(`[VimaxBrain] Défaut visuel détecté : ${report.issues.join(', ')}`)
        // On traite cela comme un échec pour le raffinage
        episode.status = 'failure'
        episode.evaluation = {
          isValid: false,
          issues: report.issues,
          score: 0.5,
          source: 'vision'
        }
        return false
      }
    }
    return true
  }

  /**
   * Intègre un feedback humain spécifique pour corriger un agent.
   */
  async processHumanFeedback(episodeId: string, critique: string): Promise<boolean> {
    const episodes = await this.loadEpisodes()
    const episode = episodes.find((e) => e.id === episodeId)

    if (!episode) {
      console.error(`[VimaxBrain] Épisode ${episodeId} non trouvé.`)
      return false
    }

    const filePath = await this.findEpisodePath(episodeId)
    if (!filePath) return false

    try {
      const isApproval = critique.toLowerCase().includes('approbation') || critique.toLowerCase().includes('excellent')

      // Mise à jour de l'épisode
      episode.evaluation = {
        score: isApproval ? 100 : 0,
        isValid: isApproval,
        issues: isApproval ? [] : ['Feedback utilisateur'],
        critique,
        source: 'human'
      }
      episode.status = isApproval ? 'success' : 'failure'

      // Sauvegarde
      await fs.writeFile(filePath, JSON.stringify(episode, null, 2))

      if (isApproval) {
        // RENFORCEMENT POSITIF : On renforce les leçons qui ont été appliquées
        if (episode.appliedLessonIds && episode.appliedLessonIds.length > 0) {
          console.log(`[VimaxBrain] Renforcement positif des leçons: ${episode.appliedLessonIds.join(', ')}`)
          await this.store.recordSuccess(episode.appliedLessonIds)
        }
        return true
      } else {
        // APPRENTISSAGE PAR L'ÉCHEC : On distille une nouvelle leçon
        console.log(`[VimaxBrain] Apprentissage par l'échec sur ${episode.agentName}...`)
        const [lessonPartial] = await this.refinery.refine([episode])
        if (lessonPartial) {
          await this.store.addLesson({
            ...lessonPartial,
            id: `lesson-human-${Date.now()}`,
            agentName: episode.agentName,
            confidence: 1,
            successCount: 1,
            failCount: 0,
            tags: lessonPartial.tags || [],
            lastUpdated: Date.now()
          } as any)
          return true
        }
      }
    } catch (error) {
      console.error(`[VimaxBrain] Erreur lors du processing feedback:`, error)
    }
    return false
  }

  private async findEpisodePath(episodeId: string): Promise<string | null> {
    const rootDir = path.join(process.cwd(), 'vimax-logs', 'learning-episodes')
    const find = async (dir: string): Promise<string | null> => {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const res = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          const found = await find(res)
          if (found) return found
        } else if (entry.name === `${episodeId}.json`) {
          return res
        }
      }
      return null
    }
    return find(rootDir)
  }

  /**
   * Nettoyage et fusion du store pour éviter le surpoids.
   */
  async consolidate(): Promise<void> {
    await this.store.load()
    const all = this.store.getLessonsFor('Global') // On pourrait boucler sur tous les agents

    if (all.length > 20) {
      console.log(`[VimaxBrain] Consolidation requise : ${all.length} leçons détectées.`)
      const consolidated = await this.refinery.consolidate(all)

      // On vide et on remplace (implémentation simplifiée)
      // En prod, on ferait un merge intelligent
      for (const lesson of consolidated) {
        await this.store.addLesson(lesson)
      }
    }
  }

  private async loadEpisodes(): Promise<LearningEpisode[]> {
    const dir = path.join(process.cwd(), 'vimax-logs', 'learning-episodes')
    return this.readEpisodesRecursively(dir)
  }

  private async readEpisodesRecursively(dir: string): Promise<LearningEpisode[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      const results: LearningEpisode[] = []

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          const subResults = await this.readEpisodesRecursively(fullPath)
          results.push(...subResults)
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          try {
            const content = await fs.readFile(fullPath, 'utf8')
            results.push(JSON.parse(content))
          } catch (error) {
            console.error(`[VimaxBrain] Error reading ${fullPath}:`, error)
          }
        }
      }
      return results
    } catch {
      return []
    }
  }

  /**
   * Analyse la performance des leçons appliquées (Darwinisme).
   */
  private async scoreLessons(episodes: LearningEpisode[]): Promise<void> {
    const store = LessonStore.getInstance()
    await store.load()

    for (const ep of episodes) {
      if (!ep.appliedLessonIds || ep.appliedLessonIds.length === 0 || !ep.evaluation) continue

      for (const lessonId of ep.appliedLessonIds) {
        const lesson = store.getLessonById(lessonId)
        if (!lesson) continue

        if (ep.evaluation.isValid) {
          lesson.successCount++
        } else {
          lesson.failCount++
        }

        // Recalculer la confiance (Bayésien simplifié)
        const total = lesson.successCount + lesson.failCount
        if (total > 5) {
          lesson.confidence = lesson.successCount / total
        }

        await store.addLesson(lesson)
      }
    }

    // Phase d'élagage (Pruning)
    await this.pruneIneffectiveLessons()
  }

  /**
   * Supprime les leçons qui nuisent à la performance ou qui sont redondantes.
   */
  private async pruneIneffectiveLessons(): Promise<void> {
    const store = LessonStore.getInstance()
    const all = store.getAllLessons()

    for (const lesson of all) {
      const total = lesson.successCount + lesson.failCount
      // Si une leçon échoue trop souvent après un rodage (ex: > 40% d'échec sur 10+ runs)
      if (total >= 10 && lesson.failCount / total > 0.4) {
        console.warn(`[VimaxBrain] Pruning ineffective lesson: ${lesson.id} (${lesson.directive})`)
        await store.deleteLesson(lesson.id)
      }
    }
  }

  /**
   * Supprime les épisodes trop vieux (ex: > 7 jours) pour économiser l'espace.
   */
  private async cleanupOldEpisodes(): Promise<void> {
    const dir = path.join(process.cwd(), 'vimax-logs', 'learning-episodes')
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000 // 7 jours

    try {
      const files = await fs.readdir(dir)
      const now = Date.now()

      for (const file of files) {
        const filePath = path.join(dir, file)
        const stats = await fs.stat(filePath)
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath)
        }
      }
    } catch {
      // Ignorer si le dossier n'existe pas encore
    }
  }
}
