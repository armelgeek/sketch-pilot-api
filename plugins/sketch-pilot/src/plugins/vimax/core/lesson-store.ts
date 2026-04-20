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
    this.storePath = path.join(process.cwd(), 'src', 'plugins', 'vimax', 'data', 'learned-lessons.json')
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
   * Récupère les leçons pertinentes pour un agent spécifique.
   */
  getLessonsFor(agentName: string): Lesson[] {
    return this.data.lessons.filter((l) => l.agentName === agentName || l.agentName === 'Global')
  }

  /**
   * Récupère les leçons globales qui matchent certains tags.
   */
  getGlobalLessonsByTags(tags: string[]): Lesson[] {
    if (tags.length === 0) return []
    return this.data.lessons.filter((l) => l.agentName === 'Global' && l.tags?.some((tag) => tags.includes(tag)))
  }

  /**
   * Ajoute ou met à jour une leçon.
   */
  async addLesson(lesson: Lesson): Promise<void> {
    const existingIndex = this.data.lessons.findIndex((l) => l.id === lesson.id)
    if (existingIndex >= 0) {
      this.data.lessons[existingIndex] = { ...this.data.lessons[existingIndex], ...lesson }
    } else {
      this.data.lessons.push(lesson)
    }
    await this.save()
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
  formatDirectives(agentName: string): string {
    const lessons = this.getLessonsFor(agentName)
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
