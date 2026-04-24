import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { VimaxPromptRefinery } from '../agents/vimax-prompt-refinery.agent'
import { VimaxSagaSentinel } from '../agents/vimax-saga-sentinel.agent'
import { VimaxTranscriptionAnalyst } from '../agents/vimax-transcription-analyst.agent'
import { VimaxVisionAuditor } from '../agents/vimax-vision-auditor.agent'
import { YoutubeExtractor } from '../utils/youtube-extractor'
import type { LearningEpisode, Lesson, NarrativeFeedbackItem } from '../types'
import { LessonStore } from './lesson-store'
import type { LLMService } from './llm.interface'

/**
 * VimaxBrain
 * Unité centrale d'intelligence et d'auto-amélioration.
 * Gère le cycle de vie des leçons, le feedback humain et l'audit post-saga.
 */
export class VimaxBrain {
  private refinery: VimaxPromptRefinery
  public visionAuditor: VimaxVisionAuditor
  private sagaSentinel: VimaxSagaSentinel
  private transcriptionAnalyst: VimaxTranscriptionAnalyst
  private store: LessonStore
  private maxTokensPerCycle: number = 50000 // Défaut : 50k tokens par cycle (~0.15$)
  private seriesId?: string

  constructor(
    private llm: LLMService,
    options?: { maxTokensPerCycle?: number }
  ) {
    this.refinery = new VimaxPromptRefinery(llm)
    this.visionAuditor = new VimaxVisionAuditor(llm)
    this.sagaSentinel = new VimaxSagaSentinel(llm)
    this.transcriptionAnalyst = new VimaxTranscriptionAnalyst(llm)
    this.store = LessonStore.getInstance()
    if (options?.maxTokensPerCycle) {
      this.maxTokensPerCycle = options.maxTokensPerCycle
    }
  }

  public setSeriesId(id: string) {
    this.seriesId = id
    this.refinery.setSeriesId(id)
    this.visionAuditor.setSeriesId(id)
    this.sagaSentinel.setSeriesId(id)
  }

  public setBrainMode(mode: 'stable' | 'all') {
    this.refinery.setBrainMode(mode)
    this.visionAuditor.setBrainMode(mode)
    this.sagaSentinel.setBrainMode(mode)
  }

  /**
   * Pipeline d'apprentissage autonome (Shadow Loop).
   * Analyse les derniers épisodes et met à jour le store.
   */
  async autonomousLearning(options?: { seriesId?: string }): Promise<{
    newLessonsCount: number
    totalScore: number
    narrativeScore: number
    visualScore: number
    logicScore: number
    tokenUsage: number
    lessons: string[]
  }> {
    await this.store.load()
    let episodes = await this.loadEpisodes()
    if (episodes.length === 0) {
      await this.cleanupOldEpisodes()
      return {
        newLessonsCount: 0,
        totalScore: 0,
        narrativeScore: 0,
        visualScore: 0,
        logicScore: 0,
        tokenUsage: 0,
        lessons: []
      }
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

    const failures = episodes.filter(
      (ep) => (ep.status === 'failure' || (ep.evaluation && !ep.evaluation.isValid)) && !ep.learningApplied
    )
    if (failures.length === 0) {
      const stats = await this.getPerformanceStats()
      return {
        newLessonsCount: successes.length,
        totalScore: stats.totalAvg,
        narrativeScore: stats.aspects.Narrative?.avg || 0,
        visualScore: stats.aspects.Visual?.avg || 0,
        logicScore: stats.aspects.Cinematic?.avg || 0,
        tokenUsage: this.refinery.getMetrics().estimatedTokens,
        lessons: []
      }
    }

    // THRESHOLD : Si on a trop d'échecs, on passe en mode "Thematic Scaling"
    if (failures.length > 50) {
      return this.massThematicLearning(failures)
    }

    console.log(`[VimaxBrain] Apprentissage multi-facettes (${failures.length} échecs)...`)

    // NOUVEAU V2 : Audit Visuel pour les épisodes qui ont des images
    for (const ep of episodes.filter((e) => e.status === 'success' && (e as any).renderedImages)) {
      await this.performVisionAudit(ep, (ep as any).renderedImages)
    }

    // On re-calcule les échecs après l'audit visuel
    const updatedFailures = episodes.filter(
      (ep) => ep.status === 'failure' || (ep.evaluation && !ep.evaluation.isValid)
    )
    if (updatedFailures.length === 0) {
      const stats = await this.getPerformanceStats()
      return {
        newLessonsCount: 0,
        totalScore: stats.totalAvg,
        narrativeScore: stats.aspects.Narrative?.avg || 0,
        visualScore: stats.aspects.Visual?.avg || 0,
        logicScore: stats.aspects.Cinematic?.avg || 0,
        tokenUsage: this.refinery.getMetrics().estimatedTokens,
        lessons: []
      }
    }

    // Catégorisation par aspect
    const aspects = {
      Narrative: ['saga-planner', 'narration', 'script-enhancer', 'event-extractor', 'input-sanitizer'],
      Visual: ['atmosphere-extractor', 'character-extractor', 'location-extractor', 'asset-extractor'],
      Cinematic: ['screenwriter', 'dialogue', 'animation', 'output-formatter']
    }

    let totalNewLessons = 0

    for (const [theme, agents] of Object.entries(aspects)) {
      const themeFailures = updatedFailures.filter((f) => agents.includes(f.agentName))
      if (themeFailures.length > 0) {
        console.log(`[VimaxBrain] Raffinement spécifique [${theme}] (${themeFailures.length} épisodes)...`)
        if (this.checkBudgetExceeded()) break

        const newLessonPartials = await this.refinery.refine(themeFailures, theme)
        totalNewLessons += await this.applyLessons(newLessonPartials, themeFailures)
      }
    }

    // On traite le reste (agents non classés) de façon générique
    const remainingFailures = updatedFailures.filter((f) => !Object.values(aspects).flat().includes(f.agentName))
    if (remainingFailures.length > 0 && !this.checkBudgetExceeded()) {
      console.log(`[VimaxBrain] Raffinement générique (${remainingFailures.length} épisodes)...`)
      const genericPartials = await this.refinery.refine(remainingFailures)
      totalNewLessons += await this.applyLessons(genericPartials, remainingFailures)
    }

    // Darwinisme : Fin de vie des leçons inefficaces
    await this.scoreLessons(episodes)

    // Nettoyage après apprentissage
    await this.cleanupOldEpisodes()

    const stats = await this.getPerformanceStats()

    return {
      newLessonsCount: totalNewLessons,
      totalScore: stats.totalAvg,
      narrativeScore: stats.aspects.Narrative?.avg || 0,
      visualScore: stats.aspects.Visual?.avg || 0,
      logicScore: stats.aspects.Cinematic?.avg || 0,
      tokenUsage: this.refinery.getMetrics().estimatedTokens,
      lessons: [] // To be populated with actual IDs if needed
    }
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
  private async massThematicLearning(failures: LearningEpisode[]): Promise<{
    newLessonsCount: number
    totalScore: number
    narrativeScore: number
    visualScore: number
    logicScore: number
    tokenUsage: number
    lessons: string[]
  }> {
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

    const stats = await this.getPerformanceStats()

    return {
      newLessonsCount: trendLessons.length,
      totalScore: stats.totalAvg,
      narrativeScore: stats.aspects.Narrative?.avg || 0,
      visualScore: stats.aspects.Visual?.avg || 0,
      logicScore: stats.aspects.Cinematic?.avg || 0,
      tokenUsage: this.refinery.getMetrics().estimatedTokens,
      lessons: trendLessons.map((l) => l.id)
    }
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
    if (episodes.length === 0) return { sagas: {}, aspects: {}, totalAvg: 0 }

    const aspects: Record<string, string[]> = {
      Narrative: ['saga-planner', 'narration', 'script-enhancer', 'event-extractor', 'input-sanitizer'],
      Visual: ['atmosphere-extractor', 'character-extractor', 'location-extractor', 'asset-extractor'],
      Cinematic: ['screenwriter', 'dialogue', 'animation', 'output-formatter']
    }

    const sagas: Record<string, { count: number; totalScore: number; avg: number; scores: number[] }> = {}
    const aspectStats: Record<string, { count: number; totalScore: number; avg: number }> = {
      Narrative: { count: 0, totalScore: 0, avg: 0 },
      Visual: { count: 0, totalScore: 0, avg: 0 },
      Cinematic: { count: 0, totalScore: 0, avg: 0 }
    }

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

        // Aspect tracking
        for (const [aspect, agents] of Object.entries(aspects)) {
          if (agents.includes(ep.agentName)) {
            aspectStats[aspect].count++
            aspectStats[aspect].totalScore += score
            break
          }
        }
      }
    })

    // Calcul des moyennes
    Object.keys(sagas).forEach((id) => {
      const s = sagas[id]
      s.avg = s.scores.length > 0 ? Math.round(s.totalScore / s.scores.length) : 0
    })

    Object.keys(aspectStats).forEach((aspect) => {
      const s = aspectStats[aspect]
      s.avg = s.count > 0 ? Math.round(s.totalScore / s.count) : 0
    })

    return {
      sagas,
      aspects: aspectStats,
      totalAvg: evaluatedCount > 0 ? Math.round(grandTotalScore / evaluatedCount) : 0,
      totalCount: episodes.length,
      evaluatedCount
    }
  }

  private async saveEpisode(episode: LearningEpisode): Promise<void> {
    const dir = path.join(process.cwd(), 'vimax-logs', 'sagas')
    // optimization: skip loadEpisodes() if possible, but keep findPath for now

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

  /**
   * Intègre un feedback narratif (saga ou épisode) pour distillation.
   */
  async processNarrativeFeedback(seriesId: string, feedback: any): Promise<boolean> {
    try {
      console.log(`[VimaxBrain] Apprentissage narratif pour la saga ${seriesId}...`)

      // On crée un épisode d'apprentissage synthétique pour ce feedback
      const syntheticEpisode: LearningEpisode = {
        id: `narrative-feedback-${seriesId}-${Date.now()}`,
        agentName: 'VimaxSagaPlanner', // L'agent responsable de la structure narrative
        systemPrompt: 'Analyse narrative globale',
        userPrompt: feedback.issue || 'Contexte narratif inconnu',
        response: JSON.stringify(feedback),
        timestamp: Date.now(),
        durationMs: 0,
        evaluation: {
          score: 0,
          isValid: false,
          issues: [feedback.rationale],
          critique: `${feedback.correction}. Exemple: ${feedback.example}`,
          source: 'human'
        },
        status: 'failure'
      }

      // Distillation
      const [lessonPartial] = await this.refinery.refine([syntheticEpisode])

      if (lessonPartial) {
        await this.store.addLesson({
          ...lessonPartial,
          id: `lesson-narrative-${Date.now()}`,
          agentName: 'VimaxSagaPlanner',
          confidence: 1,
          successCount: 1,
          failCount: 0,
          tags: [...(lessonPartial.tags || []), 'narrative'],
          lastUpdated: Date.now()
        } as any)

        console.log(`[VimaxBrain] Nouvelle leçon narrative ajoutée.`)
        return true
      }
    } catch (error) {
      console.error(`[VimaxBrain] Erreur lors du processing feedback narratif:`, error)
    }
    return false
  }

  /**
   * Intègre un feedback humain spécifique pour une scène précise.
   */
  async processSceneFeedback(
    seriesId: string,
    episodeNumber: number,
    sceneNumber: number,
    critique: string
  ): Promise<boolean> {
    const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', seriesId)
    // On cherche d'abord dans le dossier spécialisé 'episodes/', puis à la racine (legacy)
    let episodePath = path.join(sagaDir, 'episodes', `episode-${episodeNumber}.json`)
    const existsInSubdir = await fs
      .access(episodePath)
      .then(() => true)
      .catch(() => false)

    if (!existsInSubdir) {
      episodePath = path.join(sagaDir, `episode-${episodeNumber}.json`)
    }

    try {
      const episodeData = JSON.parse(await fs.readFile(episodePath, 'utf8'))
      // On cherche la scène dans les scènes de l'épisode
      const scene = episodeData.scenes?.find((s: any) => s.sceneNumber === sceneNumber)

      // On crée un épisode d'apprentissage synthétique pour cette scène
      const syntheticEpisode: LearningEpisode = {
        id: `scene-feedback-${seriesId}-${episodeNumber}-${sceneNumber}-${Date.now()}`,
        agentName: 'VimaxScreenwriter', // L'agent responsable du visuel et de la mise en scène
        systemPrompt: 'Analyse de scène spécifique',
        userPrompt: scene?.imagePrompt || scene?.visualPrompt || scene?.narration || 'Contexte de scène inconnu',
        response: JSON.stringify(scene),
        timestamp: Date.now(),
        durationMs: 0,
        evaluation: {
          score: 0,
          isValid: false,
          issues: ['Critique utilisateur sur scène spécifique'],
          critique: `[SCÈNE ${sceneNumber}] ${critique}`,
          source: 'human'
        },
        status: 'failure'
      }

      console.log(`[VimaxBrain] Apprentissage ciblé sur la scène ${sceneNumber} de l'épisode ${episodeNumber}...`)
      const [lessonPartial] = await this.refinery.refine([syntheticEpisode], 'Visual')

      if (lessonPartial) {
        await this.store.addLesson({
          ...lessonPartial,
          id: `lesson-scene-${Date.now()}`,
          agentName: 'VimaxScreenwriter',
          confidence: 1,
          successCount: 1,
          failCount: 0,
          tags: [...(lessonPartial.tags || []), `scene-${sceneNumber}`, `ep-${episodeNumber}`],
          lastUpdated: Date.now()
        } as any)
        return true
      }
    } catch (error) {
      console.error(`[VimaxBrain] Erreur lors du processing du feedback de scène:`, error)
    }
    return false
  }

  private async findEpisodePath(episodeId: string): Promise<string | null> {
    const rootDir = path.join(process.cwd(), 'vimax-logs', 'sagas')
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
   * Convertit un feedback d'audit narratif en une leçon pour le store.
   * On reformule le feedback pour enlever le contexte spécifique à la saga.
   */
  async registerLessonFromFeedback(feedback: NarrativeFeedbackItem): Promise<Lesson> {
    console.log(`[VimaxBrain] Reformulation globale du feedback : "${feedback.issue}"...`)

    const reformulationPrompt = `
Tu es un Architecte Narratif. Reçois un feedback de critique et reformule-le en une **Directive de Rigueur Globale**.
Règles :
1. Supprime TOUT contexte personnel (noms de personnages commençant par @, lieux spécifiques, événements précis).
2. Extrais le principe narratif universel sous-jacent (ex: au lieu de "@Clara doit être plus méfiante", utilise "Le protagoniste doit montrer une méfiance initiale organique face aux inconnus").
3. Garde un ton impératif et actionnable.
4. Si un exemple est nécessaire, utilise des termes génériques (ex: 'le protagoniste', 'l'antagoniste', 'le lieu de tension').

Feedback Original :
- Problème : ${feedback.issue}
- Justification : ${feedback.rationale}
- Correction suggérée : ${feedback.correction}
${feedback.example ? `- Exemple spécifique : ${feedback.example}` : ''}

Réponds uniquement avec la directive reformulée.
`.trim()

    const globalDirective = await this.llm.generateContent(
      reformulationPrompt,
      'Tu es un expert en distillation de principes narratifs universels.'
    )

    const lesson: Lesson = {
      id: `lesson-audit-${Date.now()}`,
      agentName: 'Global',
      directive: globalDirective.trim(),
      category: 'logic',
      confidence: 0.9,
      successCount: 1,
      failCount: 0,
      lastUpdated: Date.now(),
      tags: ['narrative', 'audit', feedback.priority]
    }

    await this.store.addLesson(lesson)
    return lesson
  }

  /**
   * Met à jour une leçon existante en y intégrant un feedback utilisateur.
   */
  async refineLesson(lessonId: string, userFeedback: string): Promise<Lesson> {
    await this.store.load()
    const lesson = this.store.getLessonById(lessonId)
    if (!lesson) {
      throw new Error(`Leçon ${lessonId} non trouvée.`)
    }

    console.log(`[VimaxBrain] Raffinement de la leçon ${lessonId} avec feedback : "${userFeedback}"...`)

    const refinementPrompt = `
Tu es un Architecte Narratif Senior. Ta mission est de mettre à jour une **Directive de Rigueur Globale** existante en y intégrant un nouveau feedback utilisateur.

[DIRECTIVE ACTUELLE]
${lesson.directive}

[FEEDBACK UTILISATEUR]
${userFeedback}

[CONSIGNES]
1. Synthétise la directive actuelle et le feedback pour créer une nouvelle version plus équilibrée ou plus précise.
2. Évite que la nouvelle directive ne devienne contradictoire.
3. Garde le ton impératif, universel et sans noms propres. (Ex: "Le protagoniste", "L'antagoniste").
4. Ne supprime pas totalement l'intention originale, mais nuance-la selon le feedback.

Réponds UNIQUEMENT avec la nouvelle directive reformulée.
`.trim()

    const refinedDirective = await this.llm.generateContent(
      refinementPrompt,
      'Tu es un expert en équilibrage de principes narratifs.'
    )

    lesson.directive = refinedDirective.trim()
    lesson.lastUpdated = Date.now()
    lesson.confidence = 1 // Un feedback humain booste la confiance au max

    await this.store.addLesson(lesson)
    return lesson
  }

  /**
   * Récupère toutes les leçons du store.
   */
  async getAllLessons(): Promise<Lesson[]> {
    await this.store.load()
    return this.store.getAllLessons()
  }

  /**
   * Supprime une leçon du store.
   */
  async deleteLesson(id: string): Promise<void> {
    await this.store.load()
    await this.store.deleteLesson(id)
  }

  /**
   * Consolide la bibliothèque de leçons (Anti-bloat).
   * Double-Buffer Logic : Fusionne l'Hippocampe (Learning) dans le Cortex (Stable).
   */
  async consolidateLessons(): Promise<void> {
    await this.store.load()

    const stable = this.store.getStableLessons()
    const learning = this.store.getLearningLessons()
    const allLessons = [...stable, ...learning]

    if (allLessons.length === 0) return

    console.log(`[VimaxBrain] Consolidation Cortex (${stable.length}) + Hippocampe (${learning.length}) en cours...`)

    // On crée un snapshot de sécurité (Bundle complet)
    const backupPath = await this.store.createSnapshot('pre-consolidate')
    console.log(`[VimaxBrain] Snapshot de sécurité créé : ${path.basename(backupPath)}`)

    // 1. Groupement par agent pour éviter la fuite d'identité
    const agents = [...new Set(allLessons.map((l) => l.agentName))]
    const consolidatedSet: Lesson[] = []

    console.log(`[VimaxBrain] Consolidation multi-agents (${agents.length} agents détectés)...`)

    for (const agentName of agents) {
      const agentLessons = allLessons.filter((l) => l.agentName === agentName)
      if (agentLessons.length > 0) {
        console.log(`[VimaxBrain]   -> Distillation pour ${agentName} (${agentLessons.length} leçons)...`)
        const result = await this.refinery.thematicConsolidate(agentLessons, agentName)
        consolidatedSet.push(...result)
      }
    }

    console.log(
      `[VimaxBrain] Consolidation terminée : ${allLessons.length} -> ${consolidatedSet.length} leçons distillées.`
    )

    // On préserve les leçons validées manuellement (Sacrées)
    const verified = allLessons.filter((l) => l.verified)

    // On prépare le nouveau set pour le Cortex
    const newStableSet = [...verified]
    for (const l of consolidatedSet) {
      // On évite les doublons avec les verified
      if (!newStableSet.some((v) => v.directive === l.directive)) {
        newStableSet.push(l)
      }
    }

    // Mise à jour du CORTEX
    await this.store.replaceStableLessons(newStableSet)

    // Purge de l'HIPPOCAMPE
    await this.store.clearLearning()

    // On incrémente la version du Brain automatiquement
    const newVer = await this.store.incrementVersion()
    console.log(`[VimaxBrain] Vimax Brain v${newVer} distillé et stabilisé par agent. 🚀`)
  }

  /**
   * Apprentissage à partir d'un texte fourni manuellement (Source-based Learning).
   */
  async learnFromText(
    text: string,
    sourceLabel: string
  ): Promise<{
    lessonCount: number
    lessons: string[]
  }> {
    console.log(`[VimaxBrain] Apprentissage par texte de référence: ${sourceLabel} (${text.length} caractères)`)

    // 1. Analyse par l'agent spécialisé
    const lessons = await this.transcriptionAnalyst.analyze(text, sourceLabel)

    // 2. Enregistrement dans le store
    await this.store.load()
    for (const lesson of lessons) {
      await this.store.addLesson(lesson)
    }

    console.log(`[VimaxBrain] ✓ ${lessons.length} nouvelles leçons de référence apprises.`)

    return {
      lessonCount: lessons.length,
      lessons: lessons.map((l) => l.directive)
    }
  }

  /**
   * Apprentissage à partir d'une vidéo YouTube (Reference Learning).
   */
  async learnFromYoutube(
    url: string,
    lang = 'fr'
  ): Promise<{
    lessonCount: number
    lessons: string[]
  }> {
    const transcription = await YoutubeExtractor.extractTranscription(url, lang)
    return this.learnFromText(transcription, url)
  }

  /**
   * Revient à la version précédente de la bibliothèque (Rollback).
   */
  async rollbackLessons(): Promise<boolean> {
    const success = await this.store.restoreLastSnapshot()
    if (success) {
      console.log('✅ Rollback effectué. La bibliothèque a été restaurée à son état précédent.')
    } else {
      console.error('❌ Impossible de trouver un snapshot pour le rollback.')
    }
    return success
  }

  /**
   * Upgrage la version du Brain et crée une baseline de production.
   */
  async upgradeBrain(newVersion: string): Promise<void> {
    await this.store.upgrade(newVersion)
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

  public async loadEpisodes(): Promise<LearningEpisode[]> {
    const dir = path.join(process.cwd(), 'vimax-logs', 'sagas')
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

        // DARWINISME : Validation Automatique (Auto-Verification)
        // Si une leçon est extrêmement stable sur un échantillon significatif, elle devient vérifiée.
        if (total >= 10 && lesson.confidence >= 0.95 && !lesson.verified) {
          console.log(`[VimaxBrain] Auto-Validating stable lesson: ${lesson.id}`)
          await store.validateLesson(lesson.id)
        } else {
          await store.addLesson(lesson)
        }
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
      if (lesson.verified) continue // On ne touche pas aux leçons validées par l'humain

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
