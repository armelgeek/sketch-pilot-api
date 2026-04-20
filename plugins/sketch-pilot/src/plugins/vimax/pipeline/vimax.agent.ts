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
import { VimaxScreenwriter } from '../agents/vimax-screenwriter.agent'
import { VimaxScriptEnhancer } from '../agents/vimax-script-enhancer.agent'
import { VimaxBrain } from '../core/vimax-brain'
import { VimaxContinuityEngine } from '../core/vimax-continuity.engine'
import type { LLMService } from '../core/llm.interface'
import type {
  CharacterProfile,
  PipelineProfile,
  ReviewGate,
  SceneMemory,
  SeriesContext,
  StyleLock,
  VimaxEpisode,
  VimaxEvent,
  VimaxRunOptions,
  VimaxScene,
  VimaxScreenplay,
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
    this.enhancer = new VimaxScriptEnhancer(llm)
    this.characterExtractor = new VimaxCharacterExtractor(llm)
    this.dialogue = new VimaxDialogueAgent(llm)
    this.animation = new VimaxAnimationAgent(llm)
    this.auditor = new VimaxContinuityAuditor(llm)
    this.inputSanitizer = new VimaxInputSanitizerAgent(llm)
    this.outputFormatter = new VimaxOutputFormatterAgent(llm)
    this.brain = new VimaxBrain(llm)
  }

  /**
   * Pipeline Complet : De l'idée à la série d'épisodes développés.
   */
  async runSaga(basicIdea: string, options: VimaxRunOptions = {}): Promise<VimaxSeries> {
    // 0. Input Sanitation (Rigueur 5.0)
    const analysis = await this.inputSanitizer.analyze(basicIdea)
    if (!analysis.isViable) {
      throw new Error(
        `Idée non viable : ${analysis.issues.join(', ')}. Suggestions : ${analysis.suggestions.join(', ')}`
      )
    }
    const finalIdea = analysis.enrichedIdea

    // Pass 0 : Planification globale
    const seriesId = options.seriesId || `series-${Date.now()}`
    this.getAllAgents().forEach((agent) => agent.setSeriesId(seriesId))

    const plan = await this.planner.planSaga(finalIdea, options)
    await this.saveIntermediate('pass0-plan', plan)
    await this.triggerReview('post-script', plan, options)

    // Pass 1 : Découpage en épisodes (VimaxEventExtractor)
    const episodeEvents = await this.eventExtractor.extractEvents(
      plan.script,
      'series',
      options.targetDuration,
      options.maxScenes,
      options.targetEpisodeCount
    )
    await this.saveIntermediate('pass1-episode-events', episodeEvents)

    const episodes: VimaxEpisode[] = []
    const seriesContext: SeriesContext = {
      ...options.seriesContext,
      intent: plan.intent,
      previousEpisodes: []
    }

    let lastEpisodeBridge: VimaxAgent['compressor'] extends {
      extractEpisodeBridge: (...args: any[]) => Promise<infer R>
    }
      ? R
      : any = null

    for (const [i, event] of episodeEvents.entries()) {
      // Pass the bridge to the next episode
      if (lastEpisodeBridge) {
        seriesContext.lastEpisodeBridge = lastEpisodeBridge
      }

      const episode = await this.runEpisode(event, i, seriesContext, options)
      episodes.push(episode)

      // Update context for next episode
      seriesContext.previousEpisodes?.push(episode.narration)
      if (seriesContext.previousEpisodes!.length > (options.compressionThreshold || 3)) {
        const compressed = await this.compressor.compress(seriesContext.previousEpisodes!.join('\n\n'))
        seriesContext.previousEpisodes = [compressed]
      }

      // Extract bridge for next episode
      lastEpisodeBridge = await this.compressor.extractEpisodeBridge(episode.narration)
    }

    // Pass 6 : Auto-Apprentissage via VimaxBrain
    try {
      console.log("\n[VIMAX_BRAIN] Lancement du cycle d'auto-amélioration...")
      await this.brain.autonomousLearning()
    } catch (learnError) {
      console.warn("[VimaxAgent] Échec du cycle d'auto-apprentissage (non bloquant) :", learnError)
    }

    return {
      id: `saga-${Date.now()}`,
      title: typeof plan.intent === 'string' ? plan.intent : plan.intent.title || 'Saga sans titre',
      intent: plan.intent,
      expandedScript: plan.script,
      enhancedScript: plan.script,
      episodes,
      context: seriesContext
    }
  }

  /**
   * Génère un épisode complet (Narration + Screenplay).
   */
  private async runEpisode(
    event: VimaxEvent,
    index: number,
    context: SeriesContext,
    options: VimaxRunOptions
  ): Promise<VimaxEpisode> {
    const prefix = `episode-${index + 1}`

    // 1. Narration complète de l'épisode (Pass 1)
    const fullNarration = await this.narration.generateEpisodeNarration(event, context)
    await this.saveIntermediate(`${prefix}-pass1-narration`, fullNarration)

    // 2. Raffinement du script (Pass 1.5)
    const enhancedScript = await this.enhancer.enhance(fullNarration)
    await this.saveIntermediate(`${prefix}-pass1.5-enhanced`, enhancedScript)
    await this.triggerReview('post-narration', enhancedScript, options)

    // 3. Extraction des profils personnages (Pass 2.1)
    const profiles = await this.characterExtractor.extractCharacters(enhancedScript)
    await this.saveIntermediate(`${prefix}-pass2.1-profiles`, profiles)

    // 4. Découpage en scènes (Pass 2.2)
    const sceneEvents = await this.eventExtractor.extractEvents(
      enhancedScript,
      'episode',
      options.targetDuration,
      options.maxScenes
    )
    await this.saveIntermediate(`${prefix}-pass2.2-scene-events`, sceneEvents)

    const continuity = new VimaxContinuityEngine()
    if (context.lastEpisodeBridge) {
      continuity.setBridge(context.lastEpisodeBridge)
    }

    // StyleLock (Rigueur 5.0)
    const styleLock: StyleLock = {
      visualStyle: options.visualStyle || 'cinematic hyper-realistic animation',
      colorPalette: options.colorPalette || ['deep blues', 'vibrant oranges'],
      forbiddenTerms: ['cartoon', 'sketchy', 'amateur', 'blurry'],
      mandatoryTerms: ['high resolution', '8k', 'volumetric lighting', 'cinematic grain']
    }
    this.planner.setStyleLock(styleLock)

    // 5. Génération individuelle des scènes (Pass 2.x - 3.x)
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

    const screenplay: VimaxScreenplay = {
      title: event.description,
      tensionCurve: [], // Sera rempli ou calculé
      seriesMetadata: {
        episodeSummary: enhancedScript.slice(0, 200),
        cliffhanger: { type: 'unknown', description: 'Suspendu', audienceQuestion: 'Que va-t-il se passer ?' },
        characterContinuity: {},
        locationContinuity: {}
      },
      titles: [event.description],
      scenes
    }

    await this.saveIntermediate(`${prefix}-pass3-screenplay`, screenplay)

    // 6. Audit final de continuité (Rigueur 2.0)
    const auditReport = await this.auditor.audit(scenes)
    await this.saveIntermediate(`${prefix}-pass4-continuity-audit`, auditReport)

    // 7. Formatage Final (Rigueur 5.0)
    const formattedResult = await this.outputFormatter.format(screenplay)
    await this.saveIntermediate(`${prefix}-pass5-formatted`, formattedResult)

    return {
      id: `ep-${index}-${Date.now()}`,
      episodeNumber: index,
      summary: `${enhancedScript.slice(0, 50)}...`,
      scenes,
      eventIndex: index,
      eventDescription: event.description,
      narration: enhancedScript,
      characterProfiles: profiles,
      screenplay,
      continuityReport: auditReport
    }
  }

  /**
   * PerformanceProfiler (Rigueur 5.0)
   * Collecte les métriques de tous les agents du pipeline.
   */
  public getPipelineMetrics(): PipelineProfile {
    const allAgents = [
      this.planner,
      this.narration,
      this.screenwriter,
      this.eventExtractor,
      this.compressor,
      this.enhancer,
      this.characterExtractor,
      this.dialogue,
      this.animation,
      this.auditor,
      this.inputSanitizer,
      this.outputFormatter
    ]

    let totalLLMCalls = 0
    let totalTokensEstimated = 0
    let durationMs = 0
    let bottleneckAgent = 'none'
    let maxDuration = 0

    for (const agent of allAgents) {
      const m = agent.getMetrics()
      totalLLMCalls += m.calls
      totalTokensEstimated += m.estimatedTokens
      durationMs += m.durationMs
      if (m.durationMs > maxDuration) {
        maxDuration = m.durationMs
        bottleneckAgent = agent.constructor.name
      }
    }

    return {
      totalLLMCalls,
      totalTokensEstimated,
      bottleneckAgent,
      costEstimateUSD: Number((totalTokensEstimated * 0.000002).toFixed(6)), // Estimation gpt-4o relative
      scenesRetried: this.metrics.retries,
      durationMs
    }
  }

  /**
   * ReviewGate (Rigueur 5.0)
   * Point de validation humaine optionnel (simulation/stubs).
   */
  private async triggerReview(stage: ReviewGate['stage'], data: any, options: VimaxRunOptions) {
    if (!options.reviewGates?.includes(stage)) return

    console.log(`\n[REVIEW_GATE] Suspension du pipeline pour relecture : ${stage.toUpperCase()}`)
    // Dans un environnement interactif réel, on utiliserait notify_user ici.
    // Pour cette implémentation, on loggue et on continue si le score de confiance est suffisant.
  }

  /**
   * Construit les scènes une à une avec continuité.
   * Par event :
   *   1. Narration courte        (VimaxNarrationAgent)
   *   2. imagePrompt motion      (VimaxSagaPlanner) — profils personnages injectés
   *   3. Métadonnées cinéma      (VimaxScreenwriter)
   *   4. Assemblage POJO final
   */
  private async buildScenes(
    sceneEvents: VimaxEvent[],
    context: SeriesContext,
    characterContext: string,
    profiles: CharacterProfile[],
    continuity: VimaxContinuityEngine,
    targetDuration?: number,
    maxScenes?: number
  ): Promise<VimaxScene[]> {
    const intermediateScenes: VimaxScene[] = []
    const sceneMemories: SceneMemory[] = []
    let lastVisualAnchor: VisualAnchorState | null = null

    // Hardening 2.0 : Courbe de tension pré-calculée via le moteur
    const tensionCurve = continuity.tension.buildCurve(sceneEvents.length, context.intent || 'narrative')

    for (let i = 0; i < sceneEvents.length; i++) {
      const event = sceneEvents[i]
      const isActuallyLast = i === sceneEvents.length - 1

      // Injection de la tension cible dans l'event
      const eventWithTension = {
        ...event,
        description: `${event.description} [CIBLE TENSION: ${tensionCurve[i]}/10]`
      }

      // IntentDriftDetector — Rappel d'intention après la scène 2
      const intent = context.intent || 'narrative'
      const intentStr = typeof intent === 'string' ? intent : intent.tone || 'narrative'
      const intentReminder =
        i + 1 > 2
          ? `[RAPPEL INTENT : ${intentStr.toUpperCase()}] Tu génères une scène de type "${intentStr}". Vérifie que cette scène respecte les codes de ce format.`
          : ''

      // SceneBudgetManager — Gestion du budget de contexte
      // On compresse les mémoires anciennes pour éviter l'explosion de tokens
      const effectiveMemories = sceneMemories.length > 3 ? sceneMemories.slice(-3) : sceneMemories

      // 1. Narration courte de la scène (Pass 1) — avec MÉMOIRE 2.0 (Engine)
      const continuityBlock = continuity.formatFullContinuityBlock()
      const tensionBlock = continuity.tension.formatForPrompt(i + 1, sceneEvents.length, tensionCurve)

      const narrationResult = await this.narration.generateSceneNarration(
        eventWithTension,
        context,
        targetDuration ? `${Math.round(targetDuration / sceneEvents.length)} mots` : undefined,
        maxScenes,
        isActuallyLast,
        effectiveMemories,
        i + 1,
        sceneEvents.length,
        continuityBlock,
        tensionBlock,
        intentReminder
      )

      let { narration, memory } = narrationResult

      // Point 1 : Correction immédiate (Rigueur 3.0)
      let validation = await this.auditor.validateAndCorrect(
        narration,
        sceneMemories,
        continuity.characters.getCurrentStates()
      )

      let retryVal = 0
      while (!validation.isValid && retryVal < 2) {
        const retryResult = await this.narration.generateSceneNarration(
          eventWithTension,
          context,
          undefined,
          maxScenes,
          isActuallyLast,
          effectiveMemories,
          i + 1,
          sceneEvents.length,
          `${continuityBlock}\n\n[RECTIFICATION REQUISE PAR LE SUPERVISEUR]\n${validation.issues.join('\n')}`,
          tensionBlock,
          intentReminder
        )
        narration = retryResult.narration
        memory = retryResult.memory

        validation = await this.auditor.validateAndCorrect(
          narration,
          sceneMemories,
          continuity.characters.getCurrentStates()
        )
        retryVal++
      }

      if (validation.correctedNarration) {
        narration = validation.correctedNarration
      }

      if (validation.correctedNarration) {
        narration = validation.correctedNarration
      }

      // Verrouillage de la Narration ✅ (A partir d'ici, narration ne bouge plus)

      // 2. dialogue percutant (Pass 2.5) — avec timing relatif et MÉMOIRE DE VOIX
      let sceneDialogue = await this.dialogue.generateDialogue(
        narration,
        event.description,
        context,
        continuity.voices.getVoiceHistories()
      )

      // 3. Animation et Acting (Pass 2.2)
      const animMeta = await this.animation.generateAnimation(narration, event.description, sceneDialogue, context)

      // 4. imagePrompt cinématique (Identifiants @Nom uniquement) + ANCHORING
      const characterList = (profiles || []).map((p) => `${p.identifier}`).join(', ')
      const plannerResult = await this.planner.generateImagePrompt(
        narration,
        characterList,
        lastVisualAnchor,
        isActuallyLast
      )
      let imagePrompt = plannerResult.imagePrompt
      const visualAnchor = plannerResult.visualAnchor
      lastVisualAnchor = visualAnchor

      // 5. Métadonnées cinématiques
      const meta = await this.screenwriter.generateSceneMeta(
        narration,
        event.description,
        imagePrompt,
        i + 1,
        sceneEvents.length,
        context,
        isActuallyLast
      )

      // POINT 3 : CrossLayerValidator (Rigueur 3.0) — Cohérence visuel/texte
      const crossAudit = await this.auditor.crossLayerAudit(
        narration,
        imagePrompt,
        meta.cameraAction,
        sceneDialogue,
        animMeta.animationPrompt
      )
      if (crossAudit.patches.imagePrompt) imagePrompt = crossAudit.patches.imagePrompt
      if (crossAudit.patches.cameraAction) meta.cameraAction = crossAudit.patches.cameraAction
      if (crossAudit.patches.dialogue) sceneDialogue = crossAudit.patches.dialogue
      if (crossAudit.patches.animationPrompt) animMeta.animationPrompt = crossAudit.patches.animationPrompt

      // Point 4 : SimulationPatchConsistency — Application forcée de l'état (Rigueur 3.0)
      if (meta.simulationPatch) {
        if (meta.simulationPatch.charactersPatch) {
          // Conversion de Record<string, Partial<CharacterState>> en CharacterState[]
          const newCharStates = Object.entries(meta.simulationPatch.charactersPatch).map(
            ([id, patch]) =>
              ({
                identifier: id,
                ...(patch as any)
              }) as any
          )
          continuity.characters.update(newCharStates)
        }
        if (meta.simulationPatch.worldPatch) {
          const newLocStates = Object.entries(meta.simulationPatch.worldPatch).map(
            ([id, patch]) =>
              ({
                locationId: id,
                ...(patch as any)
              }) as any
          )
          continuity.locations.update(newLocStates)
        }
      }

      // Mise à jour finale des trackers via le moteur (Legacy + Patch)
      if (memory.role) continuity.roles.register(memory.role)
      if (memory.plotContract) continuity.plots.update(memory.plotContract)
      continuity.voices.update(sceneDialogue.map((d) => ({ character: d.character, text: d.text, acting: d.acting })))

      const sceneToPush = {
        sceneNumber: i + 1,
        narration,
        sceneDialogue,
        animationPrompt: animMeta.animationPrompt,
        acting: animMeta.acting,
        imagePrompt,
        meta
      } as any

      // MetadataCompleteness & CulturalGuard (Rigueur 5.0)
      const metaCheck = await this.auditor.validateMetadata(sceneToPush)
      if (!metaCheck.isValid) {
        console.warn(`[VimaxAgent] Scène ${i + 1} incomplète : ${metaCheck.issues.join(', ')}`)
      }

      // On s'assure que la mémoire poussée vers l'historique contient la narration et les états FINAUX
      memory.summary = narration.slice(0, 100)
      memory.lastAction = narration.split('.').at(-1)?.trim() || ''
      memory.tensionLevel = tensionCurve[i]
      sceneMemories.push(memory)

      intermediateScenes.push({
        sceneNumber: i + 1,
        narration,
        sceneDialogue,
        animationPrompt: animMeta.animationPrompt,
        acting: animMeta.acting,
        imagePrompt,
        meta
      } as any)

      // Point 2 : Audit de mi-parcours (Rigueur 3.0)
      const midpoint = Math.floor(sceneEvents.length / 2)
      if (i === midpoint && i > 0) {
        const midpointReport = await this.auditor.midpointAudit(intermediateScenes as any, tensionCurve, [
          continuity.plots.getContract()
        ])
        if (midpointReport.scenesToRegenerate.length > 0 || midpointReport.globalIssues.length > 0) {
          // Log de l'audit de mi-parcours
          await this.saveIntermediate(`episode-midpoint-audit`, midpointReport)
        }
      }
    }

    // Point 3 : Audit final & Patching (Rigueur 3.0)
    const finalAudit = await this.auditor.finalAuditEnhanced(intermediateScenes as any)
    if (!finalAudit.approved && finalAudit.scenesToPatch && finalAudit.scenesToPatch.length > 0) {
      for (const patchEntry of finalAudit.scenesToPatch) {
        const sceneNumber = patchEntry.sceneNumber || patchEntry.sceneIndex
        const sceneToPatch = (intermediateScenes as any[]).find((s) => s.sceneNumber === sceneNumber)
        if (sceneToPatch) {
          // Application du patch (narration ou meta)
          Object.assign(sceneToPatch, patchEntry.patch)
        }
      }
    }

    // 5. Calcul précis de la Timeline (Raccord temporel)
    const totalWords = intermediateScenes.reduce((acc, s) => acc + s.narration.split(/\s+/).filter(Boolean).length, 0)
    const durationFactor = (targetDuration || 60) / (totalWords || 1)

    let currentTime = 0
    return (intermediateScenes as any[]).map((raw) => {
      const sceneWords = raw.narration.split(/\s+/).filter(Boolean).length
      const duration = Number((sceneWords * durationFactor).toFixed(2))
      const startTime = Number(currentTime.toFixed(2))
      currentTime += duration

      return {
        id: `scene-${raw.sceneNumber}`,
        sceneNumber: raw.sceneNumber,
        narration: raw.narration,
        imagePrompt: raw.imagePrompt,
        dialogue: raw.dialogue,
        duration,
        startTime,
        animationPrompt: raw.animationPrompt,
        acting: raw.acting,
        ...raw.meta
      } as VimaxScene
    })
  }

  /**
   * Sauvegarde les données intermédiaires dans vimax-logs/.
   */
  private async saveIntermediate(name: string, data: any): Promise<void> {
    try {
      const logDir = path.join(process.cwd(), 'vimax-logs')
      await fs.mkdir(logDir, { recursive: true })

      // Sauvegarde JSON
      const jsonPath = path.join(logDir, `${name}.json`)
      await fs.writeFile(jsonPath, JSON.stringify(data, null, 2), 'utf8')

      // Sauvegarde Texte (si c'est un objet complexe on stringifie, sinon on prend brut)
      const textPath = path.join(logDir, `${name}.txt`)
      let textContent = ''

      if (typeof data === 'string') {
        textContent = data
      } else if (data.script) {
        textContent = data.script
      } else if (data.narration) {
        textContent = data.narration
      } else {
        textContent = JSON.stringify(data, null, 2)
      }

      await fs.writeFile(textPath, textContent, 'utf8')
    } catch (error) {
      console.warn(`[VimaxAgent] Échec de la sauvegarde intermédiaire "${name}":`, error)
    }
  }

  private getAllAgents(): any[] {
    return [
      this.planner,
      this.narration,
      this.screenwriter,
      this.eventExtractor,
      this.compressor,
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
