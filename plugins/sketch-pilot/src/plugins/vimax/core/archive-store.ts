import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { LearningEpisode } from '../types'

/**
 * ArchiveStore
 * Mémoire Épisodique Long-Terme.
 * Conserve les épisodes de "Référence DNA" (> 90/100) pour l'éternité.
 */
export class ArchiveStore {
  private static instance: ArchiveStore
  private archivePath: string
  private cache: LearningEpisode[] = []

  private constructor() {
    const root = process.cwd()
    const dataDir = path.join(root, 'plugins', 'sketch-pilot', 'src', 'plugins', 'vimax', 'data')
    this.archivePath = path.join(dataDir, 'vimax-archive.json')
  }

  public static getInstance(): ArchiveStore {
    if (!ArchiveStore.instance) {
      ArchiveStore.instance = new ArchiveStore()
    }
    return ArchiveStore.instance
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.archivePath, 'utf8')
      this.cache = JSON.parse(raw)
    } catch {
      this.cache = []
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.archivePath), { recursive: true })
    await fs.writeFile(this.archivePath, JSON.stringify(this.cache, null, 2), 'utf8')
  }

  /**
   * Ajoute un épisode à l'archive s'il est exceptionnel.
   */
  async archiveIfExceptional(episode: LearningEpisode): Promise<boolean> {
    const score = episode.evaluation?.score || 0
    if (score >= 90) {
      // Éviter les doublons
      if (this.cache.some((e) => e.id === episode.id)) return false

      console.log(`[ArchiveStore] 🏆 Moment de grâce archivé : ${episode.id} (Score: ${score})`)
      this.cache.push({
        ...episode,
        // On compresse pour économiser l'espace
        systemPrompt: `${episode.systemPrompt.slice(0, 500)}...`,
        userPrompt: `${episode.userPrompt.slice(0, 500)}...`
      })

      // Limite de sécurité pour l'archive en JSON simple (ex: 500 épisodes)
      if (this.cache.length > 500) {
        this.cache.shift()
      }

      await this.save()
      return true
    }
    return false
  }

  getArchivedEpisodes(): LearningEpisode[] {
    return [...this.cache]
  }

  getEpisodesForAgent(agentName: string): LearningEpisode[] {
    return this.cache.filter((e) => e.agentName === agentName)
  }
}
