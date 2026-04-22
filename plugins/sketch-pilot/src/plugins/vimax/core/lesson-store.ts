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
      } catch {
        this.data = { version: '1.0.0', lessons: [], globalDirectives: [] }
      }

      // Load HIPPOCAMPUS (Learning Buffer)
      try {
        const rawL = await fs.readFile(this.learningPath, 'utf8')
        this.learningData = JSON.parse(rawL)
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
      const snapshots = files
        .filter((f) => f.startsWith('vimax-brain.'))
        .sort()
        .reverse()

      if (snapshots.length === 0) return false

      const lastSnapshot = path.join(backupDir, snapshots[0])
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
   * @param mode 'stable' (Cortex uniquement) ou 'all' (Cortex + Hippocampe)
   */
  getLessonsFor(agentName: string, tags: string[] = [], mode: 'stable' | 'all' = 'all'): Lesson[] {
    const legacyName = LessonStore.LEGACY_MAPPING[agentName]
    const prodLessons = (this.data.lessons || []).filter(
      (l) => l.agentName === agentName || l.agentName === 'Global' || (legacyName && l.agentName === legacyName)
    )

    let lessons = [...prodLessons]

    if (mode === 'all') {
      const learningLessons = (this.learningData.lessons || []).filter(
        (l) => l.agentName === agentName || l.agentName === 'Global' || (legacyName && l.agentName === legacyName)
      )
      lessons = [...lessons, ...learningLessons]
    }

    if (tags.length > 0) {
      const taggedLessons = lessons.filter((l) => l.tags?.some((t) => tags.includes(t)))
      if (taggedLessons.length > 0) return taggedLessons
    }

    return lessons
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
    if (mode === 'stable') return [...this.data.lessons]
    return [...this.data.lessons, ...this.learningData.lessons]
  }

  /**
   * Récupère les leçons du Cortex uniquement (Stable)
   */
  getStableLessons(): Lesson[] {
    return [...this.data.lessons]
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
    const existingIndex = this.learningData.lessons.findIndex((l) => {
      if (l.id === lesson.id) return true
      return (
        l.agentName === lesson.agentName && l.directive.toLowerCase().trim() === lesson.directive.toLowerCase().trim()
      )
    })

    if (existingIndex >= 0) {
      const existing = this.learningData.lessons[existingIndex]
      this.learningData.lessons[existingIndex] = {
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
   */
  async recordSuccess(lessonIds: string[]): Promise<void> {
    if (!lessonIds || lessonIds.length === 0) return
    let changed = false

    const all = [...this.data.lessons, ...this.learningData.lessons]
    all.forEach((l) => {
      if (lessonIds.includes(l.id)) {
        l.successCount = (l.successCount || 0) + 1
        l.lastUpdated = Date.now()
        changed = true
      }
    })

    if (changed) await this.save()
  }

  /**
   * Enregistre un échec pour une liste de leçons.
   */
  async recordFailure(lessonIds: string[]): Promise<void> {
    if (!lessonIds || lessonIds.length === 0) return
    let changed = false

    const all = [...this.data.lessons, ...this.learningData.lessons]
    all.forEach((l) => {
      if (lessonIds.includes(l.id)) {
        l.failCount = (l.failCount || 0) + 1
        l.lastUpdated = Date.now()
        changed = true
      }
    })

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
  formatDirectives(agentName: string, tags: string[] = [], mode: 'stable' | 'all' = 'all'): string {
    const lessons = this.getLessonsFor(agentName, tags, mode)
    if (lessons.length === 0) return ''

    return `
[LEÇONS APPRISES & RÈGLES DE RIGUEUR]
Les exécutions précédentes ont révélé des points d'amélioration. Respecte ABSOLUMENT ces nouvelles directives :
${lessons.map((l) => `- [${(l.category || 'general').toUpperCase()}] ${l.directive}`).join('\n')}
`.trim()
  }
}
