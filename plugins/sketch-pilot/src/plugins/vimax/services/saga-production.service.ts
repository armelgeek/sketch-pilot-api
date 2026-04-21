import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { VimaxLLMAdapter } from '../core/vimax-llm-adapter'
import { VimaxAgent } from '../pipeline/vimax.agent'
import { SeriesContinuityPlugin } from '../plugins/series-continuity.plugin'
import { SeriesNarrativePlugin } from '../plugins/series-narrative.plugin'
import { VimaxSchemaMapper } from '../utils/vimax-schema-mapper'
import type { SeriesRepository } from '../../../../../../src/infrastructure/repositories/series.repository'
import type { LLMService } from '../../../services/llm'
import type { VimaxEpisode, VimaxRunOptions, VimaxSeries } from '../types'

/**
 * SagaProductionService
 * Point d'entrée central pour la production de séries cinématiques avec Vimax.
 * Orchestre les agents, gère la persistance et assure la continuité.
 */
export class SagaProductionService {
  private agent: VimaxAgent

  constructor(
    llmService: LLMService,
    private readonly seriesRepo: SeriesRepository
  ) {
    const adapter = new VimaxLLMAdapter(llmService)
    this.agent = new VimaxAgent(adapter)

    // 1. Enregistrement des plugins standards pour la production de séries
    this.agent.registry.register(new SeriesNarrativePlugin())
    this.agent.registry.register(new SeriesContinuityPlugin())

    // 2. Plugin de Synchronisation Temps-Réel avec la Base de Données
    this.agent.registry.register({
      id: 'database-sync',
      onAfterPlanSaga: async (agent, plan) => {
        console.info(`[SagaProductionService] 💾 Synchronisation du plan de saga ${plan.seriesId}...`)

        const dbData = VimaxSchemaMapper.mapPlanToDb(plan.plan)
        const title = (plan.plan.intent as any)?.title || 'Saga sans titre'
        const userId = plan.options?.userId

        await this.seriesRepo.create({
          id: plan.seriesId,
          userId,
          title,
          ...dbData
        })
      },

      onAfterEpisode: async (agent, episode) => {
        console.info(`[SagaProductionService] 💾 Synchronisation de l'épisode ${episode.id}...`)
        // Persistence de l'épisode et mise à jour de la continuité
        await this.syncEpisodeToDatabase(episode)
      }
    })
  }

  /**
   * Synchronise les données d'un épisode généré vers les tables relationnelles.
   */
  private async syncEpisodeToDatabase(episode: VimaxEpisode) {
    const seriesId = this.agent.planner.getSeriesId()
    if (!seriesId) return

    await Promise.all([
      // Mise à jour des registres (Personnages, Lieux)
      this.seriesRepo.updateCharacterRegistry(seriesId, episode.characterProfiles),
      // On pourrait aussi extraire les lieux des scènes ici
      this.seriesRepo.appendEpisodeSummary(seriesId, episode.narration)
    ])
  }

  /**
   * Crée une nouvelle saga à partir d'une idée de base.
   * Retourne l'identifiant de la série créée.
   */
  async createSaga(userId: string, idea: string, options: VimaxRunOptions = {}): Promise<string> {
    console.info(`[SagaProductionService] 🆕 Création d'une nouvelle saga par ${userId}: "${idea}"`)
    const seriesId = await this.agent.planSaga(idea, { ...options, userId })
    return seriesId
  }

  /**
   * Génère un épisode complet pour une saga existante.
   */
  async generateEpisode(userId: string, seriesId: string, episodeNumber: number): Promise<VimaxEpisode> {
    console.info(
      `[SagaProductionService] 🎞️ Génération de l'épisode ${episodeNumber} pour la saga ${seriesId} par ${userId}`
    )
    return await this.agent.runSingleEpisode(seriesId, episodeNumber)
  }

  /**
   * Lance la génération complète d'une saga (Planning + Tous les épisodes).
   */
  async produceFullSaga(userId: string, idea: string, options: VimaxRunOptions = {}): Promise<VimaxSeries> {
    console.info(`[SagaProductionService] 🚀 Production complète de la saga par ${userId} : "${idea}"`)
    return await this.agent.runSaga(idea, { ...options, userId })
  }

  /**
   * Charge le plan d'une saga depuis le système de fichiers.
   */
  async loadSagaPlan(seriesId: string): Promise<any> {
    const planPath = path.join(process.cwd(), 'vimax-logs', 'sagas', seriesId, 'plan.json')
    try {
      const content = await fs.readFile(planPath, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      console.error(`[SagaProductionService] Impossible de charger le plan pour ${seriesId}:`, error)
      throw new Error(`Plan introuvable pour la saga ${seriesId}`)
    }
  }

  /**
   * Applique un feedback correctif à un élément de la saga.
   */
  async applyFeedback(type: string, originalData: any, feedback: any): Promise<any> {
    console.info(`[SagaProductionService] 🛠️ Application d'un feedback sur ${type}`)
    return await this.agent.refineItemFromFeedback(type, originalData, feedback)
  }

  /**
   * Accès direct à l'agent sous-jacent pour des opérations avancées.
   */
  getAgent(): VimaxAgent {
    return this.agent
  }
}
