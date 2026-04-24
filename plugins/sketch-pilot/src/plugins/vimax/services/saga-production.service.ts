import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { VimaxLLMAdapter } from '../core/vimax-llm-adapter'
import { VimaxAgent } from '../pipeline/vimax.agent'
import { SeriesContinuityPlugin } from '../plugins/series-continuity.plugin'
import { SeriesNarrativePlugin } from '../plugins/series-narrative.plugin'
import { VimaxSchemaMapper } from '../utils/vimax-schema-mapper'
import type { SeriesRepository } from '../../../../../../src/infrastructure/repositories/series.repository'
import type { VideoRepository } from '../../../../../../src/infrastructure/repositories/video.repository'
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
    private readonly seriesRepo: SeriesRepository,
    private readonly videoRepo: VideoRepository
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
        const title = plan.plan.title || (plan.plan.intent as any)?.title || 'Saga sans titre'
        const userId = plan.options?.userId

        await this.seriesRepo.create({
          id: plan.seriesId,
          userId,
          title,
          visualStyleLock: agent.planner.getStyleLock() || undefined,
          ...dbData
        })
      },

      onAfterEpisode: async (agent, episode, plan) => {
        console.info(`[SagaProductionService] 💾 Synchronisation de l'épisode ${episode.id}...`)
        const userId = plan?.options?.userId || (this.agent.planner as any).userId
        // Persistence de l'épisode et mise à jour de la continuité
        await Promise.all([this.syncEpisodeToDatabase(userId, episode, plan), this.saveEpisodeToLogs(episode)])
      }
    })
  }

  /**
   * Synchronise les données d'un épisode généré vers les tables relationnelles.
   */
  private async syncEpisodeToDatabase(userId: string, episode: VimaxEpisode, plan?: any) {
    const seriesId = this.agent.planner.getSeriesId()
    if (!seriesId) return

    // 1. Création de l'entrée "Vidéo" (v8.0 Sequencer Metadata)
    const videoId = episode.id // On utilise l'ID généré par Vimax

    // 2. Mapping vers le format VideoScript (NanoBanana / Legacy Compatibility)
    const script = {
      titles: [episode.summary.slice(0, 50)],
      topic: episode.summary,
      fullNarration: episode.narration,
      totalDuration: episode.scenes.reduce((acc, s) => acc + (s.duration || 5), 0),
      sceneCount: episode.scenes.length,
      scenes: episode.scenes.map((s, idx) => ({
        id: s.id,
        sceneNumber: idx + 1,
        narration: s.narration,
        imagePrompt: s.imagePrompt,
        locationId: s.locationId,
        charactersInScene: s.charactersInScene || []
      })),
      seriesMetadata: {
        episodeSummary: episode.summary,
        characterContinuity: VimaxSchemaMapper.toRecord(episode.characterProfiles)
      }
    }

    await this.videoRepo.create({
      id: videoId,
      userId,
      seriesId,
      episodeNumber: episode.episodeNumber,
      topic: episode.summary,
      title: `Épisode ${episode.episodeNumber} : ${episode.summary.slice(0, 50)}`,
      status: 'draft',
      progress: 100,
      script, // Sauvegarde pour compatibilité avec GenerateScenesUseCase
      globalContext: plan?.plan?.script || plan?.script || '',
      previousEpisodesContext: '',
      characterRegistry: VimaxSchemaMapper.toRecord(episode.characterProfiles),
      narrationLayer: {
        narration: episode.narration,
        summary: episode.summary
      }
    })

    // 3. Synchronisation des Scènes (Relational Layer)
    const scenes = (episode.scenes || []).map((s, idx) => ({
      ...s,
      videoId,
      sceneNumber: idx + 1,
      timeRange: { start: s.startTime, end: s.startTime + s.duration },
      duration: s.duration,
      narration: s.narration,
      imagePrompt: s.imagePrompt,
      locationId: s.locationId
    }))

    await Promise.all([
      this.videoRepo.saveScenes(videoId, scenes),
      this.seriesRepo.updateCharacterRegistry(seriesId, episode.characterProfiles),
      this.seriesRepo.appendEpisodeSummary(seriesId, episode.narration)
    ])
  }

  /**
   * Sauvegarde un épisode dans le système de fichiers (Logs).
   */
  private async saveEpisodeToLogs(episode: VimaxEpisode) {
    const seriesId = this.agent.planner.getSeriesId()
    if (!seriesId) return

    const sagaDir = await this.ensureSagaDirectory(seriesId)
    const filePath = path.join(sagaDir, 'episodes', `episode-${episode.episodeNumber}.json`)
    await fs.writeFile(filePath, JSON.stringify(episode, null, 2), 'utf8')
    console.info(`[SagaProductionService] 💾 Épisode ${episode.episodeNumber} sauvegardé localement: ${filePath}`)
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

    // HYDRATATION DE L'AGENT DEPUIS LA DB (Fix: Plan non trouvé sur disque)
    const context = await this.seriesRepo.getSeriesContext(seriesId)
    if (!context) {
      throw new Error(`Série ${seriesId} introuvable en base de données.`)
    }

    const planData = VimaxSchemaMapper.mapDbToSagaPlan(context)
    const episodeEvents = VimaxSchemaMapper.mapDbToEpisodeEvents(context)

    const fullSagaPlan = {
      seriesId,
      options: {
        seriesId,
        userId,
        brainMode: 'all', // Défaut par sécurité
        seriesContext: context
      },
      plan: planData,
      episodeEvents
    }

    const result = await this.agent.runSingleEpisode(seriesId, episodeNumber, fullSagaPlan)

    // [V48] Persistence Hook: Sync episode results back to the database for inter-episode continuity
    console.info(`[SagaProductionService] 🔄 Sauvegarde de la continuité pour l'épisode ${episodeNumber}...`)
    const updates = VimaxSchemaMapper.mapEpisodeToContextUpdate(result, context)
    await this.seriesRepo.update(seriesId, updates)

    // Update summary history for narrative context window
    const summaryHeader = `Episode ${episodeNumber}: ${result.summary}`
    await this.seriesRepo.appendEpisodeSummary(seriesId, summaryHeader)

    return result
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
   * Assure que la structure de dossiers pour une saga existe.
   */
  public async ensureSagaDirectory(seriesId: string): Promise<string> {
    const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', seriesId)
    await fs.mkdir(path.join(sagaDir, 'episodes'), { recursive: true })
    await fs.mkdir(path.join(sagaDir, 'brain-data'), { recursive: true })
    await fs.mkdir(path.join(sagaDir, 'audits'), { recursive: true })
    await fs.mkdir(path.join(sagaDir, 'prompts'), { recursive: true })
    await fs.mkdir(path.join(sagaDir, 'intermediate'), { recursive: true })
    return sagaDir
  }

  /**
   * Reconstruit les logs locaux à partir des données de la base de données.
   */
  public async syncLogsFromDatabase(seriesId: string): Promise<void> {
    console.info(`[SagaProductionService] 🔄 Synchronisation des logs depuis la base de données pour ${seriesId}...`)
    const context = await this.seriesRepo.getSeriesContext(seriesId)
    if (!context) throw new Error(`Saga ${seriesId} non trouvée en DB.`)

    const sagaDir = await this.ensureSagaDirectory(seriesId)
    const planData = VimaxSchemaMapper.mapDbToSagaPlan(context)
    const episodeEvents = VimaxSchemaMapper.mapDbToEpisodeEvents(context)

    const fullSagaPlan = {
      seriesId,
      title: context.title,
      basicIdea: context.title, // Approximation
      options: { seriesId, userId: (context as any).userId, seriesContext: context },
      plan: planData,
      episodeEvents
    }

    await fs.writeFile(path.join(sagaDir, 'plan.json'), JSON.stringify(fullSagaPlan, null, 2), 'utf8')
    console.info(`✅ plan.json restauré pour ${seriesId}`)

    // Restauration des épisodes depuis VideoRepo
    const episodes = await this.videoRepo.findBySeriesId(seriesId)
    for (const ep of episodes) {
      const fullVideo = await this.videoRepo.findById(ep.id)
      if (fullVideo) {
        // Reconstruction manuelle du format VimaxEpisode (approximation)
        const vimaxEp: Partial<VimaxEpisode | any> = {
          id: ep.id,
          seriesId,
          episodeNumber: ep.episodeNumber,
          summary: ep.topic,
          narration: fullVideo.narrationLayer?.narration || ep.topic,
          scenes: (fullVideo.scenes || []).map((s: any) => ({
            id: s.id,
            sceneNumber: s.sceneNumber,
            narration: s.narration,
            imagePrompt: s.imagePrompt,
            locationId: s.locationId,
            duration: s.duration
          })),
          characterProfiles: Object.entries(fullVideo.characterRegistry || {}).map(([id, p]: [string, any]) => ({
            identifier: id,
            ...p
          }))
        }
        await fs.writeFile(
          path.join(sagaDir, 'episodes', `episode-${ep.episodeNumber}.json`),
          JSON.stringify(vimaxEp, null, 2),
          'utf8'
        )
      }
    }
    console.info(`✅ ${episodes.length} épisodes restaurés pour ${seriesId}`)
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
