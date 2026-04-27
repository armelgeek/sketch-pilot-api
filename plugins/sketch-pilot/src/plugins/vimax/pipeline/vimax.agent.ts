import fs from 'node:fs/promises'
import path from 'node:path'
import { VimaxAnimationAgent } from '../agents/vimax-animation.agent'
import { VimaxAssetExtractor } from '../agents/vimax-asset-extractor.agent'
import { VimaxAtmosphereExtractor } from '../agents/vimax-atmosphere-extractor.agent'
import { VimaxCharacterExtractor } from '../agents/vimax-character-extractor.agent'
import { VimaxContinuityAuditor } from '../agents/vimax-continuity-auditor.agent'
import { VimaxDialogueAgent } from '../agents/vimax-dialogue.agent'
import { VimaxEventExtractor } from '../agents/vimax-event-extractor.agent'
import { VimaxInputSanitizerAgent } from '../agents/vimax-input-sanitizer.agent'
import { VimaxLocationExtractor } from '../agents/vimax-location-extractor.agent'
import { VimaxMaturationAgent } from '../agents/vimax-maturation.agent'
import { VimaxNarrationAgent } from '../agents/vimax-narration.agent'
import { VimaxNarrativeExtractor } from '../agents/vimax-narrative-extractor.agent'
import { VimaxOutputFormatterAgent } from '../agents/vimax-output-formatter.agent'
import { VimaxSagaCompressor } from '../agents/vimax-saga-compressor.agent'
import { VimaxSagaPlanner } from '../agents/vimax-saga-planner.agent'
import { VimaxSagaSentinel } from '../agents/vimax-saga-sentinel.agent'
import { VimaxScreenwriter } from '../agents/vimax-screenwriter.agent'
import { VimaxScriptEnhancer } from '../agents/vimax-script-enhancer.agent'
import { VimaxSpectatorAgent } from '../agents/vimax-spectator.agent'
import { VimaxStyleExtractor } from '../agents/vimax-style-extractor.agent'
import { VimaxUniversalCriticAgent } from '../agents/vimax-universal-critic.agent'
import { LessonStore } from '../core/lesson-store'
import { VimaxBrain } from '../core/vimax-brain'
import { VimaxContinuityEngine } from '../core/vimax-continuity.engine'
import { VimaxPluginRegistry } from '../core/vimax-plugin-registry'
import type { LLMService } from '../core/llm.interface'
import type { VimaxPlugin } from '../core/vimax-plugin.interface'
import type {
  CharacterProfile,
  DramaticFunction,
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
  public planner: VimaxSagaPlanner
  public narration: VimaxNarrationAgent
  public screenwriter: VimaxScreenwriter
  public eventExtractor: VimaxEventExtractor
  public compressor: VimaxSagaCompressor
  public sagaSentinel: VimaxSagaSentinel
  public enhancer: VimaxScriptEnhancer
  public characterExtractor: VimaxCharacterExtractor
  public locationExtractor: VimaxLocationExtractor
  public assetExtractor: VimaxAssetExtractor
  public atmosphereExtractor: VimaxAtmosphereExtractor
  public narrativeExtractor: VimaxNarrativeExtractor
  public dialogue: VimaxDialogueAgent
  public animation: VimaxAnimationAgent
  public auditor: VimaxContinuityAuditor
  public inputSanitizer: VimaxInputSanitizerAgent
  public outputFormatter: VimaxOutputFormatterAgent
  public critic: VimaxUniversalCriticAgent
  public spectator: VimaxSpectatorAgent
  public maturation: VimaxMaturationAgent
  public brain: VimaxBrain
  public styleExtractor: VimaxStyleExtractor
  public registry: VimaxPluginRegistry
  public readonly llm: LLMService

  private metrics = {
    totalCalls: 0,
    totalTokens: 0,
    retries: 0,
    startTime: Date.now()
  }

  constructor(llm: LLMService) {
    this.llm = llm
    this.narrativeExtractor = new VimaxNarrativeExtractor(llm)
    this.brain = new VimaxBrain(llm)
    this.styleExtractor = new VimaxStyleExtractor(llm)
    this.registry = new VimaxPluginRegistry()

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
    this.locationExtractor = this.registry.getPlugin<VimaxLocationExtractor>('location-extractor')!
    this.assetExtractor = this.registry.getPlugin<VimaxAssetExtractor>('asset-extractor')!
    this.atmosphereExtractor = this.registry.getPlugin<VimaxAtmosphereExtractor>('atmosphere-extractor')!
    this.narrativeExtractor = this.registry.getPlugin<VimaxNarrativeExtractor>('narrative-extractor')!
    this.dialogue = this.registry.getPlugin<VimaxDialogueAgent>('dialogue')!
    this.animation = this.registry.getPlugin<VimaxAnimationAgent>('animation')!
    this.auditor = this.registry.getPlugin<VimaxContinuityAuditor>('continuity-auditor')!
    this.inputSanitizer = this.registry.getPlugin<VimaxInputSanitizerAgent>('input-sanitizer')!
    this.outputFormatter = this.registry.getPlugin<VimaxOutputFormatterAgent>('output-formatter')!
    this.critic = this.registry.getPlugin<VimaxUniversalCriticAgent>('universal-critic')!
    this.maturation = this.registry.getPlugin<VimaxMaturationAgent>('maturation')!
    this.spectator = this.registry.getPlugin<VimaxSpectatorAgent>('spectator')!

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
    this.registry.register(new VimaxLocationExtractor(llm))
    this.registry.register(new VimaxAssetExtractor(llm))
    this.registry.register(new VimaxAtmosphereExtractor(llm))
    this.registry.register(new VimaxNarrativeExtractor(llm))
    this.registry.register(new VimaxDialogueAgent(llm))
    this.registry.register(new VimaxAnimationAgent(llm))
    this.registry.register(new VimaxContinuityAuditor(llm))
    this.registry.register(new VimaxInputSanitizerAgent(llm))
    this.registry.register(new VimaxOutputFormatterAgent(llm))
    this.registry.register(new VimaxUniversalCriticAgent(llm))
    this.registry.register(new VimaxMaturationAgent(llm))
    this.registry.register(new VimaxSpectatorAgent(llm))
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

    await this.registry.triggerHook('onBeforePlanSaga', this, basicIdea, options)
    console.log('[REFERENCE IMAGE]', options)
    // 🎨 Style Lock Logic (Vision-Driven)
    if (options.referenceStyleImage) {
      console.info("[VimaxAgent] 🎨 Extraction du style à partir de l'image de référence (Mode Planning)...")
      const styleLock = await this.styleExtractor.extractStyle(options.referenceStyleImage)
      this.planner.setStyleLock(styleLock)
      console.info(`[VimaxAgent] ✨ Style extrait : ${styleLock.visualStyle}`)

      // [V47] Promote style reference as Master Style for the engine
      if (options.seriesContext) {
        options.seriesContext.thumbnailUrl = options.referenceStyleImage
        // Sync Visual DNA attributes for the engine
        options.seriesContext.colorPalette = styleLock.colorPalette.join(', ')
        options.seriesContext.cameraStyle = styleLock.visualStyle
        // Store mandatory terms in motifs for persistent enforcement
        options.seriesContext.symbolicMotifs = styleLock.mandatoryTerms

        // [V50] Explicitly persist the StyleLock object in the context
        options.seriesContext.visualStyleLock = styleLock
      }
    }

    const analysis = await this.inputSanitizer.analyze(basicIdea)
    if (!analysis.isViable) {
      throw new Error(`Idée non viable : ${analysis.issues.join(', ')}`)
    }

    const plan = await this.planner.planSaga(analysis.enrichedIdea, options)
    let episodeEvents = plan.episodeEvents || []

    // Audit structurel 3.0 avec Blueprint V7.0
    const planAudit = await this.sagaSentinel.auditEventPlan(
      episodeEvents,
      typeof options.seriesContext?.seriesBible === 'string'
        ? options.seriesContext.seriesBible
        : JSON.stringify(options.seriesContext?.seriesBible),
      plan.blueprint // Pass the blueprint for rich auditing
    )

    if (!planAudit.isConsistent) {
      const correctionHint = `RESTRUCTURE LE PLAN DE SAGA EN RÉSOLVANT CES INCOHÉRENCES PAR RAPPORT AU BLUEPRINT :\n${planAudit.violations.map((v) => `- ${v}`).join('\n')}`
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
      ...plan, // V7.0: Contains blueprint, characterRegistry, etc.
      seriesId,
      basicIdea,
      options,
      episodeEvents
    }

    await this.registry.triggerHook('onAfterPlanSaga', this, sagaPlan)
    const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', seriesId)
    await fs.mkdir(sagaDir, { recursive: true })
    await fs.writeFile(path.join(sagaDir, 'plan.json'), JSON.stringify(sagaPlan, null, 2), 'utf8')

    return seriesId
  }

  /**
   * Étend une saga existante avec de nouveaux épisodes.
   */
  async extendSaga(seriesId: string, additionalCount = 4): Promise<void> {
    const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', seriesId)
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
  async runSingleEpisode(seriesId: string, episodeIndex: number, providedPlan?: any): Promise<VimaxEpisode> {
    const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', seriesId)
    let sagaPlan = providedPlan

    if (providedPlan) {
      const planPath = path.join(sagaDir, 'plan.json')
      await fs.mkdir(sagaDir, { recursive: true })
      // On s'assure que le plan est toujours présent sur disque pour les outils d'audit
      await fs.writeFile(planPath, JSON.stringify(providedPlan, null, 2), 'utf8')
    } else {
      const planPath = path.join(sagaDir, 'plan.json')
      if (!(await fs.stat(planPath).catch(() => null))) {
        throw new Error(`Plan non trouvé pour la saga ${seriesId}`)
      }
      sagaPlan = JSON.parse(await fs.readFile(planPath, 'utf8'))
    }

    // Sécurité : S'assurer que le dossier de logs existe pour l'épisode
    await fs.mkdir(sagaDir, { recursive: true })

    const event = sagaPlan.episodeEvents[episodeIndex - 1]

    if (!event) {
      throw new Error(`Épisode ${episodeIndex} non trouvé dans le plan de la saga ${seriesId}`)
    }

    const mode = sagaPlan.options?.brainMode || 'all'

    this.getAllAgents().forEach((a) => {
      a.setSeriesId(seriesId)
      a.setBrainMode(mode)
    })

    await this.registry.triggerHook('onBeforeEpisode', this, event, episodeIndex - 1, sagaPlan.options)

    // 🎨 Hydratation du StyleLock depuis le contexte persistant
    const persistence = sagaPlan.options?.seriesContext
    let seriesContext: SeriesContext = { ...sagaPlan.options?.seriesContext }

    if (persistence?.visualStyleLock) {
      console.info(`[VimaxAgent] 🎨 Restauration du StyleLock : ${persistence.visualStyleLock.visualStyle}`)
      // 1. Démarrage de l'épisode
      console.info(`[VimaxAgent] 🚀 Démarrage de l'ÉPISODE ${episodeIndex}/${sagaPlan.episodeEvents.length}...`)

      // [V55] IMMUTABLE INTELLIGENCE SNAPSHOT : On charge les leçons UNE SEULE FOIS pour l'épisode entier
      // Cela évite les race conditions et les lectures disque inutiles dans chaque agent.
      const store = LessonStore.getInstance()
      await store.load()
      const lessonSnapshot = store.getAllLessons(sagaPlan.options.brainMode || 'all')

      seriesContext = {
        ...seriesContext,
        intent: sagaPlan.plan.intent,
        seriesBible: sagaPlan.roadmap?.scriptSummary,
        globalScript: sagaPlan.script,
        previousEpisodes: [],
        characterRegistry: Object.fromEntries(sagaPlan.characterRegistry.map((p: any) => [p.identifier, p])),
        locationRegistry: Object.fromEntries(sagaPlan.locationRegistry.map((l: any) => [l.locationId || 'unknown', l])),
        // [V55] Injection des leçons immuables dans le contexte
        // @ts-ignore
        lessonSnapshot
      }
      this.planner.setStyleLock(persistence.visualStyleLock)
    }

    const episodeFiles = await fs.readdir(sagaDir).catch(() => [])
    const filteredFiles = episodeFiles
      .filter((f) => f.startsWith('episode-') && f.endsWith('.json'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0')
        const numB = parseInt(b.match(/\d+/)?.[0] || '0')
        return numA - numB
      })

    const summaries: string[] = []
    for (const file of filteredFiles) {
      const epData = JSON.parse(await fs.readFile(path.join(sagaDir, file), 'utf8'))
      summaries.push(`[EP ${epData.episodeNumber}] ${epData.summary || epData.narration.slice(0, 300)}`)
    }

    // [V3] Context Compression Logic
    if (summaries.length > 0) {
      console.info(`[VimaxAgent] 🗜️ Analyse de la fenêtre de contexte (${summaries.length} épisodes)...`)
      const compressedHistory = await this.compressor.compressSeriesHistory(summaries, 3)
      seriesContext.previousEpisodes = [{ narration: compressedHistory, summary: compressedHistory }]
    }

    if (filteredFiles.length > 0) {
      const lastFile = filteredFiles.at(-1)!
      const lastEpData = JSON.parse(await fs.readFile(path.join(sagaDir, lastFile), 'utf8'))
      seriesContext.lastEpisodeBridge = lastEpData.bridge
      // [V48] Restore last technical metadata for Sequel Bridge (image + scene context)
      seriesContext.lastEpisodeFinalImage = lastEpData.scenes?.at(-1)?.imageUrl
      seriesContext.lastEpisodeFinalScene = lastEpData.scenes?.at(-1)

      // On garde la narration complète du TOUT DERNIER épisode pour une continuité "fraîche"
      seriesContext.previousEpisodes?.push({ narration: lastEpData.narration, summary: lastEpData.summary })
    }

    const episode = await this.runEpisode(event, episodeIndex - 1, seriesContext, sagaPlan.options, sagaPlan)

    await this.registry.triggerHook('onAfterEpisode', this, episode, sagaPlan)

    const outputDir = path.join(sagaDir, 'episodes')
    await fs.mkdir(outputDir, { recursive: true })
    await fs.writeFile(path.join(outputDir, `episode-${episodeIndex}.json`), JSON.stringify(episode, null, 2), 'utf8')

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
      const auditPath = path.join(options.sagaDir, 'audits', `audit-${type}-${options.id}.json`)
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
    const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', seriesId)
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
    const sagaDir = path.join(process.cwd(), 'vimax-logs', 'sagas', seriesId)
    const sagaPlan = JSON.parse(await fs.readFile(path.join(sagaDir, 'plan.json'), 'utf8'))

    const episodes: VimaxEpisode[] = []
    for (let i = 1; i <= sagaPlan.episodeEvents.length; i++) {
      console.log(`[VimaxAgent] Génération de l'épisode ${i}/${sagaPlan.episodeEvents.length}...`)

      // [V52] EXECUTIVE AMYGDALA : On vérifie si le système est sain avant de continuer
      if (i > 1 && options.brainMode === 'all') {
        const logs = await this.brain.getRecentHistory(seriesId, 10)
        const report = await this.brain.getAnomalies(logs)
        if (report.isCompromised) {
          console.error(
            `[VimaxAgent] 🚨 ARRÊT D'URGENCE : L'Amygdale a détecté une anomalie critique ! ${report.rationale}`
          )
          throw new Error(`Cinematic Singularity Compromised: ${report.rationale}`)
        }
      }

      const episode = await this.runSingleEpisode(seriesId, i)
      episodes.push(episode)

      // [V48] RE-CALIBRATION RÉCURSIVE DU BLUEPRINT
      console.info(`[VimaxAgent] 🔄 Synchronisation du Blueprint vivant post-épisode ${i}...`)
      const updatedPlan = await this.planner.recalibrateBlueprint(sagaPlan, episodes)

      // Persistance de la recalibration
      await fs.writeFile(path.join(sagaDir, 'plan.json'), JSON.stringify(updatedPlan, null, 2))
      sagaPlan.blueprint = updatedPlan.blueprint
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
    options: VimaxRunOptions,
    sagaPlan?: any
  ): Promise<VimaxEpisode> {
    const prefix = `episode-${index + 1}`

    // [V8.0] Injection du contexte de l'épisode depuis la roadmap
    context.plannedEpisodeContext = {
      title: event.description,
      hook: event.description,
      dramaticFunction: event.dramaticFunction,
      actPosition: `${event.actPosition?.act || 1}`,
      tensionTarget: event.tensionTarget,
      paceTarget: event.paceTarget,
      impactedCharacters: (event.characterImpacts || []).map((i) => i.identifier)
    }

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
        context
      )
      await this.savePromptSnapshot(this.sagaSentinel, `${prefix}-continuity-audit`)

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

    // [V8.0] Pre-planned Scenes Logic
    // If the event already contains scenes (from roadmap), we use them directly
    let sceneEvents: VimaxEvent[]
    if (event.scenes && event.scenes.length > 0) {
      console.info(`[VimaxAgent] 🛠️ Using ${event.scenes.length} pre-planned scenes for ${prefix}`)
      sceneEvents = event.scenes.map((s) => ({
        index: s.sceneNumber - 1,
        description: s.objective, // objective serves as description for high-level event
        duration: 5,
        isClimax: false,
        tensionTarget: s.tensionTarget,
        locationId: s.locationId,
        impactedCharacters: s.characters,
        // [V8.0] Directives injection
        dramaticFunction: s.function as DramaticFunction,
        actPosition: event.actPosition,
        // Store rich metadata as custom fields for the next pass
        metadata: {
          objective: s.objective,
          characterState: s.characterState,
          openPromises: s.openPromises,
          resolvedPromises: s.resolvedPromises,
          obligatory: s.obligatory,
          prepares: s.prepares,
          paceTarget: s.paceTarget,
          cliffhanger: s.cliffhanger
        },
        transitionType: (s as any).transitionType
      }))
      // Mark last scene as true
      if (sceneEvents.length > 0) {
        const last = sceneEvents.at(-1)
        if (last) last.isLast = true
      }
    } else {
      sceneEvents = await this.eventExtractor.extractEvents(
        enhancedScript,
        'episode',
        options.targetDuration,
        6 // [V21.0] Restored to 6 scenes for narrative clarity
      )
    }

    const continuity = new VimaxContinuityEngine()
    if (context.lastEpisodeBridge) continuity.setBridge(context.lastEpisodeBridge)
    if (context.lastEpisodeFinalImage) continuity.setLastEpisodeFinalImage?.(context.lastEpisodeFinalImage)

    // Fusion des profils extraits avec le registre global (Source de Vérité)
    const globalRegistry = (sagaPlan?.plan?.characterRegistry || []) as CharacterProfile[]
    const mergedProfiles = profiles.map((p) => {
      const global = globalRegistry.find((g) => g.identifier === p.identifier)
      if (global) {
        return {
          ...p,
          portrait_prompt: global.portrait_prompt || p.portrait_prompt,
          static_features: global.static_features || p.static_features,
          thumbnailUrl: global.thumbnailUrl || p.thumbnailUrl
          // On garde les dynamic_features de l'extraction car elles sont spécifiques à l'épisode
        }
      }
      return p
    })

    const charContext = this.characterExtractor.formatForPrompt(mergedProfiles)
    const { scenes, lastAnchor } = await this.buildScenes(
      sceneEvents,
      context,
      charContext,
      mergedProfiles,
      continuity,
      options,
      fullNarration // [V47] Pass full narration for style loop
    )

    // Bridge pour l'épisode suivant
    let bridge: any
    if (scenes.length > 0) {
      const lastNarration = scenes.at(-1)!.narration
      // [V8.3] Le pont hérite désormais de l'état physique final de l'épisode
      bridge = await this.compressor.extractEpisodeBridge(lastNarration, lastAnchor?.characterStates)
    }

    return {
      id: `${this.planner.getSeriesId()}-ep${index + 1}`,
      episodeNumber: index + 1,
      summary: fullNarration.slice(0, 200),
      narration: fullNarration,
      scenes,
      bridge,
      characterProfiles: mergedProfiles,
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
    options: VimaxRunOptions,
    fullNarration: string // [V47] Ghost Script
  ): Promise<{ scenes: VimaxScene[]; lastAnchor: VisualAnchorState | null }> {
    if (sceneEvents.length === 0) return { scenes: [], lastAnchor: null }
    const intermediateScenes: any[] = []
    const sceneMemories: SceneMemory[] = []
    const tensionCurve = continuity.tension.buildCurve(sceneEvents.length, context.intent || 'narrative')
    let lastVisualAnchor: VisualAnchorState | null = null
    let lastVisualBeat: string | undefined = undefined

    // 0. Style Lock Logic (Vision-Driven)
    const existingLock = this.planner.getStyleLock()

    if (options.referenceStyleImage) {
      console.info("[VimaxAgent] 🎨 Extraction du style à partir de l'image de référence...")
      const styleLock = await this.styleExtractor.extractStyle(options.referenceStyleImage)
      this.planner.setStyleLock(styleLock)
      console.info(`[VimaxAgent] ✨ Style extrait : ${styleLock.visualStyle}`)
    } else if (!existingLock) {
      // Fallback ou style bible — Uniquement si aucun style n'a été restauré du contexte
      const bible = typeof context.seriesBible === 'string' ? null : context.seriesBible
      const visualStyle = options.visualStyle || bible?.visualStyle || 'Standard'

      this.planner.setStyleLock({
        visualStyle,
        colorPalette: options.colorPalette || [],
        mandatoryTerms: visualStyle.toLowerCase().includes('whiteboard')
          ? ['whiteboard sketch', 'simple black and white lines', 'hand-drawn sketch']
          : [],
        forbiddenTerms: visualStyle.toLowerCase().includes('whiteboard')
          ? ['realistic', 'photorealistic', 'cinematic lighting', 'textures', '3d', 'render', 'shaded']
          : []
      })
    }

    // 0.1 Character Identity Locking (Per Person)
    if (options.referencePortraits && profiles.length > 0) {
      console.info('[VimaxAgent] 👥 Vérification des identités personnages...')
      for (const profile of profiles) {
        const reference = options.referencePortraits[profile.identifier]
        if (reference) {
          // [V47] Ensure the reference image is used as the character's visual anchor
          profile.thumbnailUrl = reference

          if (!profile.portrait_prompt?.includes('[LOCKED]')) {
            console.info(`[VimaxAgent] 👤 Raffinement chirurgical de l'identité pour ${profile.identifier}...`)
            const refinedPrompt = await this.characterExtractor.refineCharacterIdentity(profile.identifier, reference)
            profile.portrait_prompt = `${refinedPrompt} [LOCKED]`
          }
        }
      }
      // Re-formater le contexte après verrouillage
      characterContext = this.characterExtractor.formatForPrompt(profiles)
    }

    let lastLocationId: string | null = null

    for (let i = 0; i < sceneEvents.length; i++) {
      const event = sceneEvents[i]
      await this.registry.triggerHook('onBeforeScene', this, event, i + 1, options)

      // [V48] Modélisation Spectateur (Breathing & Pacing)
      let respirationDirective = ''
      let paceWeight = 1
      let isElliptical = false
      let impact: any = null

      if (i > 0) {
        // [V49] SAGA-SCALE SPECTATOR MEMORY : On passe l'historique de la saga
        const previousEpSummaries = context.previousEpisodes?.map((e) => e.summary || '') || []
        impact = await this.spectator.analyzeSpectatorImpact(
          sceneMemories,
          context.intent && typeof context.intent !== 'string' ? context.intent.audience : undefined,
          context.intent,
          previousEpSummaries
        )
        respirationDirective = `\n[DIRECTIVE RESPIRATION NARRATIVE]\n- État Saturation: ${impact.state.saturationLevel}%\n- Direction: ${impact.directive.tensionTarget}\n- Conseil: ${impact.directive.rationale}\n${impact.directive.ellipticalHint ? `- Ellipse: ${impact.directive.ellipticalHint}` : ''}`

        if (impact.directive.paceAdjustment === 'decelerate') paceWeight = 1.4
        if (impact.directive.paceAdjustment === 'accelerate') paceWeight = 0.7
        if (impact.directive.ellipticalHint) isElliptical = true
      }

      // [V21.0] RESTORED 6-SCENE PACING (10s per scene)
      if (sceneEvents.length === 6) {
        if (i === 2 || i === 3)
          paceWeight = 1.3 // Scènes pivot
        else paceWeight = 1 // Intro/Actions/Resolution
      }

      // [V12.0] Location Continuity & Break Detection
      context.locationChanged = lastLocationId !== null && event.locationId !== lastLocationId
      lastLocationId = event.locationId || null
      const transitionType = event.transitionType || 'transition'

      // [V8.0] Injection chirurgicale du contexte de scène (Objective & Directives)
      context.plannedSceneContext = {
        sceneNumber: i + 1,
        function: event.dramaticFunction,
        objective: event.metadata?.objective || event.description,
        characterState: event.metadata?.characterState,
        obligatory: event.metadata?.obligatory,
        locationId: event.locationId
      }

      // 1. Narration de scène (Pass 1.5) - [V12.0] Trailer Concision
      const targetWordCount = '20'

      const sceneResult = await this.narration.generatePolishedNarration(
        event,
        context,
        targetWordCount,
        sceneEvents.length,
        i === sceneEvents.length - 1,
        sceneMemories.slice(-3),
        i + 1,
        sceneEvents.length,
        continuity.formatFullContinuityBlock(), // [V45] Live Continuity Feeding
        continuity.tension.formatForPrompt(i + 1, sceneEvents.length, tensionCurve) + respirationDirective,
        '', // intentReminder
        fullNarration, // [V47] Ghost Script Style Inheritance
        transitionType
      )

      // [V5.5] Maturation Cycle (Production Mode)
      if (options.brainMode === 'all' && this.maturation) {
        console.info(`[VimaxAgent] 🕰️ Cycle de maturation pour la scène ${i + 1}...`)
        const maturation = await this.maturation.reviewForMaturation(
          sceneResult.narration,
          `Event: ${event.description}`,
          sceneResult.memory.maturationCycle
        )

        if (maturation.delta > 20) {
          console.info(`[VimaxAgent] ✨ Ré-écriture de maturation (+${maturation.delta} delta)`)
          const matured = await this.narration.generatePolishedNarration(
            event,
            context,
            targetWordCount,
            options.maxScenes,
            i === sceneEvents.length - 1,
            sceneMemories,
            i + 1,
            sceneEvents.length,
            continuity.formatFullContinuityBlock(),
            `FEEDBACK DE MATURATION : ${maturation.feedback}\nSUGGESTION : ${maturation.suggestion}`
          )
          sceneResult.narration = matured.narration
          sceneResult.memory = {
            ...matured.memory,
            maturationCycle: {
              passCount: (sceneResult.memory.maturationCycle?.passCount || 1) + 1,
              revisions: [
                ...(sceneResult.memory.maturationCycle?.revisions || []),
                { timestamp: Date.now(), feedback: maturation.feedback, improvementDelta: maturation.delta }
              ],
              restingStatus: 'matured'
            }
          }
        }
      }

      // [V8.1 & V8.2] DYNAMIC CHARACTER CONTEXT : Fusion de l'identité visuelle, de l'état prévu et de l'héritage visuel
      const currentSceneCharacterContext = this.characterExtractor.formatForPrompt(
        profiles.map((p) => {
          const sceneState = event.metadata?.characterState?.[p.identifier]
          const anchorState = lastVisualAnchor?.characterStates?.[p.identifier]
          const mergedState = [anchorState, sceneState].filter(Boolean).join('. ')
          return mergedState ? { ...p, dynamic_features: mergedState } : p
        })
      )

      // [V42.0] SONIC ORCHESTRATION : Calcul de l'encombrement de la voix off
      const narrationWordCount = sceneResult.narration.split(/\s+/).length
      const estimatedVoDurationSec = narrationWordCount / 2.5 // 150 wpm
      const relativeVoDuration = Math.min(0.8, estimatedVoDurationSec / 10) // Cap à 80% de la scène

      // [V42.1] Dialogue Generation (Sequential Pass 1.6)
      const sceneDialogue = await this.dialogue.generateDialogue(
        sceneResult.narration,
        event.description,
        context,
        [],
        relativeVoDuration,
        event.metadata?.characterState // [V8.1] Injection des états émotionnels
      )

      // 2. Parallel Assets Generation (Pass 2.x) - [v6.0]
      console.info(`[VimaxAgent] ⚡ Génération chirurgicale des assets pour la scène ${i + 1}...`)

      // [V51] CINEMATIC TRIANGLE ALIGNMENT : On casse le parallélisme pour l'alignement Tension-Acting
      // Étape 1 : Le Screenwriter définit la tension et le cadrage
      const sceneMeta = await this.screenwriter.generateSceneMeta(
        sceneResult.narration,
        event.description,
        '', // imagePrompt (not yet generated)
        i + 1, // sceneNumber
        sceneEvents.length, // totalScenes
        context,
        false, // forceClimax
        impact?.directive // cameraIntent
      )

      const framing = sceneMeta.composition?.shotType || 'MEDIUM'

      // Étape 2 : Le Visuel et l'Animation 'écoutent' les métadonnées pour s'aligner
      const [visual, animMeta] = await Promise.all([
        (async () => {
          let currentAnchor = lastVisualAnchor
          if (currentAnchor) {
            const narration = sceneResult.narration.toLowerCase()
            currentAnchor = {
              ...currentAnchor,
              // [V8.7] On ne filtre plus agressivement les props (ils doivent persister)
              // On ne les met à jour que si nécessaire, mais on garde l'héritage
              activeProps: currentAnchor.activeProps || [],
              characterPositions: Object.fromEntries(
                Object.entries(currentAnchor.characterPositions || {}).filter(([id]) =>
                  narration.includes(id.toLowerCase())
                )
              )
            }
          }

          const v = await this.planner.generateImagePrompt(
            sceneResult.narration,
            currentSceneCharacterContext, // [V8.1] Contexte dynamique
            currentAnchor,
            i === sceneEvents.length - 1,
            '', // correctionFeedback
            context,
            lastVisualBeat,
            transitionType,
            {
              lightingMood: sceneMeta.composition?.lightingMood,
              shotType: sceneMeta.composition?.shotType,
              framing: sceneMeta.composition?.shotType // Alias for compatibility
            },
            sceneDialogue // [V8.9] Acting alignment
          )
          return v
        })(),
        this.animation.generateAnimation(
          sceneResult.narration,
          event.description,
          sceneDialogue,
          context,
          {
            visualBeat: undefined, // Sera fusionné par le mixeur final
            imagePrompt: undefined,
            framing
          },
          sceneMeta.tensionState?.level || 5, // [V51] Alignement Tension
          sceneMeta.pacing || 5 // [V51] Alignement Pacing
        )
      ])

      lastVisualAnchor = visual.visualAnchor
      lastVisualBeat = visual.visualBeat

      intermediateScenes.push({
        ...sceneMeta,
        sceneNumber: i + 1,
        narration: sceneResult.narration,
        imagePrompt: visual.imagePrompt,
        visualBeat: visual.visualBeat, // [V38.0] Persist the decisive moment
        transitionType,
        animationPrompt: animMeta.animationPrompt,
        soundscape: animMeta.soundscape, // [V9.0] Cinematic Sound Design
        dialogue: sceneDialogue, // [V42.0] Include orchestrated dialogue
        acting: animMeta.acting,
        paceWeight, // [V48]
        isElliptical // [V48]
      })

      // [V8.5] PROMPT LOGGING : Capture des prompts pour audit et planning
      const stepPrefix = `scene-${i + 1}`
      await Promise.all([
        this.savePromptSnapshot(this.dialogue, `${stepPrefix}-dialogue`),
        this.savePromptSnapshot(this.screenwriter, `${stepPrefix}-screenwriter`),
        this.savePromptSnapshot(this.planner, `${stepPrefix}-planner`),
        this.savePromptSnapshot(this.animation, `${stepPrefix}-animation`)
      ])

      // [V39.0] VISUAL-TO-NARRATIVE BRIDGE : On mémorise les faits visuels pour la suite
      sceneMemories.push({
        ...sceneResult.memory,
        visualBeat: visual.visualBeat,
        imagePrompt: visual.imagePrompt,
        framing,
        spectatorCognition: impact?.cognition
      })

      // [V3.0] SECONDARY INTELLIGENCE : Mise à jour de la mémoire narrative
      for (const profile of profiles) {
        const isPresentInScene = sceneMeta.charactersInScene?.includes(profile.identifier)
        if (isPresentInScene) {
          if (!profile.narrative_memory) profile.narrative_memory = []
          profile.narrative_memory.push(`Scène ${i + 1} : ${sceneResult.narration}`)
          profile.off_screen_state = 'Actif dans la scène'
        }
      }

      // [V44] ACCUMULATION DES TRACES PHYSIQUES : On transfère les patchs dans les profils
      if (sceneMeta.simulationPatch?.charactersPatch) {
        for (const [id, patch] of Object.entries(sceneMeta.simulationPatch.charactersPatch)) {
          const profile = profiles.find((p) => p.identifier === id)
          if (profile && typeof patch === 'string' && patch.trim()) {
            if (!profile.traces) profile.traces = []
            // On ajoute une trace permanente pour cet épisode
            profile.traces.push({
              id: `trace-${i + 1}-${id}`,
              type: 'scar', // Défaut, sera raffiné par le Brain si besoin
              description: patch,
              acquiredAtScene: i + 1,
              permanent: true,
              visualImpact: 'High'
            })
          }
        }
      }

      // [V45] SEQUENTIAL MEMORY FEEDING : On commite les faits physiques dans le trackers de continuité
      if (sceneMeta.simulationPatch) {
        // Personnages
        if (sceneMeta.simulationPatch.charactersPatch) {
          const charStates = Object.entries(sceneMeta.simulationPatch.charactersPatch).map(([id, p]) => ({
            identifier: id,
            physicalState: typeof p === 'string' ? p : p.state || 'nominal',
            emotionalState: typeof p === 'string' ? 'stable' : p.emotion || 'stable'
          }))
          continuity.characters.update(charStates as any)
        }
        // Monde
        if (sceneMeta.simulationPatch.worldPatch) {
          const worldStates = Object.entries(sceneMeta.simulationPatch.worldPatch).map(([id, p]) => ({
            locationId: id,
            currentState: p,
            modifications: [] // TODO: Extract more detail if available
          }))
          continuity.locations.update(worldStates as any)
        }
      }

      const lastScene = intermediateScenes.at(-1)

      // [V4] Multimodal Post-Generation Audit (Optional / High-Fidelity Mode)
      if (options.brainMode === 'all' && lastScene.imageUrl) {
        console.info(`[VimaxAgent] 👁️ Audit Visuel V4 (Multimodal) pour la scène ${i + 1}...`)
        const report = await this.brain.visionAuditor.auditImage(
          lastScene.imageUrl,
          lastScene.narration,
          profiles.map((p) => p.identifier),
          this.planner.getStyleLock() || undefined
        )
        if (!report.isValid) {
          console.warn(`[VimaxAgent] 🚨 Défaut Visuel Majeur détecté post-rendu : ${report.issues.join(', ')}`)
          // En V4, on enregistre cet échec dans le cerveau multimodal pour apprentissage immédiat
          await this.brain.autonomousLearning({ seriesId: this.planner.getSeriesId() })
        }
      }

      await this.registry.triggerHook('onAfterScene', this, lastScene)
    }

    // [V48] Calcul des durées pondérées (Dynamic Pacing Model)
    const totalWeight = intermediateScenes.reduce((acc, s) => acc + (s.paceWeight || 1), 0)
    const targetTotal = options.targetDuration || 60
    const timePerWeight = targetTotal / totalWeight

    let currentStartTime = 0
    const finalScenes = intermediateScenes.map((s, idx) => {
      const duration = (s.paceWeight || 1) * timePerWeight
      const scene = {
        ...s,
        id: `scene-${idx + 1}`,
        duration,
        startTime: currentStartTime
      }
      currentStartTime += duration
      return scene
    }) as VimaxScene[]

    return { scenes: finalScenes, lastAnchor: lastVisualAnchor }
  }

  private async saveIntermediate(name: string, data: any): Promise<void> {
    try {
      const seriesId = this.planner.getSeriesId() || 'pending'
      const logDir = path.join(process.cwd(), 'vimax-logs', 'sagas', seriesId, 'intermediate')
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
      const promptDir = path.join(process.cwd(), 'vimax-logs', 'sagas', seriesId, 'prompts')
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
