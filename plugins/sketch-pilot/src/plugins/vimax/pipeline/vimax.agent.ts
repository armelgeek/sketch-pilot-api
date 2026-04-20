import fs from 'node:fs/promises'
import path from 'node:path'
import { VimaxAnimationAgent } from '../agents/vimax-animation.agent'
import { VimaxCharacterExtractor } from '../agents/vimax-character-extractor.agent'
import { VimaxContinuityAuditor } from '../agents/vimax-continuity-auditor.agent'
import { VimaxDialogueAgent } from '../agents/vimax-dialogue.agent'
import { VimaxEventExtractor } from '../agents/vimax-event-extractor.agent'
import { VimaxInputSanitizerAgent } from '../agents/vimax-input-sanitizer.agent'
import { VimaxNarrationAgent } from '../agents/vimax-narration.agent'
import { VimaxOutputFormatterAgent } from '../agents/vimax-output-formatter.agent'
import { VimaxSagaCompressor } from '../agents/vimax-saga-compressor.agent'
import { VimaxSagaPlanner } from '../agents/vimax-saga-planner.agent'
import { VimaxSagaSentinel } from '../agents/vimax-saga-sentinel.agent'
import { VimaxScreenwriter } from '../agents/vimax-screenwriter.agent'
import { VimaxScriptEnhancer } from '../agents/vimax-script-enhancer.agent'
import { VimaxBrain } from '../core/vimax-brain'
import { VimaxContinuityEngine } from '../core/vimax-continuity.engine'
import type { LLMService } from '../core/llm.interface'
import type {
  CharacterProfile,
  ReviewGate,
  SceneMemory,
  SeriesContext,
  VimaxEpisode,
  VimaxEvent,
  VimaxRunOptions,
  VimaxScene,
  VimaxSeries,
  VisualAnchorState
} from '../types'

// ─────────────────────────────────────────────
// VimaxAgent
// Chef d'orchestre du pipeline Vimax.
// Gère l'enchaînement des passes et la persistence des logs.
// ─────────────────────────────────────────────

export class VimaxAgent {
  private planner: VimaxSagaPlanner
  private narration: VimaxNarrationAgent
  private screenwriter: VimaxScreenwriter
  private eventExtractor: VimaxEventExtractor
  private compressor: VimaxSagaCompressor
  private sagaSentinel: VimaxSagaSentinel
  private enhancer: VimaxScriptEnhancer
  private characterExtractor: VimaxCharacterExtractor
  private dialogue: VimaxDialogueAgent
  private animation: VimaxAnimationAgent
  private auditor: VimaxContinuityAuditor
  private inputSanitizer: VimaxInputSanitizerAgent
  private outputFormatter: VimaxOutputFormatterAgent
  private brain: VimaxBrain

  private metrics = {
    totalCalls: 0,
    totalTokens: 0,
    retries: 0,
    startTime: Date.now()
  }

  constructor(llm: LLMService) {
    this.planner = new VimaxSagaPlanner(llm)
    this.narration = new VimaxNarrationAgent(llm)
    this.screenwriter = new VimaxScreenwriter(llm)
    this.eventExtractor = new VimaxEventExtractor(llm)
    this.compressor = new VimaxSagaCompressor(llm)
    this.sagaSentinel = new VimaxSagaSentinel(llm)
    this.enhancer = new VimaxScriptEnhancer(llm)
    this.characterExtractor = new VimaxCharacterExtractor(llm)
    this.dialogue = new VimaxDialogueAgent(llm)
    this.animation = new VimaxAnimationAgent(llm)
    this.auditor = new VimaxContinuityAuditor(llm)
    this.inputSanitizer = new VimaxInputSanitizerAgent(llm)
    this.outputFormatter = new VimaxOutputFormatterAgent(llm)
    this.brain = new VimaxBrain(llm)
  }

  public getBrain(): VimaxBrain {
    return this.brain
  }

  /**
   * Planification uniquement : Génère le script global et le découpage en épisodes.
   */
  async planSaga(basicIdea: string, options: VimaxRunOptions = {}): Promise<string> {
    const seriesId = options.seriesId || `series-${Date.now()}`
    this.getAllAgents().forEach((a) => a.setSeriesId(seriesId))

    const analysis = await this.inputSanitizer.analyze(basicIdea)
    if (!analysis.isViable) {
      throw new Error(`Idée non viable : ${analysis.issues.join(', ')}`)
    }

    const plan = await this.planner.planSaga(analysis.enrichedIdea, options)
    let episodeEvents = await this.eventExtractor.extractEvents(
      plan.script,
      'series',
      options.targetDuration,
      options.maxScenes,
      options.targetEpisodeCount
    )

    // Audit structurel 3.0
    const planAudit = await this.sagaSentinel.auditEventPlan(
      episodeEvents,
      typeof options.seriesContext?.seriesBible === 'string'
        ? options.seriesContext.seriesBible
        : JSON.stringify(options.seriesContext?.seriesBible)
    )

    if (!planAudit.isConsistent) {
      const correctionHint = `RESTRUCTURE LE PLAN DE SAGA EN RÉSOLVANT CES INCOHÉRENCES :\n${planAudit.violations.map((v) => `- ${v}`).join('\n')}`
      episodeEvents = await this.eventExtractor.extractEvents(
        plan.script,
        'series',
        options.targetDuration,
        options.maxScenes,
        options.targetEpisodeCount,
        correctionHint
      )
    }

    const sagaPlan = {
      seriesId,
      basicIdea,
      options,
      plan,
      episodeEvents
    }
    const sagaDir = path.join('vimax-logs', 'sagas', seriesId)
    await fs.mkdir(sagaDir, { recursive: true })
    await fs.writeFile(path.join(sagaDir, 'plan.json'), JSON.stringify(sagaPlan, null, 2), 'utf8')

    return seriesId
  }

  /**
   * Génération d'un épisode unique à partir d'un plan existant.
   */
  async runSingleEpisode(seriesId: string, episodeIndex: number): Promise<VimaxEpisode> {
    const sagaDir = path.join('vimax-logs', 'sagas', seriesId)
    const planPath = path.join(sagaDir, 'plan.json')

    if (!(await fs.stat(planPath).catch(() => null))) {
      throw new Error(`Plan non trouvé pour la saga ${seriesId}`)
    }

    const sagaPlan = JSON.parse(await fs.readFile(planPath, 'utf8'))
    const event = sagaPlan.episodeEvents[episodeIndex - 1]

    if (!event) {
      throw new Error(`Épisode ${episodeIndex} non trouvé dans le plan de la saga ${seriesId}`)
    }

    this.getAllAgents().forEach((a) => a.setSeriesId(seriesId))

    const seriesContext: SeriesContext = {
      ...sagaPlan.options.seriesContext,
      intent: sagaPlan.plan.intent,
      previousEpisodes: []
    }

    const episodeFiles = await fs.readdir(sagaDir).catch(() => [])
    const filteredFiles = episodeFiles
      .filter((f) => f.startsWith('episode-') && f.endsWith('.json'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0')
        const numB = parseInt(b.match(/\d+/)?.[0] || '0')
        return numA - numB
      })

    for (const file of filteredFiles) {
      const epData = JSON.parse(await fs.readFile(path.join(sagaDir, file), 'utf8'))
      seriesContext.previousEpisodes?.push({ narration: epData.narration, summary: epData.summary })
    }

    const episode = await this.runEpisode(event, episodeIndex - 1, seriesContext, sagaPlan.options)

    await fs.writeFile(path.join(sagaDir, `episode-${episodeIndex}.json`), JSON.stringify(episode, null, 2), 'utf8')

    return episode
  }

  /**
   * Pipeline Complet : De l'idée à la série d'épisodes développés.
   */
  async runSaga(basicIdea: string, options: VimaxRunOptions = {}): Promise<VimaxSeries> {
    const seriesId = await this.planSaga(basicIdea, options)
    const sagaDir = path.join('vimax-logs', 'sagas', seriesId)
    const sagaPlan = JSON.parse(await fs.readFile(path.join(sagaDir, 'plan.json'), 'utf8'))

    const episodes: VimaxEpisode[] = []
    for (let i = 1; i <= sagaPlan.episodeEvents.length; i++) {
      console.log(`[VimaxAgent] Génération de l'épisode ${i}/${sagaPlan.episodeEvents.length}...`)
      episodes.push(await this.runSingleEpisode(seriesId, i))
    }

    return {
      id: seriesId,
      title: sagaPlan.plan.intent.title || 'Saga sans titre',
      context: sagaPlan.options.seriesContext,
      episodes
    }
  }

  // ─── Private Methods ────────────────────────────

  private async runEpisode(
    event: VimaxEvent,
    index: number,
    context: SeriesContext,
    options: VimaxRunOptions
  ): Promise<VimaxEpisode> {
    const prefix = `episode-${index + 1}`

    // 1. Narration complète
    let fullNarration = await this.narration.generateEpisodeNarration(event, context)
    await this.saveIntermediate(`${prefix}-pass1-narration`, fullNarration)
    await this.savePromptSnapshot(this.narration, `${prefix}-pass1-narration`)

    // Audit de continuité 3.0
    if (context.previousEpisodes && context.previousEpisodes.length > 0) {
      const history = context.previousEpisodes.map((e, idx) => `[ÉPISODE ${idx + 1}] ${e.narration || e.summary}`)
      const sagaAudit = await this.sagaSentinel.auditSagaContinuity(
        { narration: fullNarration, screenplay: {} },
        history,
        typeof context.seriesBible === 'string' ? context.seriesBible : JSON.stringify(context.seriesBible)
      )

      if (!sagaAudit.isConsistent) {
        const correctionHint = `CORRECTION DE CONTINUITÉ REQUISE :\n${sagaAudit.violations.map((v) => `- ${v}`).join('\n')}\n\nREFAIS LA NARRATION.`
        fullNarration = await this.narration.generateEpisodeNarration(
          event,
          context,
          options.targetDuration,
          options.maxScenes,
          correctionHint
        )
        await this.saveIntermediate(`${prefix}-pass1-narration-corrected`, fullNarration)
      }
    }

    const enhancedScript = await this.enhancer.enhance(fullNarration)
    const profiles = await this.characterExtractor.extractCharacters(enhancedScript)
    const sceneEvents = await this.eventExtractor.extractEvents(
      enhancedScript,
      'episode',
      options.targetDuration,
      options.maxScenes
    )

    const continuity = new VimaxContinuityEngine()
    if (context.lastEpisodeBridge) continuity.setBridge(context.lastEpisodeBridge)

    const charContext = this.characterExtractor.formatForPrompt(profiles)
    const scenes = await this.buildScenes(
      sceneEvents,
      context,
      charContext,
      profiles,
      continuity,
      options.targetDuration,
      options.maxScenes
    )

    // Bridge pour l'épisode suivant
    const lastNarration = scenes.at(-1).narration
    const bridge = await this.compressor.extractEpisodeBridge(lastNarration)

    return {
      id: `${this.planner.getSeriesId()}-ep${index + 1}`,
      episodeNumber: index + 1,
      summary: fullNarration.slice(0, 200),
      narration: fullNarration,
      scenes,
      characterProfiles: profiles,
      eventIndex: index,
      eventDescription: event.description,
      screenplay: {
        title: `${prefix} - Script`,
        scenes,
        tensionCurve: scenes.map((s) => s.tensionState.level)
      }
    }
  }

  private async buildScenes(
    sceneEvents: VimaxEvent[],
    context: SeriesContext,
    characterContext: string,
    profiles: CharacterProfile[],
    continuity: VimaxContinuityEngine,
    targetDuration?: number,
    maxScenes?: number
  ): Promise<VimaxScene[]> {
    const intermediateScenes: any[] = []
    const sceneMemories: SceneMemory[] = []
    const tensionCurve = continuity.tension.buildCurve(sceneEvents.length, context.intent || 'narrative')
    let lastVisualAnchor: VisualAnchorState | null = null

    for (let i = 0; i < sceneEvents.length; i++) {
      const event = sceneEvents[i]

      // 1. Narration de scène (Pass 1.5)
      const sceneResult = await this.narration.generateSceneNarration(
        event,
        context,
        undefined,
        maxScenes,
        i === sceneEvents.length - 1,
        sceneMemories,
        i + 1,
        sceneEvents.length,
        continuity.formatFullContinuityBlock(),
        continuity.tension.formatForPrompt(i + 1, sceneEvents.length, tensionCurve)
      )
      sceneMemories.push(sceneResult.memory)

      // 2. Visuels (Pass 2.0 - Motion)
      const visual = await this.planner.generateImagePrompt(
        sceneResult.narration,
        characterContext,
        lastVisualAnchor,
        i === sceneEvents.length - 1
      )
      lastVisualAnchor = visual.visualAnchor

      // 3. Métadonnées Cinématiques (Pass 2.1)
      const sceneMeta = await this.screenwriter.generateSceneMeta(
        sceneResult.narration,
        event.description,
        visual.imagePrompt,
        i + 1,
        sceneEvents.length,
        context
      )

      // 4. Animation (Pass 2.2)
      const animMeta = await this.animation.generateAnimation(sceneResult.narration, event.description, [], context)

      intermediateScenes.push({
        sceneNumber: i + 1,
        narration: sceneResult.narration,
        imagePrompt: visual.imagePrompt,
        animationPrompt: animMeta.animationPrompt,
        acting: animMeta.acting,
        tensionState: sceneMeta.tensionState,
        cameraAction: sceneMeta.cameraAction,
        locationId: sceneMeta.locationId || 'default'
      })
    }

    const durationFactor = (targetDuration || 60) / intermediateScenes.length
    return intermediateScenes.map((s, idx) => ({
      ...s,
      id: `scene-${idx + 1}`,
      duration: durationFactor,
      startTime: idx * durationFactor,
      charactersInScene: [],
      simulationPatch: { charactersPatch: {}, worldPatch: {} }
    })) as VimaxScene[]
  }

  private async saveIntermediate(name: string, data: any): Promise<void> {
    try {
      const seriesId = this.planner.getSeriesId() || 'pending'
      const logDir = path.join(process.cwd(), 'vimax-logs', 'intermediate', seriesId)
      await fs.mkdir(logDir, { recursive: true })
      await fs.writeFile(path.join(logDir, `${name}.json`), JSON.stringify(data, null, 2), 'utf8')
    } catch (error) {
      console.warn(`[VimaxAgent] saveIntermediate failed:`, error)
    }
  }

  private async savePromptSnapshot(agent: any, stepName: string): Promise<void> {
    try {
      if (typeof agent.getLastPromptData !== 'function') return
      const data = agent.getLastPromptData()
      const seriesId = this.planner.getSeriesId() || 'pending'
      const promptDir = path.join(process.cwd(), 'vimax-logs', 'prompts', seriesId)
      await fs.mkdir(promptDir, { recursive: true })
      await fs.writeFile(path.join(promptDir, `${stepName}-${Date.now()}.json`), JSON.stringify(data, null, 2), 'utf8')
    } catch (error) {
      console.warn(`[VimaxAgent] savePromptSnapshot failed:`, error)
    }
  }

  private async triggerReview(stage: ReviewGate['stage'], data: any, options: VimaxRunOptions) {
    console.log(`[VimaxAgent] ReviewGate: ${stage}`)
  }

  private getAllAgents(): any[] {
    return [
      this.planner,
      this.narration,
      this.screenwriter,
      this.eventExtractor,
      this.compressor,
      this.sagaSentinel,
      this.enhancer,
      this.characterExtractor,
      this.dialogue,
      this.animation,
      this.auditor,
      this.inputSanitizer,
      this.outputFormatter,
      this.brain
    ].filter(Boolean)
  }
}
