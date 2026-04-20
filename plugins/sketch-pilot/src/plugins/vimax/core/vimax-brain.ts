import fs from 'node:fs/promises'
import path from 'node:path'
import { VimaxPromptRefinery } from '../agents/vimax-prompt-refinery.agent'
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
  private store: LessonStore
  private maxTokensPerCycle: number = 50000 // Défaut : 50k tokens par cycle (~0.15$)

  constructor(
    private llm: LLMService,
    options?: { maxTokensPerCycle?: number }
  ) {
    this.refinery = new VimaxPromptRefinery(llm)
    this.visionAuditor = new VimaxVisionAuditor(llm)
    this.store = LessonStore.getInstance()
    if (options?.maxTokensPerCycle) {
      this.maxTokensPerCycle = options.maxTokensPerCycle
    }
  }

  /**
   * Pipeline d'apprentissage autonome (Shadow Loop).
   * Analyse les derniers épisodes et met à jour le store.
   */
  async autonomousLearning(): Promise<number> {
    await this.store.load()
    const episodes = await this.loadEpisodes()
    if (episodes.length === 0) return 0

    // Filtre les échecs auto ou humains
    const failures = episodes.filter((ep) => ep.status === 'failure' || (ep.evaluation && !ep.evaluation.isValid))
    if (failures.length === 0) return 0

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
    return this.applyLessons(newLessonPartials, updatedFailures)
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
          lastUpdated: Date.now()
        })
        count++
      }
    }
    return count
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
    const filePath = path.join(process.cwd(), 'vimax-logs', 'learning-episodes', `${episodeId}.json`)

    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const episode: LearningEpisode = JSON.parse(raw)

      // On enrichit l'épisode avec l'évaluation humaine
      episode.evaluation = {
        score: 0,
        isValid: false,
        issues: ['Feedback utilisateur'],
        critique,
        source: 'human'
      }
      episode.status = 'failure'

      // Sauvegarde du feedback
      await fs.writeFile(filePath, JSON.stringify(episode, null, 2))

      // On lance immédiatement un mini-cycle de raffinage pour cet épisode
      console.log(`[VimaxBrain] Apprentissage immédiat depuis feedback humain sur ${episode.agentName}...`)
      const [lessonPartial] = await this.refinery.refine([episode])

      if (lessonPartial) {
        await this.store.addLesson({
          ...lessonPartial,
          id: `lesson-human-${Date.now()}`,
          agentName: episode.agentName,
          confidence: 1, // Confiance maximum pour le feedback humain
          successCount: 1,
          failCount: 0,
          lastUpdated: Date.now()
        } as any)
        return true
      }
    } catch (error) {
      console.error(`[VimaxBrain] Erreur lors du processing feedback:`, error)
    }
    return false
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
    try {
      const files = await fs.readdir(dir)
      return Promise.all(
        files
          .filter((f) => f.endsWith('.json'))
          .map(async (f) => JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')))
      )
    } catch {
      return []
    }
  }
}
