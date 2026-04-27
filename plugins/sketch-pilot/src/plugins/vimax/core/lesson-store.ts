import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { LessonStore as ILessonStore, Lesson } from '../types'

/**
 * LessonStore
 * Gère une architecture Double-Buffer pour le Vimax Brain :
 * 1. Cortex (vimax-brain.json) : ADN stabilisé, versionné, immuable hors consolidation.
 * 2. Hippocampe (vimax-learning.json) : Buffer d'apprentissage actif pour les retours récents.
 */
export class LessonStore {
  private static instance: LessonStore
  private storePath: string
  private learningPath: string
  private data: ILessonStore = { version: '1.0.0', lessons: [], globalDirectives: [] }
  private learningData: ILessonStore = { version: '1.0.0', lessons: [], globalDirectives: [] }

  // [V48] Working Memory (Transient momentum per saga)
  private workingMemory: Record<string, Record<string, { successCount: number; lastModified: number }>> = {}

  private static readonly LEGACY_MAPPING: Record<string, string> = {
    screenwriter: 'VimaxScreenwriter',
    'saga-planner': 'VimaxSagaPlanner',
    narration: 'VimaxNarrationAgent',
    'character-extractor': 'VimaxCharacterExtractor',
    'location-extractor': 'VimaxLocationExtractor',
    'event-extractor': 'VimaxEventExtractor',
    'continuity-auditor': 'VimaxContinuityAuditor',
    'dialogue-agent': 'VimaxDialogueAgent'
  }

  private constructor() {
    const root = process.cwd()
    const dataDir = path.join(root, 'plugins', 'sketch-pilot', 'src', 'plugins', 'vimax', 'data')

    this.storePath = path.join(dataDir, 'vimax-brain.json')
    this.learningPath = path.join(dataDir, 'vimax-learning.json')
  }

  public static getInstance(): LessonStore {
    if (!LessonStore.instance) {
      LessonStore.instance = new LessonStore()
    }
    return LessonStore.instance
  }

  /**
   * Charge les leçons (Cortex + Hippocampe) depuis le disque.
   */
  async load(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.storePath), { recursive: true })

      // MIGRATION Legacy
      const legacyPath = this.storePath.replace('vimax-brain.json', 'learned-lessons.json')
      try {
        await fs.access(this.storePath)
      } catch {
        try {
          await fs.access(legacyPath)
          console.log(`[LessonStore] Migration détectée : learned-lessons.json -> vimax-brain.json`)
          await fs.copyFile(legacyPath, this.storePath)
          await fs.rename(legacyPath, `${legacyPath}.migrated`)
        } catch {
          // Aucun fichier legacy
        }
      }

      // Load CORTEX (Prod)
      try {
        const raw = await fs.readFile(this.storePath, 'utf8')
        this.data = JSON.parse(raw)

        // [MIGRATION & SÉCURITÉ] : Si lessons manque mais laws existe (legacy)
        if (!this.data.lessons && (this.data as any).laws) {
          this.data.lessons = (this.data as any).laws.map((l: any) => ({
            id: l.id,
            directive: l.directive,
            agentName: 'Global',
            category: 'law',
            tags: []
          }))
        }
        if (!this.data.lessons) this.data.lessons = []
        if (!this.data.globalDirectives) this.data.globalDirectives = []
      } catch {
        this.data = { version: '1.0.0', lessons: [], globalDirectives: [] }
      }

      // Load HIPPOCAMPUS (Learning Buffer)
      try {
        const rawL = await fs.readFile(this.learningPath, 'utf8')
        this.learningData = JSON.parse(rawL)
        if (!this.learningData.lessons) this.learningData.lessons = []
      } catch {
        this.learningData = { version: '1.0.0', lessons: [], globalDirectives: [] }
      }

      // Initialisation de la version si manquante
      if (!this.data.version) {
        this.data.version = '1.0.0'
        await this.save()
      }
    } catch (error) {
      console.error('[LessonStore] Erreur lors du chargement des stores:', error)
    }
  }

  /**
   * Sauvegarde les deux stores sur le disque de manière atomique.
   */
  async save(): Promise<void> {
    // Save Cortex
    const tmpPath = `${this.storePath}.tmp`
    await fs.writeFile(tmpPath, JSON.stringify(this.data, null, 2), 'utf8')
    await fs.rename(tmpPath, this.storePath)

    // Save Hippocampus
    const tmpLPath = `${this.learningPath}.tmp`
    await fs.writeFile(tmpLPath, JSON.stringify(this.learningData, null, 2), 'utf8')
    await fs.rename(tmpLPath, this.learningPath)
  }

  /**
   * Crée un snapshot des deux stores.
   */
  async createSnapshot(label: string = 'auto'): Promise<string> {
    const backupDir = path.join(path.dirname(this.storePath), 'backups')
    await fs.mkdir(backupDir, { recursive: true })

    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
    const backupName = `vimax-brain.${label}.${timestamp}.json`
    const backupPath = path.join(backupDir, backupName)

    const bundle = { cortex: this.data, hippocampus: this.learningData }
    await fs.writeFile(backupPath, JSON.stringify(bundle, null, 2), 'utf8')

    return backupPath
  }

  /**
   * Restaure le dernier snapshot (Cortex + Hippocampe).
   */
  async restoreLastSnapshot(): Promise<boolean> {
    const backupDir = path.join(path.dirname(this.storePath), 'backups')
    try {
      const files = await fs.readdir(backupDir)
      const snapshots = []
      for (const f of files.filter((f) => f.startsWith('vimax-brain.'))) {
        const stats = await fs.stat(path.join(backupDir, f))
        snapshots.push({ name: f, mtime: stats.mtimeMs })
      }

      if (snapshots.length === 0) return false

      // Sort by more recent first
      snapshots.sort((a, b) => b.mtime - a.mtime)

      const lastSnapshot = path.join(backupDir, snapshots[0].name)
      const raw = await fs.readFile(lastSnapshot, 'utf8')
      const bundle = JSON.parse(raw)

      this.data = bundle.cortex
      this.learningData = bundle.hippocampus

      await this.save()
      return true
    } catch {
      return false
    }
  }

  /**
   * Récupère les leçons pour un agent spécifique.
   * [V48] Dopamine & Working Memory: Priorisation par momentum et impact.
   */
  /**
   * Récupère les leçons pour un agent spécifique avec filtrage contextuel.
   * [V48] Architecte Narratif : Filtrage par moment, genre et conditions.
   */
  getLessonsFor(
    agentName: string,
    tags: string[] = [],
    mode: 'stable' | 'all' = 'all',
    seriesId?: string,
    context?: {
      moment?: 'opening' | 'midpoint' | 'climax' | 'resolution' | 'any'
      genres?: string[]
      isAction?: boolean
      isDialogue?: boolean
      tension?: number
    }
  ): Lesson[] {
    const legacyName = LessonStore.LEGACY_MAPPING[agentName]

    // 1. Chargement du pool global/agent/saga
    const allAvailable =
      mode === 'all'
        ? [...(this.data.lessons || []), ...(this.learningData.lessons || [])]
        : [...(this.data.lessons || [])]

    // [V50] SHARDING GLOBAL : On ne prend les leçons Global que si elles sont pertinentes pour le domaine de l'agent
    const agentDomains = {
      narration: ['VimaxNarrationAgent', 'VimaxSagaPlanner', 'VimaxEventExtractor'],
      visual: ['VimaxScreenwriter', 'VimaxCharacterExtractor', 'VimaxLocationExtractor', 'VimaxAtmosphereExtractor'],
      logic: ['VimaxAgent', 'VimaxSagaPlanner'],
      cinematic: ['VimaxScreenwriter', 'VimaxDialogueAgent', 'VimaxAnimationAgent']
    }

    const filteredPool = allAvailable.filter((l) => {
      // Cas 1 : Leçon spécifique à l'agent
      if (l.agentName === agentName || (legacyName && l.agentName === legacyName)) {
        return !l.seriesId || l.seriesId === seriesId
      }

      // Cas 2 : Leçon Global - On vérifie le domaine
      if (l.agentName === 'Global') {
        const category = l.category || 'logic'
        const domain = (agentDomains as any)[category] || []
        const isTargeted = domain.includes(agentName) || (legacyName && domain.includes(legacyName))

        // Si la leçon est Global mais n'a pas de catégorie matchant l'agent, on l'ignore (Pollution Shield)
        if (!isTargeted && category !== 'logic') return false // La catégorie 'logic' reste universelle par défaut
        return !l.seriesId || l.seriesId === seriesId
      }

      return false
    })

    // 2. Filtrage Contextuel Chirurgical
    const contextualLessons = filteredPool.filter((l) => {
      // ... same as before
      // Filtrage par Genre
      if (context?.genres && l.genreScope && !l.genreScope.includes('any')) {
        const hasGenreMatch = context.genres.some((g) => l.genreScope?.includes(g))
        if (!hasGenreMatch) return false
      }

      // Filtrage par Moment (applicableAt)
      if (context?.moment && l.applicableAt && l.applicableAt !== 'any' && l.applicableAt !== context.moment)
        return false

      // Filtrage par Force/Condition (strength)
      if (l.strength === 'if_action_scene' && !context?.isAction) return false
      if (l.strength === 'if_dialogue_scene' && !context?.isDialogue) return false
      if (l.strength === 'if_tension_high' && (context?.tension || 0) < 70) return false

      return true
    })

    // 3. DOPAMINE SIGNAL : Calcul du score de priorité final
    const getPriorityScore = (l: Lesson) => {
      const impact = l.impactRatio || 0
      const confidence = l.confidence || 0.5
      let momentum = 0
      if (seriesId && this.workingMemory[seriesId]?.[l.id]) {
        momentum = this.workingMemory[seriesId][l.id].successCount * 20
      }
      return impact * confidence + momentum
    }

    // 4. Tri et Troncature Top-K (V46)
    const MAX_LESSONS_PER_CALL = 7
    let finalSorted: Lesson[] = []

    if (tags && tags.length > 0) {
      const tagged = contextualLessons.filter((l) => l.tags?.some((t) => tags.includes(t)))
      const general = contextualLessons.filter((l) => !l.tags || l.tags.length === 0)
      finalSorted = [...new Set([...tagged, ...general])].sort((a, b) => getPriorityScore(b) - getPriorityScore(a))
    } else {
      finalSorted = contextualLessons.sort((a, b) => getPriorityScore(b) - getPriorityScore(a))
    }

    // [V46] TOP-K SHIELD : On ne garde que les 7 meilleures leçons pour éviter les contradictions et la soupe d'intelligence
    return finalSorted.slice(0, MAX_LESSONS_PER_CALL)
  }

  /**
   * Enregistre un succès immédiat dans la mémoire de travail (Momentum).
   */
  recordWorkingSuccess(seriesId: string, lessonId: string): void {
    if (!this.workingMemory[seriesId]) {
      this.workingMemory[seriesId] = {}
    }
    if (!this.workingMemory[seriesId][lessonId]) {
      this.workingMemory[seriesId][lessonId] = { successCount: 0, lastModified: Date.now() }
    }
    this.workingMemory[seriesId][lessonId].successCount++
    this.workingMemory[seriesId][lessonId].lastModified = Date.now()
  }

  /**
   * Efface la mémoire de travail à la fin d'une saga.
   */
  clearWorkingMemory(seriesId: string): void {
    delete this.workingMemory[seriesId]
  }

  /**
   * Promeut une leçon de l'Hippocampe vers le Cortex (Validation Manuelle).
   */
  async promoteLesson(id: string): Promise<boolean> {
    const lessonIndex = this.learningData.lessons.findIndex((l) => l.id === id)
    if (lessonIndex === -1) return false

    const [lesson] = this.learningData.lessons.splice(lessonIndex, 1)

    // On s'assure qu'elle est vérifiée et stabilisée
    lesson.verified = true
    lesson.confidence = 1
    if (lesson.successCount < 100) lesson.successCount += 100

    this.data.lessons.push(lesson)
    await this.save()
    console.log(`[LessonStore] Leçon ${id} promue vers le Cortex ! 🚀`)
    return true
  }

  /**
   * Récupère toutes les leçons.
   */
  getAllLessons(mode: 'stable' | 'all' = 'all'): Lesson[] {
    const stable = this.data.lessons || []
    const learning = this.learningData.lessons || []
    if (mode === 'stable') return [...stable]
    return [...stable, ...learning]
  }

  /**
   * Récupère les leçons du Cortex uniquement (Stable)
   */
  getStableLessons(): Lesson[] {
    return [...(this.data.lessons || [])]
  }

  /**
   * Récupère les leçons de l'Hippocampe uniquement (Buffer)
   */
  getLearningLessons(): Lesson[] {
    return [...this.learningData.lessons]
  }

  /**
   * Ajoute une leçon dans l'HIPPOCAMPE (Buffer d'apprentissage actif).
   */
  async addLesson(lesson: Lesson): Promise<void> {
    const isDuplicate = (l: Lesson) => {
      if (l.id === lesson.id) return true
      return (
        l.agentName === lesson.agentName && l.directive.toLowerCase().trim() === lesson.directive.toLowerCase().trim()
      )
    }

    // 1. Check CORTEX first
    const cortexIndex = this.data.lessons.findIndex(isDuplicate)
    if (cortexIndex >= 0) {
      const existing = this.data.lessons[cortexIndex]
      this.data.lessons[cortexIndex] = {
        ...existing,
        ...lesson,
        successCount: (existing.successCount || 0) + (lesson.successCount || 0),
        failCount: (existing.failCount || 0) + (lesson.failCount || 0),
        lastUpdated: Date.now()
      }
      await this.save()
      return
    }

    // 2. Check HIPPOCAMPUS
    const learningIndex = this.learningData.lessons.findIndex(isDuplicate)
    if (learningIndex >= 0) {
      const existing = this.learningData.lessons[learningIndex]
      this.learningData.lessons[learningIndex] = {
        ...existing,
        ...lesson,
        successCount: (existing.successCount || 0) + (lesson.successCount || 0),
        failCount: (existing.failCount || 0) + (lesson.failCount || 0),
        confidence: Math.max(existing.confidence || 0, lesson.confidence || 0),
        lastUpdated: Date.now()
      }
    } else {
      this.learningData.lessons.push({
        ...lesson,
        successCount: lesson.successCount || 1,
        failCount: lesson.failCount || 0,
        confidence: lesson.confidence || 0.5,
        lastUpdated: Date.now()
      })
    }
    await this.save()
  }

  /**
   * Vide l'Hippocampe (après consolidation).
   */
  async clearLearning(): Promise<void> {
    this.learningData.lessons = []
    await this.save()
  }

  /**
   * Remplace intégralement les leçons du CORTEX (pendant la consolidation).
   */
  async replaceStableLessons(lessons: Lesson[]): Promise<void> {
    this.data.lessons = lessons
    await this.save()
  }

  /**
   * Enregistre un succès pour une liste de leçons.
   * V4 : Darwinisme d'Impact - Suit l'amélioration du score.
   */
  async recordSuccess(lessonIds: string[], scoreDelta = 0): Promise<void> {
    if (!lessonIds || lessonIds.length === 0) return
    let changed = false

    // V47: Separate buffer processing to avoid phantom mutations
    const processBuffer = (buffer: Lesson[], isCurrentlyLearning: boolean) => {
      const alpha = 0.3
      const snapshotsToMove: number[] = []

      for (const [i, l] of buffer.entries()) {
        if (lessonIds.includes(l.id)) {
          l.successCount = (l.successCount || 0) + 1
          l.deltaScore = (l.deltaScore || 0) + scoreDelta

          // EMA (Exponential Moving Average)
          const currentImpact = scoreDelta
          l.impactRatio =
            l.impactRatio === undefined ? currentImpact : (1 - alpha) * l.impactRatio + alpha * currentImpact

          l.lastUpdated = Date.now()
          changed = true

          // STABILISATION AUTONOME : Promotion vers le Cortex
          // On marque pour déplacement différé si proofs made (5 succès, impact, no fail)
          if (isCurrentlyLearning && l.successCount >= 5 && (l.impactRatio || 0) > 20 && (l.failCount || 0) === 0) {
            snapshotsToMove.push(i)
          }
        }
      }
      return snapshotsToMove
    }

    // 1. Process Cortex (Safe update)
    processBuffer(this.data.lessons, false)

    // 2. Process Hippocampus (With potential promotion)
    const toMoveIndices = processBuffer(this.learningData.lessons, true)

    if (toMoveIndices.length > 0) {
      // Move in reverse to keep indices valid during splice
      for (const idx of toMoveIndices.reverse()) {
        const [lesson] = this.learningData.lessons.splice(idx, 1)
        lesson.verified = true
        console.log(
          `[LessonStore] 💎 Stabilisation Autonome : Leçon ${lesson.id} promue (Impact: ${lesson.impactRatio?.toFixed(1)})`
        )
        this.data.lessons.push(lesson)
      }
    }

    if (changed) await this.save()
  }

  /**
   * Enregistre un échec pour une liste de leçons.
   */
  async recordFailure(lessonIds: string[]): Promise<void> {
    if (!lessonIds || lessonIds.length === 0) return
    let changed = false

    const updateBuffer = (buffer: Lesson[]) => {
      buffer.forEach((l) => {
        if (lessonIds.includes(l.id)) {
          l.failCount = (l.failCount || 0) + 1
          l.lastUpdated = Date.now()
          changed = true
        }
      })
    }

    updateBuffer(this.data.lessons)
    updateBuffer(this.learningData.lessons)

    if (changed) await this.save()
  }

  /**
   * Récupère une leçon par son ID (dans les deux stores).
   */
  getLessonById(id: string): Lesson | undefined {
    return this.data.lessons.find((l) => l.id === id) || this.learningData.lessons.find((l) => l.id === id)
  }

  /**
   * Valide une leçon manuellement (Consolidation humaine).
   * Une leçon validée a une confiance maximale et peut être déplacée vers le Cortex si souhaité.
   */
  async validateLesson(id: string): Promise<boolean> {
    const lesson = this.getLessonById(id)
    if (!lesson) return false

    lesson.verified = true
    lesson.confidence = 1
    lesson.successCount = (lesson.successCount || 0) + 100
    lesson.lastUpdated = Date.now()

    await this.save()
    return true
  }

  /**
   * Supprime une leçon (des deux stores).
   */
  async deleteLesson(id: string): Promise<void> {
    this.data.lessons = this.data.lessons.filter((l) => l.id !== id)
    this.learningData.lessons = this.learningData.lessons.filter((l) => l.id !== id)
    await this.save()
  }

  /**
   * Upgrage la version du Brain et crée une baseline.
   */
  async upgrade(newVersion: string): Promise<void> {
    const oldVersion = this.data.version
    await this.createSnapshot(`baseline-v${oldVersion.replaceAll('.', '-')}`)

    this.data.version = newVersion
    await this.save()
    console.log(`[LessonStore] Vimax Brain upgradé : v${oldVersion} -> v${newVersion} 💎`)
  }

  /**
   * Incrémente automatiquement la version mineure (Patch).
   */
  async incrementVersion(): Promise<string> {
    const parts = (this.data.version || '1.0.0').split('.')
    if (parts.length === 3) {
      parts[2] = (parseInt(parts[2]) + 1).toString()
      this.data.version = parts.join('.')
      await this.save()
    }
    return this.data.version
  }

  /**
   * Formate les leçons en directives pour un prompt système.
   */
  formatDirectives(
    agentName: string,
    tags: string[] = [],
    mode: 'stable' | 'all' = 'all',
    seriesId?: string,
    context?: any
  ): string {
    const lessons = this.getLessonsFor(agentName, tags, mode, seriesId, context)
    if (lessons.length === 0) return ''

    // On sépare les leçons de style (vocabulaire/clichés) des directives logiques
    const logicLessons = lessons.filter((l) => !l.tags?.some((t) => t.startsWith('style:')))
    const styleLessons = lessons.filter((l) => l.tags?.some((t) => t.startsWith('style:')))

    let output = `\n[DIRECTIVES DE RIGUEUR - PROGRESSIVE CORRECTIVE]\n`
    output += logicLessons
      .map((l) => {
        const impact = l.impactRatio || 0
        let prefix = '[CONSIGNE]'
        if (impact > 30) prefix = '[RÈGLE DE FER]'
        else if (impact > 15) prefix = '[DIRECTIVE]'
        else prefix = '[SUGGESTION]'

        return `- ${prefix} ${l.directive}`
      })
      .join('\n')

    if (styleLessons.length > 0) {
      output += `\n\n[ADN STYLISTIQUE & VOCABULAIRE]\n`
      output += styleLessons.map((l) => `- ${l.directive}`).join('\n')
    }

    return output.trim()
  }

  /**
   * Récupère spécifiquement les éléments d'ADN stylistique pour un agent.
   */
  getStylisticDNA(
    agentName: string,
    mode: 'stable' | 'all' = 'all',
    context?: any
  ): { vocabulary: string[]; forbidden: string[] } {
    const lessons = this.getLessonsFor(agentName, [], mode, undefined, context)
    const vocabulary: string[] = []
    const forbidden: string[] = []

    lessons.forEach((l) => {
      if (l.tags?.includes('style:vocabulary')) {
        // On essaie d'extraire les mots si le format est respecté
        const match = l.directive.match(/vocabulaire sensoriel : (.*)/)
        if (match?.[1]) {
          vocabulary.push(...match[1].split(',').map((s) => s.trim()))
        } else {
          vocabulary.push(l.directive)
        }
      }
      if (l.tags?.includes('style:forbidden')) {
        const match = l.directive.match(/clichés ou mots génériques : (.*)/)
        if (match?.[1]) {
          forbidden.push(...match[1].split(',').map((s) => s.trim()))
        } else {
          forbidden.push(l.directive)
        }
      }
    })

    return {
      vocabulary: [...new Set(vocabulary)],
      forbidden: [...new Set(forbidden)]
    }
  }
}
