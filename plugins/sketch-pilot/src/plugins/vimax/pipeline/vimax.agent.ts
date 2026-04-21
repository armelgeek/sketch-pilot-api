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
import { VimaxUniversalCriticAgent } from '../agents/vimax-universal-critic.agent'
import { VimaxBrain } from '../core/vimax-brain'
import { VimaxContinuityEngine } from '../core/vimax-continuity.engine'
import { VimaxPluginRegistry } from '../core/vimax-plugin-registry'
import type { LLMService } from '../core/llm.interface'
import type { VimaxPlugin } from '../core/vimax-plugin.interface'
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
  private critic: VimaxUniversalCriticAgent
  private brain: VimaxBrain
  private registry: VimaxPluginRegistry

  private metrics = {
    totalCalls: 0,
    totalTokens: 0,
    retries: 0,
    startTime: Date.now()
  }

  constructor(llm: LLMService) {
    this.registry = new VimaxPluginRegistry()
    this.brain = new VimaxBrain(llm)

    // Register default agents as plugins
    this.registerDefaultPlugins(llm)

    // Initialize core agents pointers for legacy support (temporarily)
    this.planner = this.registry.getPlugin<VimaxSagaPlanner>('saga-planner')!
    this.narration = this.registry.getPlugin<VimaxNarrationAgent>('narration')!
    this.screenwriter = this.registry.getPlugin<VimaxScreenwriter>('screenwriter')!
    this.eventExtractor = this.registry.getPlugin<VimaxEventExtractor>('event-extractor')!
    this.compressor = this.registry.getPlugin<VimaxSagaCompressor>('compressor')!
    this.sagaSentinel = this.registry.getPlugin<VimaxSagaSentinel>('saga-sentinel')!
    this.enhancer = this.registry.getPlugin<VimaxScriptEnhancer>('script-enhancer')!
    this.characterExtractor = this.registry.getPlugin<VimaxCharacterExtractor>('character-extractor')!
    this.dialogue = this.registry.getPlugin<VimaxDialogueAgent>('dialogue')!
    this.animation = this.registry.getPlugin<VimaxAnimationAgent>('animation')!
    this.auditor = this.registry.getPlugin<VimaxContinuityAuditor>('continuity-auditor')!
    this.inputSanitizer = this.registry.getPlugin<VimaxInputSanitizerAgent>('input-sanitizer')!
    this.outputFormatter = this.registry.getPlugin<VimaxOutputFormatterAgent>('output-formatter')!
    this.critic = this.registry.getPlugin<VimaxUniversalCriticAgent>('universal-critic')!

    // Lifecycle initialization
    this.registry.getPlugins().forEach((p) => {
      if (typeof p.onInitialize === 'function') p.onInitialize(this)
    })
  }

  private registerDefaultPlugins(llm: LLMService) {
    this.registry.register(new VimaxSagaPlanner(llm))
    this.registry.register(new VimaxNarrationAgent(llm))
    this.registry.register(new VimaxScreenwriter(llm))
    this.registry.register(new VimaxEventExtractor(llm))
    this.registry.register(new VimaxSagaCompressor(llm))
    this.registry.register(new VimaxSagaSentinel(llm))
    this.registry.register(new VimaxScriptEnhancer(llm))
    this.registry.register(new VimaxCharacterExtractor(llm))
    this.registry.register(new VimaxDialogueAgent(llm))
    this.registry.register(new VimaxAnimationAgent(llm))
    this.registry.register(new VimaxContinuityAuditor(llm))
    this.registry.register(new VimaxInputSanitizerAgent(llm))
    this.registry.register(new VimaxOutputFormatterAgent(llm))
    this.registry.register(new VimaxUniversalCriticAgent(llm))
  }

  public registerPlugin(plugin: VimaxPlugin) {
    this.registry.register(plugin)
    if (typeof plugin.onInitialize === 'function') {
      plugin.onInitialize(this)
    }
  }

  public getBrain(): VimaxBrain {
    return this.brain
  }

  public setBrainMode(mode: 'stable' | 'all') {
    this.getAllAgents().forEach((a) => {
      if (typeof a.setBrainMode === 'function') {
        a.setBrainMode(mode)
      }
    })
  }

  /**
   * Planification uniquement : Génère le script global et le découpage en épisodes.
   */
  async planSaga(basicIdea: string, options: VimaxRunOptions = {}): Promise<string> {
    const seriesId = options.seriesId || `series-${Date.now()}`
    const mode = options.brainMode || 'all'

    this.getAllAgents().forEach((a) => {
      a.setSeriesId(seriesId)
      a.setBrainMode(mode)
    })

    await this.registry.triggerHook('onBeforePlanSaga', basicIdea, options)

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

    await this.registry.triggerHook('onAfterPlanSaga', sagaPlan)
    const sagaDir = path.join('vimax-logs', 'sagas', seriesId)
    await fs.mkdir(sagaDir, { recursive: true })
    await fs.writeFile(path.join(sagaDir, 'plan.json'), JSON.stringify(sagaPlan, null, 2), 'utf8')

    return seriesId
  }

  /**
   * Étend une saga existante avec de nouveaux épisodes.
   */
  async extendSaga(seriesId: string, additionalCount = 4): Promise<void> {
    const sagaDir = path.join('vimax-logs', 'sagas', seriesId)
    const planPath = path.join(sagaDir, 'plan.json')

    if (!(await fs.stat(planPath).catch(() => null))) {
      throw new Error(`Plan non trouvé pour la saga ${seriesId}`)
    }

    const sagaPlan = JSON.parse(await fs.readFile(planPath, 'utf8'))
    this.getAllAgents().forEach((a) => a.setSeriesId(seriesId))

    console.log(`[VimaxAgent] Extension de la saga ${seriesId} (+${additionalCount} épisodes)...`)

    // 1. Génération de la suite via le planner
    const extension = await this.planner.extendSaga(sagaPlan.plan, additionalCount, sagaPlan.options)

    // 2. Extraction des nouveaux événements
    const newEvents = await this.eventExtractor.extractEvents(
      extension.script,
      'series',
      sagaPlan.options.targetDuration,
      sagaPlan.options.maxScenes,
      additionalCount
    )

    // 3. Mise à jour du plan global
    const lastEpisodeNumber = sagaPlan.plan.episodes.length
    const lastEventIndex = sagaPlan.episodeEvents.length

    // On ajuste les numéros d'épisodes et d'événements
    const adjustedEpisodes = extension.episodes.map((ep) => ({
      ...ep,
      episodeNumber: ep.episodeNumber + lastEpisodeNumber
    }))

    const adjustedEvents = (newEvents as any[]).map((ev) => ({
      ...ev,
      index: ev.index + lastEventIndex
    }))

    // Fusion
    sagaPlan.plan.episodes.push(...adjustedEpisodes)
    sagaPlan.episodeEvents.push(...adjustedEvents)

    // On concatène aussi le script pour garder une trace complète (optionnel)
    sagaPlan.plan.script += `\n\n[ARC 2]\n${extension.script}`

    // Sauvegarde
    await fs.writeFile(planPath, JSON.stringify(sagaPlan, null, 2), 'utf8')
    console.log(`✅ Saga étendue ! Total épisodes : ${sagaPlan.plan.episodes.length}`)
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

    const mode = sagaPlan.options?.brainMode || 'all'

    this.getAllAgents().forEach((a) => {
      a.setSeriesId(seriesId)
      a.setBrainMode(mode)
    })

    await this.registry.triggerHook('onBeforeEpisode', event, episodeIndex - 1, sagaPlan.options)

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

    if (filteredFiles.length > 0) {
      const lastFile = filteredFiles.at(-1)!
      const lastEpData = JSON.parse(await fs.readFile(path.join(sagaDir, lastFile), 'utf8'))
      seriesContext.lastEpisodeBridge = lastEpData.bridge
    }

    const episode = await this.runEpisode(event, episodeIndex - 1, seriesContext, sagaPlan.options)

    await this.registry.triggerHook('onAfterEpisode', episode)

    await fs.writeFile(path.join(sagaDir, `episode-${episodeIndex}.json`), JSON.stringify(episode, null, 2), 'utf8')

    return episode
  }

  /**
   * Applique une correction issue d'un audit à un élément du pipeline.
   */
  async refineItemFromFeedback(type: string, data: any, feedback: any): Promise<any> {
    const seriesId = this.planner.getSeriesId() || 'pending'
    this.getAllAgents().forEach((a) => a.setSeriesId(seriesId))

    console.log(`[VimaxAgent] Raffinement de ${type} via feedback : "${feedback.issue}"...`)

    const instruction = `
[MISSION : RAFFINEMENT SUITE À AUDIT]
L'audit a identifié le problème suivant : "${feedback.issue}".
Raison : ${feedback.rationale}
Correction à appliquer : ${feedback.correction}
${feedback.example ? `Exemple de mise en œuvre : ${feedback.example}` : ''}

Consigne : Mets à jour l'objet fourni pour intégrer cette correction. 
Respecte la structure JSON d'origine et conserve les identifiants @PascalCase.
`.trim()

    let refined: any
    switch (type) {
      case 'plan':
        refined = await this.planner.generateStructured(
          `Objet à raffiner : ${JSON.stringify(data)}\n\n${instruction}`,
          'Tu es un expert en planification narrative. Applique la correction demandée au plan de la saga.',
          data // On utilise l'objet d'origine comme fallback structurel
        )
        break
      case 'episode':
        refined = await this.screenwriter.generateStructured(
          `Objet à raffiner : ${JSON.stringify(data)}\n\n${instruction}`,
          "Tu es un expert Script Doctor. Applique la correction demandée au script de l'épisode.",
          data
        )
        break
      // On peut ajouter d'autres types ici
      default:
        throw new Error(`Raffinement non supporté pour le type : ${type}`)
    }

    return refined.data
  }

  /**
   * Applique plusieurs corrections issues d'un audit à un élément. (Mode groupé)
   */
  async refineItemFromFeedbacks(type: string, data: any, feedbacks: any[]): Promise<any> {
    if (feedbacks.length === 0) return data
    const seriesId = this.planner.getSeriesId() || 'pending'
    this.getAllAgents().forEach((a) => a.setSeriesId(seriesId))

    console.log(`[VimaxAgent] Raffinement de groupé de ${type} via ${feedbacks.length} feedbacks...`)

    const feedbackList = feedbacks
      .map((f, i) =>
        `
[FEEDBACK ${i + 1}]
- Problème : ${f.issue}
- Raison : ${f.rationale}
- Correction : ${f.correction}
${f.example ? `- Exemple : ${f.example}` : ''}
`.trim()
      )
      .join('\n\n')

    const instruction = `
[MISSION : RAFFINEMENT GLOBAL SUITE À AUDIT]
L'audit a identifié les points d'amélioration suivants :

${feedbackList}

Consigne : Mets à jour l'objet fourni pour intégrer TOUTES ces corrections de façon cohérente. 
Respecte la structure JSON d'origine et conserve les identifiants @PascalCase.
`.trim()

    let refined: any
    switch (type) {
      case 'plan':
        refined = await this.planner.generateStructured(
          `Objet à raffiner : ${JSON.stringify(data)}\n\n${instruction}`,
          'Tu es un expert en planification narrative. Applique les corrections demandées au plan de la saga.',
          data
        )
        break
      case 'episode':
        refined = await this.screenwriter.generateStructured(
          `Objet à raffiner : ${JSON.stringify(data)}\n\n${instruction}`,
          "Tu es un expert Script Doctor. Applique les corrections demandées au script de l'épisode.",
          data
        )
        break
      default:
        throw new Error(`Raffinement groupé non supporté pour : ${type}`)
    }

    return refined.data
  }

  /**
   * Audit d'un élément spécifique du pipeline (plan, épisode, scène, etc.)
   */
  async auditItem(
    type: string,
    data: any,
    options: { id?: string; sagaDir?: string; seriesId?: string } = {}
  ): Promise<any> {
    const seriesId = options.seriesId || this.planner.getSeriesId() || 'pending'
    this.getAllAgents().forEach((a) => a.setSeriesId(seriesId))

    console.log(`[VimaxAgent] Audit ${type} pour ${seriesId}...`)

    let audit: any
    switch (type) {
      case 'plan':
        audit = await this.critic.auditSagaPlan(data)
        break
      case 'episode':
        audit = await this.critic.auditEpisode(data)
        break
      case 'scene':
        audit = await this.critic.auditScene(data.narration, data.sceneNumber)
        break
      case 'image':
        audit = await this.critic.auditVisual('image', data.prompt, data.context)
        break
      case 'animation':
        audit = await this.critic.auditVisual('animation', data.prompt, data.context)
        break
      default:
        throw new Error(`Type d'audit inconnu : ${type}`)
    }

    // Persistance si un sagaDir est fourni
    if (options.sagaDir && options.id) {
      const auditPath = path.join(options.sagaDir, `audit-${type}-${options.id}.json`)
      await fs.mkdir(path.dirname(auditPath), { recursive: true })
      await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8')
      console.log(`✅ Audit ${type} persisté : ${auditPath}`)
    }

    return audit
  }

  /**
   * Audit narratif complet d'une saga.
   */
  async auditSagaNarrative(seriesId: string): Promise<any> {
    const sagaDir = path.join('vimax-logs', 'sagas', seriesId)
    const planPath = path.join(sagaDir, 'plan.json')

    if (!(await fs.stat(planPath).catch(() => null))) {
      throw new Error(`Plan non trouvé pour la saga ${seriesId}`)
    }

    const sagaPlan = JSON.parse(await fs.readFile(planPath, 'utf8'))
    return this.auditItem('plan', sagaPlan, { id: 'initial', sagaDir })
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
    let bridge: any
    if (scenes.length > 0) {
      const lastNarration = scenes.at(-1)!.narration
      bridge = await this.compressor.extractEpisodeBridge(lastNarration)
    }

    return {
      id: `${this.planner.getSeriesId()}-ep${index + 1}`,
      episodeNumber: index + 1,
      summary: fullNarration.slice(0, 200),
      narration: fullNarration,
      scenes,
      bridge,
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
    if (sceneEvents.length === 0) return []
    const intermediateScenes: any[] = []
    const sceneMemories: SceneMemory[] = []
    const tensionCurve = continuity.tension.buildCurve(sceneEvents.length, context.intent || 'narrative')
    let lastVisualAnchor: VisualAnchorState | null = null

    for (let i = 0; i < sceneEvents.length; i++) {
      const event = sceneEvents[i]

      await this.registry.triggerHook('onBeforeScene', event, i + 1)

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

      const lastScene = intermediateScenes.at(-1)
      await this.registry.triggerHook('onAfterScene', lastScene)
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
      this.critic,
      this.brain
    ].filter(Boolean)
  }
}
