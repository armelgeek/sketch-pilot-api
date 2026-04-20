import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { LessonStore as ILessonStore, Lesson } from '../types'

/**
 * LessonStore
 * Gère la persistence et le versionnage des leçons apprises par les agents.
 */
export class LessonStore {
  private static instance: LessonStore
  private storePath: string
  private data: ILessonStore = { lessons: [], globalDirectives: [] }

  private constructor() {
    // Résolution de chemin robuste compatible ESM/TSX
    const root = process.cwd()
    const pluginPath = path.join(
      root,
      'plugins',
      'sketch-pilot',
      'src',
      'plugins',
      'vimax',
      'data',
      'learned-lessons.json'
    )
    const localPath = path.join(root, 'src', 'plugins', 'vimax', 'data', 'learned-lessons.json')

    // On privilégie le chemin complet si on est à la racine du repo, sinon on utilise le chemin local
    this.storePath = pluginPath
  }

  public static getInstance(): LessonStore {
    if (!LessonStore.instance) {
      LessonStore.instance = new LessonStore()
    }
    return LessonStore.instance
  }

  /**
   * Charge les leçons depuis le disque.
   */
  async load(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.storePath), { recursive: true })
      const raw = await fs.readFile(this.storePath, 'utf8')
      this.data = JSON.parse(raw)
    } catch {
      this.data = { lessons: [], globalDirectives: [] }
    }
  }

  /**
   * Sauvegarde les leçons sur le disque.
   */
  async save(): Promise<void> {
    await fs.writeFile(this.storePath, JSON.stringify(this.data, null, 2), 'utf8')
  }

  /**
   * Récupère les leçons pertinentes pour un agent spécifique avec filtrage optionnel par tags.
   */
  getLessonsFor(agentName: string, tags: string[] = []): Lesson[] {
    const lessons = this.data.lessons.filter((l) => l.agentName === agentName || l.agentName === 'Global')

    if (tags.length > 0) {
      // On privilégie les leçons qui correspondent aux tags (Smart Semantic Retrieval)
      const taggedLessons = lessons.filter((l) => l.tags?.some((t) => tags.includes(t)))
      // Si on a des leçons tagguées, on les renvoie, sinon on renvoie tout ce qui concerne l'agent
      // (On pourrait aussi faire un merge avec une priorité)
      if (taggedLessons.length > 0) return taggedLessons
    }

    return lessons
  }

  /**
   * Récupère les leçons globales qui matchent certains tags.
   */
  getGlobalLessonsByTags(tags: string[]): Lesson[] {
    if (tags.length === 0) return []
    return this.data.lessons.filter((l) => l.agentName === 'Global' && l.tags?.some((tag) => tags.includes(tag)))
  }

  /**
   * Ajoute ou met à jour une leçon avec déduplication sémantique.
   */
  async addLesson(lesson: Lesson): Promise<void> {
    const existingIndex = this.data.lessons.findIndex((l) => {
      // Match par ID (Feedback humain ou update direct)
      if (l.id === lesson.id) return true
      // Match par Directive (Déduplication sémantique simple)
      return (
        l.agentName === lesson.agentName && l.directive.toLowerCase().trim() === lesson.directive.toLowerCase().trim()
      )
    })

    if (existingIndex >= 0) {
      // Merge intelligence : On augmente les compteurs et on garde la confiance la plus haute
      const existing = this.data.lessons[existingIndex]
      this.data.lessons[existingIndex] = {
        ...existing,
        ...lesson,
        successCount: existing.successCount + (lesson.successCount || 0),
        failCount: existing.failCount + (lesson.failCount || 0),
        confidence: Math.max(existing.confidence, lesson.confidence),
        lastUpdated: Date.now()
      }
    } else {
      this.data.lessons.push(lesson)
    }
    await this.save()
  }

  /**
   * Enregistre un succès pour une liste de leçons (Renforcement Darwiniste).
   */
  async recordSuccess(lessonIds: string[]): Promise<void> {
    if (!lessonIds || lessonIds.length === 0) return
    let changed = false
    this.data.lessons.forEach((l) => {
      if (lessonIds.includes(l.id)) {
        l.successCount++
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
    this.data.lessons.forEach((l) => {
      if (lessonIds.includes(l.id)) {
        l.failCount++
        l.lastUpdated = Date.now()
        changed = true
      }
    })
    if (changed) await this.save()
  }

  /**
   * Récupère une leçon par son ID.
   */
  getLessonById(id: string): Lesson | undefined {
    return this.data.lessons.find((l) => l.id === id)
  }

  /**
   * Récupère toutes les leçons.
   */
  getAllLessons(): Lesson[] {
    return [...this.data.lessons]
  }

  /**
   * Supprime une leçon.
   */
  async deleteLesson(id: string): Promise<void> {
    this.data.lessons = this.data.lessons.filter((l) => l.id !== id)
    await this.save()
  }

  /**
   * Formate les leçons en directives pour un prompt système.
   */
  formatDirectives(agentName: string, tags: string[] = []): string {
    const lessons = this.getLessonsFor(agentName, tags)
    return this.formatDirectivesFrom(lessons)
  }

  /**
   * Formate une liste arbitraire de leçons.
   */
  formatDirectivesFrom(lessons: Lesson[]): string {
    if (lessons.length === 0) return ''

    return `
[LEÇONS APPRISES & RÈGLES DE RIGUEUR]
Les exécutions précédentes ont révélé des points d'amélioration. Respecte ABSOLUMENT ces nouvelles directives :
${lessons.map((l) => `- [${l.category.toUpperCase()}] ${l.directive}`).join('\n')}
`.trim()
  }
}
