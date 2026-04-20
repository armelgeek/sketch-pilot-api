import fs from 'node:fs/promises'
import path from 'node:path'
import { VimaxAnimationAgent } from '../agents/vimax-animation.agent'
import { VimaxCharacterExtractor } from '../agents/vimax-character-extractor.agent'

import { VimaxDialogueAgent } from '../agents/vimax-dialogue.agent'
import { VimaxEventExtractor } from '../agents/vimax-event-extractor.agent'
import { VimaxNarrationAgent } from '../agents/vimax-narration.agent'
import { VimaxSagaCompressor } from '../agents/vimax-saga-compressor.agent'
import { VimaxSagaPlanner } from '../agents/vimax-saga-planner.agent'
import { VimaxScreenwriter } from '../agents/vimax-screenwriter.agent'
import { VimaxScriptEnhancer } from '../agents/vimax-script-enhancer.agent'
import type { LLMService } from '../core/llm.interface'
import type {
  CharacterProfile,
  SagaIntent,
  SeriesContext,
  VimaxEpisode,
  VimaxEvent,
  VimaxRunOptions,
  VimaxScene,
  VimaxScreenplay,
  VimaxSeries
} from '../types'

// ─────────────────────────────────────────────
// VimaxAgent — Orchestrateur principal du pipeline
//
// Pipeline complet :
//
//   basicIdea
//     → VimaxSagaPlanner              (routing + amplification)
//     → VimaxScriptEnhancer           (précision sensorielle + spatiale)
//     → VimaxEventExtractor [série]   (découpage en épisodes)
//     → Par épisode event :
//         VimaxSagaCompressor         (compression historique si nécessaire)
//         VimaxNarrationAgent         (Pass 1 : narration brute épisode)
//         VimaxCharacterExtractor     (profils visuels personnages)
//         VimaxEventExtractor [épis.] (découpage narration en scènes)
//         → Par scène event :
//             VimaxNarrationAgent     (narration courte scène)
//             VimaxSagaPlanner        (imagePrompt motion)
//             VimaxScreenwriter       (métadonnées cinématiques)
//         VimaxScreenwriter           (métadonnées épisode)
// ─────────────────────────────────────────────

export class VimaxAgent {
  protected readonly planner: VimaxSagaPlanner
  protected readonly enhancer: VimaxScriptEnhancer
  protected readonly extractor: VimaxEventExtractor
  protected readonly characterExtractor: VimaxCharacterExtractor
  protected readonly narration: VimaxNarrationAgent
  protected readonly dialogue: VimaxDialogueAgent
  protected readonly compressor: VimaxSagaCompressor
  protected readonly screenwriter: VimaxScreenwriter
  protected readonly animation: VimaxAnimationAgent

  constructor(protected readonly llm: LLMService) {
    this.planner = new VimaxSagaPlanner(llm)
    this.enhancer = new VimaxScriptEnhancer(llm)
    this.extractor = new VimaxEventExtractor(llm)
    this.characterExtractor = new VimaxCharacterExtractor(llm)
    this.narration = new VimaxNarrationAgent(llm)
    this.dialogue = new VimaxDialogueAgent(llm)
    this.compressor = new VimaxSagaCompressor(llm)
    this.screenwriter = new VimaxScreenwriter(llm)
    this.animation = new VimaxAnimationAgent(llm)
  }

  // ─── Public API ──────────────────────────────

  /**
   * Pipeline complet : idea → série complète d'épisodes structurés.
   *
   * @param basicIdea  L'idée brute (phrase, paragraphe, pitch)
   * @param options    Contexte série + seuil de compression
   */
  async runSeries(basicIdea: string, options: VimaxRunOptions = {}): Promise<VimaxSeries> {
    const { seriesContext = {}, compressionThreshold = 3, targetDuration, maxScenes } = options
    console.log(`[VimaxAgent] Durée cible : ${targetDuration ? `${targetDuration}s` : 'non spécifiée'}`)
    console.log(`[VimaxAgent] Max Scènes : ${maxScenes ?? 'non spécifié'}`)

    let intent: SagaIntent = options.intent || 'narrative'
    let expandedScript = ''
    let enhancedScript = ''
    let seriesEvents: VimaxEvent[] = []

    if (options.manualEpisodes && options.manualEpisodes.length > 0) {
      console.log(`[VimaxAgent] Étape 1 : Manuel — Utilisation de ${options.manualEpisodes.length} épisodes demandés.`)
      seriesEvents = options.manualEpisodes.map((desc, i) => ({
        index: i,
        description: desc,
        processChain: [desc],
        isLast: i === options.manualEpisodes!.length - 1
      }))
      expandedScript = options.manualEpisodes.join('\n\n')
      enhancedScript = expandedScript
    } else {
      // Étape 1 — SagaPlanner : routing + amplification
      console.log(`[VimaxAgent] Étape 1 : Planification de la saga...`)
      const sagaPlan = await this.planner.planSaga(basicIdea, options)
      console.log(`[VimaxAgent] Intent : ${sagaPlan.intent}`)
      intent = sagaPlan.intent
      expandedScript = sagaPlan.script
      await this.saveIntermediate('pass0_plan', sagaPlan)

      // Étape 2 — ScriptEnhancer : précision sensorielle + spatiale
      console.log(`[VimaxAgent] Étape 2 : Enrichissement du script...`)
      enhancedScript = await this.enhancer.enhance(expandedScript)
      await this.saveIntermediate('pass1_enhanced', { script: enhancedScript })
    }

    seriesContext.intent = intent

    // Nouveau — Découverte Globale des Personnages (Vision de la série entière)
    console.log(`[VimaxAgent] Étape 2b : Découverte globale des personnages...`)
    const globalCharacters = await this.characterExtractor.extractCharacters(enhancedScript)
    console.log(`[VimaxAgent] ${globalCharacters.length} personnages identifiés pour la série.`)
    seriesContext.characterProfiles = [...(seriesContext.characterProfiles || []), ...globalCharacters]
    await this.saveIntermediate('pass1_global_characters', globalCharacters)

    if (seriesEvents.length === 0) {
      // Étape 3 — EventExtractor niveau série : découpe en épisodes
      console.log(`[VimaxAgent] Étape 3 : Extraction des événements de la série...`)
      seriesEvents = await this.extractor.extractEvents(
        enhancedScript,
        'series',
        targetDuration,
        maxScenes,
        options.targetEpisodeCount
      )
      console.log(`[VimaxAgent] Nombre d'épisodes détectés : ${seriesEvents.length}`)
      await this.saveIntermediate('pass2_series_events', seriesEvents)
    }

    // Étape 4 — Par épisode
    const episodes: VimaxEpisode[] = []
    const episodeSummaries: string[] = []

    for (const event of seriesEvents) {
      console.log(`\n🎬 [VimaxAgent] Génération de l'épisode ${event.index + 1}/${seriesEvents.length}...`)
      console.log(`[VimaxAgent] Description : ${event.description}`)
      // Compression automatique de l'historique si trop volumineux
      const compressedHistory = await this.compressor.compressSeriesHistory(episodeSummaries, compressionThreshold)

      const episodeContext: SeriesContext = {
        ...seriesContext,
        previousEpisodes: compressedHistory ? [compressedHistory] : []
      }

      // Répartition du budget pour cet épisode
      const epTargetDuration = targetDuration ? targetDuration / seriesEvents.length : undefined
      // Note: On passe maxScenes tel quel car l'utilisateur demande 8 scènes PAR épisode (instruction orale)
      // mais techniquement maxScenes dans l'objet d'options est souvent un total.
      // On va considérer que maxScenes dans runEpisode est le budget par épisode.
      const episode = await this.runEpisode(event, episodeContext, epTargetDuration, maxScenes)
      episodes.push(episode)

      // Capturer le "raccord" (la dernière narration de cet épisode) pour le suivant
      const lastScene = episode.screenplay.scenes.at(-1)
      seriesContext.lastEpisodeHook = lastScene ? lastScene.narration : undefined

      // Accumule le résumé pour les épisodes suivants
      episodeSummaries.push(episode.screenplay.seriesMetadata.episodeSummary)
    }

    return {
      intent,
      expandedScript,
      enhancedScript,
      episodes
    }
  }

  /**
   * Génération incrémentale d'un épisode avec mise à jour automatique de la continuité.
   * Cette méthode est le point d'entrée pour un flux "épisode par épisode".
   *
   * @param seriesEvent L'événement (pitch) de l'épisode à générer
   * @param options     Options incluant le contexte actuel (bible, historique, etc.)
   */
  async runNextEpisode(
    seriesEvent: VimaxEvent,
    options: VimaxRunOptions = {}
  ): Promise<{ episode: VimaxEpisode; updatedContext: SeriesContext }> {
    const { seriesContext = {}, targetDuration, maxScenes } = options

    console.log(`\n🚀 [VimaxAgent] Génération incrémentale : Épisode ${seriesEvent.index + 1}`)
    console.log(`[VimaxAgent] Description : ${seriesEvent.description}`)

    // 1. Génération de l'épisode
    const episode = await this.runEpisode(seriesEvent, seriesContext, targetDuration, maxScenes)

    // 2. Évolution automatique du contexte (Continuité)
    const { seriesMetadata } = episode.screenplay
    const { episodeSummary, characterContinuity, locationContinuity } = seriesMetadata

    const updatedContext: SeriesContext = {
      ...seriesContext,
      // Mise à jour de l'historique narratif
      previousEpisodes: [...(seriesContext.previousEpisodes || []), episodeSummary],
      // Capturer le "raccord" pour le prochain épisode incrémental
      lastEpisodeHook: episode.screenplay.scenes.at(-1)?.narration,
      // Mise à jour des registres de vérité (character/location registries)
      characterRegistry: {
        ...((seriesContext.characterRegistry as Record<string, unknown>) || {}),
        ...characterContinuity
      },
      locationRegistry: {
        ...((seriesContext.locationRegistry as Record<string, unknown>) || {}),
        ...locationContinuity
      },
      // Préservation des profils visuels permanents pour le prochain épisode
      characterProfiles: [
        ...(seriesContext.characterProfiles || []),
        ...episode.characterProfiles.filter(
          (p) => !(seriesContext.characterProfiles || []).some((cp) => cp.identifier === p.identifier)
        )
      ]
    }

    console.log(`[VimaxAgent] Continuité mise à jour pour le prochain épisode.`)

    return { episode, updatedContext }
  }

  /**
   * Pipeline épisode uniquement depuis un event de série.
   * Inclut : narration, extraction personnages, scènes complètes.
   */
  async runEpisode(
    seriesEvent: VimaxEvent,
    context: SeriesContext = {},
    targetDuration?: number,
    maxScenes?: number
  ): Promise<VimaxEpisode> {
    // Pass 1 — Narration brute de l'épisode
    console.log(`   [Pass 1] Génération de la narration brute...`)
    const episodeNarration = await this.narration.generateEpisodeNarration(
      seriesEvent,
      context,
      targetDuration,
      maxScenes
    )
    await this.saveIntermediate(`episode_${seriesEvent.index + 1}_pass1_narration`, { narration: episodeNarration })

    // Extraction et fusion des profils visuels des personnages
    console.log(`   [Pass 2] Extraction et fusion des personnages...`)
    const localProfiles = await this.characterExtractor.extractCharacters(episodeNarration)

    // Fusion : on garde les profils du contexte (globuax) et on ajoute/met à jour avec les locaux
    const mergedProfiles = [
      ...(context.characterProfiles || []),
      ...localProfiles.filter((lp) => !(context.characterProfiles || []).some((cp) => cp.identifier === lp.identifier))
    ]

    const characterContext = this.characterExtractor.formatForPrompt(mergedProfiles)
    console.log(`   [Pass 2] Personnages actifs : ${localProfiles.map((p) => p.identifier).join(', ')}`)
    await this.saveIntermediate(`episode_${seriesEvent.index + 1}_pass2_characters`, mergedProfiles)

    // Contexte enrichi avec les profils fusionnés
    const enrichedContext: SeriesContext = { ...context, characterProfiles: mergedProfiles }

    // Découpage de la narration en scènes
    console.log(`   [Pass 2] Découpage en scènes...`)
    const sceneEvents = await this.extractor.extractEvents(episodeNarration, 'episode', targetDuration, maxScenes)
    console.log(`   [Pass 2] Nombre de scènes : ${sceneEvents.length}`)
    await this.saveIntermediate(`episode_${seriesEvent.index + 1}_pass2_scene_events`, sceneEvents)

    // Assemblage des scènes
    console.log(`   [Pass 3] Assemblage des scènes complètes...`)
    const scenes = await this.buildScenes(
      sceneEvents,
      enrichedContext,
      characterContext,
      mergedProfiles,
      targetDuration,
      maxScenes
    )
    await this.saveIntermediate(`episode_${seriesEvent.index + 1}_pass3_scenes`, scenes)

    // Métadonnées épisode (summary, cliffhanger, continuité)
    console.log(`   [Pass 3] Génération des métadonnées de l'épisode...`)
    const episodeMeta = await this.screenwriter.generateEpisodeMeta(scenes, enrichedContext)
    await this.saveIntermediate(`episode_${seriesEvent.index + 1}_pass3_meta`, episodeMeta)

    const screenplay: VimaxScreenplay = { ...episodeMeta, scenes }

    console.log(`   ✅ Épisode ${seriesEvent.index + 1} terminé.`)

    return {
      eventIndex: seriesEvent.index,
      eventDescription: seriesEvent.description,
      narration: episodeNarration,
      characterProfiles: mergedProfiles,
      screenplay
    }
  }

  /**
   * Pipeline depuis une narration déjà produite (bypass Pass 1 et SagaPlanner).
   * Utile pour régénérer les scènes sans relancer toute la chaîne.
   */
  async runFromNarration(narration: string, context: SeriesContext = {}): Promise<VimaxScreenplay> {
    const characterProfiles = await this.characterExtractor.extractCharacters(narration)
    const characterContext = this.characterExtractor.formatForPrompt(characterProfiles)
    const enrichedContext: SeriesContext = { ...context, characterProfiles }

    const sceneEvents = await this.extractor.extractEvents(narration, 'episode')
    const scenes = await this.buildScenes(sceneEvents, enrichedContext, characterContext, characterProfiles)
    const episodeMeta = await this.screenwriter.generateEpisodeMeta(scenes, enrichedContext)

    return { ...episodeMeta, scenes }
  }

  // ─── Private ─────────────────────────────────

  /**
   * Construit les scènes complètes depuis les events de scène.
   *
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
    targetDuration?: number,
    maxScenes?: number
  ): Promise<VimaxScene[]> {
    const intermediateScenes: any[] = []
    let sceneCounter = 1
    let lastImagePrompt = ''

    for (let i = 0; i < sceneEvents.length; i++) {
      const event = sceneEvents[i]
      const isActuallyLast = i === sceneEvents.length - 1

      // 1. Narration courte de la scène
      const sceneNarration = await this.narration.generateSceneNarration(
        event,
        context,
        targetDuration,
        maxScenes,
        isActuallyLast
      )

      // 2. dialogue percutant (Pass 2.5) — avec timing relatif
      const sceneDialogue = await this.dialogue.generateDialogue(sceneNarration, event.description, context)

      // 3. Animation et Acting (Pass 2.2)
      const animMeta = await this.animation.generateAnimation(sceneNarration, event.description, sceneDialogue, context)

      // 4. imagePrompt cinématique (Identifiants @Nom uniquement) + ANCHORING
      const characterList = (profiles || []).map((p) => `${p.identifier}`).join(', ')
      const imagePrompt = await this.planner.generateImagePrompt(sceneNarration, characterList, lastImagePrompt)
      lastImagePrompt = imagePrompt

      // 5. Métadonnées cinématiques
      const meta = await this.screenwriter.generateSceneMeta(
        sceneNarration,
        event.description,
        imagePrompt,
        sceneCounter,
        context,
        isActuallyLast
      )

      intermediateScenes.push({
        event,
        sceneNumber: sceneCounter,
        sceneNarration,
        sceneDialogue,
        animationPrompt: animMeta.animationPrompt,
        acting: animMeta.acting,
        imagePrompt,
        meta
      })
      sceneCounter++
    }

    // 5. Calcul précis de la Timeline (Raccord temporel)
    const totalWords = intermediateScenes.reduce(
      (acc, s) => acc + s.sceneNarration.split(/\s+/).filter(Boolean).length,
      0
    )
    const durationFactor = (targetDuration || 60) / (totalWords || 1)

    let currentTime = 0
    return intermediateScenes.map((raw) => {
      const sceneWords = raw.sceneNarration.split(/\s+/).filter(Boolean).length
      const duration = Number((sceneWords * durationFactor).toFixed(2))
      const startTime = Number(currentTime.toFixed(2))
      currentTime += duration

      return {
        id: `scene-${raw.sceneNumber}`,
        sceneNumber: raw.sceneNumber,
        narration: raw.sceneNarration,
        imagePrompt: raw.imagePrompt,
        dialogue: raw.sceneDialogue,
        duration,
        startTime,
        animationPrompt: raw.animationPrompt,
        acting: raw.acting,
        ...raw.meta
      }
    })
  }

  // ─── Helpers ─────────────────────────────────

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
      console.error(`[VimaxAgent] Erreur lors de la sauvegarde de ${name}:`, error)
    }
  }
}
