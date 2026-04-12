import { computeSceneCountRange, type EnrichedScene, type VideoGenerationOptions } from '../../types/video-script.types'
import type { VideoTypeSpecification } from '../prompt-maker.types'
import { VideoGenerator } from './video-generator.abstract'
import type { VideoGeneratorConfig } from './video-generator.abstract'

// ─── Cliffhanger typing ───────────────────────────────────────────────────────

export type CliffhangerType = 'revelation' | 'peril' | 'choice' | 'betrayal' | 'unknown'

export interface TypedCliffhanger {
  type: CliffhangerType
  description: string
  /**
   * The unresolved question the audience carries into the next episode.
   * Always formulated as a question: "Will X manage to...?" / "What does Y really know?"
   */
  audienceQuestion: string
}

// ─── SeriesContext ────────────────────────────────────────────────────────────

export interface SeriesContext {
  seriesId: string
  episodeNumber: number
  globalContext?: string
  previousEpisodesContext: string
  characterRegistry: Record<
    string,
    {
      description: string
      backstory?: string
      personalGoal?: string
      modelId?: string
      portraitPrompt?: string
      thumbnailUrl?: string
    }
  >
  locationRegistry: Record<
    string,
    {
      description: string
      thumbnailUrl?: string
    }
  >
  assetRegistry: Record<
    string,
    {
      description: string
      thumbnailUrl?: string
      type?: 'creature' | 'monster' | 'artifact' | 'object' | 'other'
    }
  >
  /**
   * Typed cliffhanger from the previous episode.
   */
  lastCliffhanger?: TypedCliffhanger | string // string kept for backward compat
  /**
   * Unresolved threads.
   */
  unresolvedThreads?: string[]
  /**
   * The specific pitch/hook for this episode from the global saga plan.
   */
  currentEpisodePitch?: string
  totalEpisodes?: number
  isFinalEpisode?: boolean
  plannedEpisodes?: { number: number; title: string; hook: string }[]
  videoGenre?: string
  visualStyleModelId?: string
  /**
   * Project Sequel: Evolution data
   */
  visualEvolution?: Record<string, string>
  weatherState?: string
  timeOfDay?: string
  relationshipMap?: Record<string, Record<string, string>>
  assetEvolution?: Record<string, string>
  colorPalette?: string
  symbolicMotifs?: string[]
  cameraStyle?: string
  lastEpisodeSummary?: string
  /**
   * Project Sequel: Bridge data from the previous episode.
   */
  lastEpisodeFinalImage?: string
  lastEpisodeFinalScene?: any
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cliffhangerDescription(ch: TypedCliffhanger | string | undefined): string {
  if (!ch) return 'Aucun.'
  if (typeof ch === 'string') return ch
  return ch.description
}

function cliffhangerBridgeInstruction(
  ch: TypedCliffhanger | string | undefined,
  episodeNumber: number,
  lastScene?: any
): string {
  if (episodeNumber <= 1 || (!ch && !lastScene)) return ''

  let prompt = '\n\n⚠️ PONT NARRATIF OBLIGATOIRE :'

  if (lastScene) {
    prompt += `\nL'épisode précédent s'est arrêté EXACTEMENT sur cette scène : "${lastScene.summary || lastScene.imagePrompt}"`
    if (lastScene.locationId)
      prompt += `\nLieu de reprise OBLIGATOIRE : "${lastScene.locationId}" (Vous DEVEZ démarrer ici).`
    if (lastScene.persistentDecorTokens?.length > 0) {
      prompt += `\nAmbiance & Lumière à maintenir : ${lastScene.persistentDecorTokens.join(', ')}`
    }
    prompt += `\nVOUS DEVEZ COMMENCER CET ÉPISODE IMMÉDIATEMENT APRÈS CET INSTANT.`
    prompt += `\n⚠️ INTERDICTION ABSOLUE : ne commencez pas par un saut temporel, un résumé, ou une transition vers un nouveau lieu (ex: "Dans les archives...", "Plus tard...").`
    prompt += `\nLA PREMIÈRE PHRASE [S1] doit être la suite immédiate de l'action ou de l'émotion de la fin de l'épisode précédent.`
  }

  if (ch) {
    if (typeof ch === 'string') {
      prompt += `\nCliffhanger à résoudre : "${ch}"`
    } else {
      const typeInstructions: Record<CliffhangerType, string> = {
        revelation: `Le personnage ou le lecteur vient d'apprendre une vérité qui change tout. L'épisode doit s'ouvrir sur les CONSÉQUENCES émotionnelles immédiates de cette révélation, pas sur une autre action. Le choc doit résonner.`,
        peril: `Un personnage est en danger immédiat. L'épisode DOIT s'ouvrir en plein milieu de ce danger (In Media Res). NE PAS résoudre le péril en deux lignes — laissez la tension monter au moins 2 scènes avant toute issue.`,
        choice: `Un personnage fait face à un choix impossible. L'épisode DOIT montrer le processus de décision dans ses moindres contradictions — pas seulement la décision elle-même. La souffrance du choix est le coeur de cette ouverture.`,
        betrayal: `Une trahison vient d'être révélée ou commise. L'épisode s'ouvre sur la réaction viscérale du personnage trahi ou du traître face aux conséquences. Evitez les explications immédiates — laissez l'ambiguïté respirer.`,
        unknown: `L'épisode doit reconnecter avec la tension précédente de façon directe et immersive.`
      }
      prompt += `\n[Type: ${(ch.type || 'unknown').toUpperCase()}] : "${ch.description}"`
      if (ch.audienceQuestion) prompt += `\nQuestion du public : "${ch.audienceQuestion}"`
      prompt += `\nInstruction de reprise : ${typeInstructions[ch.type as CliffhangerType] || typeInstructions.unknown}`
    }
  }

  return prompt
}

/**
 * Validate that unresolved threads are questions, not statements.
 * Returns a warning list (non-blocking).
 */
function validateThreadsAsQuestions(threads: string[]): string[] {
  return threads
    .filter((t) => !t.trim().endsWith('?'))
    .map((t) => `[SeriesVideoGenerator] Thread non formulé comme question : "${t.slice(0, 60)}..."`)
}

// ─── SeriesVideoGenerator ─────────────────────────────────────────────────────

/**
 * SeriesVideoGenerator
 *
 * Implementation for multi-episode narrative content.
 * Handles episodic memory, character persistence, typed cliffhangers,
 * false resolution beats, and addictive narrative structure.
 */
export class SeriesVideoGenerator extends VideoGenerator {
  private seriesContext: SeriesContext

  constructor(config: VideoGeneratorConfig, seriesContext: SeriesContext) {
    super(config)
    this.seriesContext = seriesContext

    // Automatic final episode detection
    const instructions = [
      `Génère l'Épisode nº${this.seriesContext.episodeNumber}${this.seriesContext.totalEpisodes ? ` sur ${this.seriesContext.totalEpisodes}` : ''} de la saga : "${this.seriesContext.videoGenre || 'Horreur Historique'}".`
    ]

    if (this.seriesContext.currentEpisodePitch) {
      instructions.push(
        `🚨 MISSION NARRATIVE (PLAN REÇU) : Suivez ce pitch : "${this.seriesContext.currentEpisodePitch}".`
      )
    } else if (!this.seriesContext.isFinalEpisode && this.seriesContext.episodeNumber > 1) {
      instructions.push(
        `🚨 MISSION NARRATIVE (IMPROVISATION DIRIGÉE) : Le plan initial est épuisé. Vous DEVEZ improviser une suite logique en exploitant les mystères non résolus (@unresolvedThreads). Maintenez la tension sans conclure prématurément.`
      )
    }

    if (this.seriesContext.totalEpisodes && this.seriesContext.episodeNumber >= this.seriesContext.totalEpisodes) {
      this.seriesContext.isFinalEpisode = true
    }

    // Warn if threads are not formulated as questions
    if (this.seriesContext.unresolvedThreads?.length) {
      const warnings = validateThreadsAsQuestions(this.seriesContext.unresolvedThreads)
      warnings.forEach((w) => console.warn(w))
    }
  }

  public getType(): string {
    return 'series'
  }

  // ─── Output Format ──────────────────────────────────────────────────────────

  protected getDefaultOutputFormat(): string {
    const isFinal = this.seriesContext.isFinalEpisode

    const cliffhangerBlock = isFinal
      ? ''
      : `
    "cliffhanger": {
      "type": "revelation | peril | choice | betrayal",
      "description": "Description précise du cliffhanger (action suspendue ou révélation).",
      "audienceQuestion": "La question que le public emporte avec lui — formulée comme une question active."
    },`

    const metadataBlock = isFinal
      ? `
  "seriesMetadata": {
    "episodeSummary": "Résumé narratif final de la série.",
    "resolution": "Description de la conclusion définitive de l'intrigue.",
    "characterFinalState": { "personnageA": "son destin final / situation stable", "personnageB": "..." }
  }`.trim()
      : `
  "seriesMetadata": {
    "episodeSummary": "Résumé narratif concis de cet épisode — formulé comme une PROMESSE pour la suite, pas comme un compte-rendu.",${cliffhangerBlock}
    "characterContinuity": { 
        "personnageA": { "description": "état/tenue/lieu à la fin", "isNew": true }, 
        "personnageB": { "description": "...", "isNew": false } 
    },
    "newCharacters": { "Nom": "Description détaillée" },
    "newLocations": { "Nom": "Description détaillée" },
    "newAssets": { "Demon": "Description visuelle de l'entité" },
    "nextEpisodeTease": "Une question précise avec un nom propre et un enjeu concret — jamais une vague promesse d'action.",
    "unresolvedThreads": [
      "Question active non résolue 1 — toujours formulée avec un '?' "
    ]
  }`.trim()

    return `
{
  ${metadataBlock},
  "titles": ["titre épisode 1", "titre épisode 2"],
  "fullNarration": "La narration complète verbatim de l'épisode...",
  "scenes": [
    {
      "id": "scene-1",
      "sceneNumber": 1,
      "summary": "Résumé visuel",
      "narration": "Narration verbatim...",
      "locationId": "identifiant-lieu-unique",
      "persistentDecorTokens": ["lampe de bureau rouge", "plante verte", "lumière de fin de journée"],
      "imagePrompt": "Description visuelle",
      "charactersId": ["@Sarah"],
      "isEstablishingShot": true,
      "spatialAnchor": "Sur la colline surplombant le village",
      "emotionalTokens": { "@Sarah": ["Terrifié", "Essoufflé"] },
      "interactions": { "@Sarah-@Marek": "Suspicion mutuelle" },
      "composition": {
        "shotType": "WIDE",
        "foregroundAnchor": "des branches d'arbres floues",
        "lightingMood": "crépuscule froid",
        "focusTarget": "@Sarah"
      },
      "visualEvolution": { "@Sarah": "Cicatrice au front" },
      "weatherState": "Pluie diluvienne",
      "timeOfDay": "Aube",
      "relationshipMap": { "@Sarah": { "@Alexandre": "Alliance", "@Marek": "Méfiance" } },
      "assetEvolution": { "Épée": "Brisée" },
      "animationPrompt": "Instructions pour le sujet (ex: il pleure, elle court)...",
      "cameraAction": [
        { "type": "zoom-in", "intensity": "high" },
        { "type": "shake", "intensity": "low" }
      ],
      "preset": "hook",
      "transition": "fade",
      "continueFromPrevious": true
    }
  ]
}

--- 📍 ANCRAGE SPATIAL & COHÉRENCE MONDE 📍 ---
- **Plan d'Ensemble OBLIGATOIRE** : Si une scène introduit un NOUVEAU lieu, la première scène de ce lieu DOIT avoir \`isEstablishingShot: true\` et un cadrage WIDE qui montre le bâtiment/lieu dans son contexte (ville, forêt, paysage).
- **Ancre Spatiale** : Remplir \`spatialAnchor\` pour situer le lieu par rapport au reste du monde (ex: "Entrée ouest de la ville", "Sous la cascade gelée").
- **Logique de Déplacement** : Si un personnage "va à l'église", commencez par un plan large montrant l'église dans la ville avant de passer à l'intérieur.

--- ⚠️ GARDES-FOUS CINÉMATOGRAPHIQUES ⚠️ ---
Utilise EXCLUSIVEMENT les valeurs suivantes :

TRANSITIONS :
none, fade, blur, crossfade, zoom-in, dissolve, fade-black, fade-white, 
wipe-left, wipe-right, wipe-up, wipe-down, slide-left, slide-right, slide-up, slide-down,
circleopen, circleclose, pixelize, radial, smooth-left, smooth-right, smooth-up, smooth-down,
squeezev, squeezeh, zoomin, zoomout, diagtl, diagtr, diagbl, diagbr

CAMERA ACTIONS :
none, pan-left, pan-right, pan-up, pan-down, zoom-in, zoom-out, shake, breathing, snap-zoom, dutch-tilt
`.trim()
  }

  // ─── Narrative Overrides ────────────────────────────────────────────────────

  protected validateNarrativeCoherence(scenes: any[]): string[] {
    const violations: string[] = []

    // Warn if no false resolution beat is detected (scenes 3-5)
    const midScenes = scenes.slice(2, 5)
    const hasFalseResolution = midScenes.some(
      (s) => s.preset === 'false_resolution' || (s.summary || '').toLowerCase().includes('croit')
    )
    if (!hasFalseResolution && scenes.length >= 5) {
      console.warn(
        `[SeriesVideoGenerator] Episode ${this.seriesContext.episodeNumber}: no false resolution beat detected in scenes 3-5. Tension curve may feel flat.`
      )
    }

    return violations
  }

  // ─── Pass 1: Narration ──────────────────────────────────────────────────────

  public buildTwoPassPrompts(topic: string, options: VideoGenerationOptions, targetWords?: number) {
    const wps = this.getWordsPerSecond(options)
    const duration = this.getEffectiveDuration(options)
    const safetyFactor = this.getSafetyFactor(options)
    const target = targetWords ?? Math.round(duration * wps * safetyFactor)

    const bridgeInstruction = cliffhangerBridgeInstruction(
      this.seriesContext.lastCliffhanger,
      this.seriesContext.episodeNumber,
      this.seriesContext.lastEpisodeFinalScene
    )

    const threadsInstruction = this.seriesContext.unresolvedThreads?.length
      ? `\n\nINTRIGUES SECONDAIRES EN COURS (à tisser subtilement, sans forcer) :\n${this.seriesContext.unresolvedThreads.map((t) => `- ${t}`).join('\n')}\nCes questions doivent rester ouvertes — apportez des fragments de réponse, pas la résolution.`
      : ''

    return {
      pass1: {
        system: `Vous êtes un scénariste de séries expert en binge-watching et en narration épisodique.
      Episode N° ${this.seriesContext.episodeNumber}.
      RÔLE NARRATIF : ${
        this.seriesContext.episodeNumber === 1
          ? 'ACTE 1 (DÉCOMPRESSION/DÉPART)'
          : this.seriesContext.isFinalEpisode
            ? 'ACTE 3 (RÉSOLUTION FINALE)'
            : `ACTE 2 (DÉVELOPPEMENT/INTENSIFICATION - Épisode ${this.seriesContext.episodeNumber})`
      }
      Tâche: Écrire la narration de l'épisode ${this.seriesContext.episodeNumber}.

      CONTEXTE GLOBAL (BIBLE) :
      ${this.seriesContext.globalContext || 'Pas de bible spécifiée.'}

      REGISTRE DES LIEUX (Canon) :
      ${
        Object.entries(this.seriesContext.locationRegistry || {})
          .map(([name, data]) => `• ${name}: ${data.description}`)
          .join('\n') || 'Aucun lieu récurrent défini.'
      }

      REGISTRE DES ENTITÉS & MONSTRES (Canon) :
      ${
        Object.entries(this.seriesContext.assetRegistry || {})
          .map(([name, data]) => `• ${name} [${data.type || 'entité'}]: ${data.description}`)
          .join('\n') || 'Aucune entité récurrente définie.'
      }

      ÉPISODES PRÉCÉDENTS :
      ${this.seriesContext.previousEpisodesContext || 'Premier épisode.'}

      BIAIS DE RÉCENCE (ANCRE CRITIQUE) :
      ${
        this.seriesContext.lastEpisodeSummary
          ? `L'épisode immédiatement précédent (N-1) s'est terminé sur ces événements : "${this.seriesContext.lastEpisodeSummary}". C'est votre point de départ logique et émotionnel ABSOLU.`
          : 'N/A'
      }

      DIRECTIVES DE CONTINUITÉ :${bridgeInstruction}${threadsInstruction}

      RÈGLES D'OR DE NARRATION :
      • MOMENTUM & DÉPLACEMENT (CRITIQUE) : Cet épisode NE DOIT PAS être une répétition ou une simple extension de la scène finale précédente. Dès la Scène 2 ou 3, l'action DOIT forcer un déplacement physique (changement de lieu) ou une rupture de situation majeure. Interdiction de rester dans la "stagnation contemplative".
      • ÉVOLUTION IRRÉVERSIBLE : Chaque épisode doit changer la situation des personnages de façon permanente. Rien ne doit pouvoir revenir "comme avant" à la fin de l'épisode.
      • CINÉMA "SHOW DON'T TELL" (ANTI-OMNISCIENT) : Ne commentez jamais l'avenir ou les pensées cachées via le narrateur (ex: Interdiction de dire "Il ignorait encore que...", "Le destin l'attendait..."). Restez sur l'action présente, brute et médiate.
      • THREAD HANDSHAKE (REPRISE D'INTRIGUE) : Vous DEVEZ explicitement poursuivre au moins une intrigue ou un mystère ouvert à l'épisode précédent. Ne lancez pas une "nouvelle aventure" déconnectée.
      • HÉRITAGE ÉMOTIONNEL : Reprenez les personnages exactement dans l'état émotionnel où ils étaient. S'ils étaient en plein conflit, la tension doit être palpable dès la première seconde.
      • FAUSSE RÉSOLUTION (OBLIGATOIRE) : Entre la scène 3 et 5, inclure un moment où le personnage croit avoir résolu le problème principal — avant une aggravation inattendue. C'est le coeur du ressort addictif.
      • CURIOSITÉ EN ESCALIER : Ouvrez de nouvelles questions à chaque fois que vous fermez une ancienne. Le ratio doit être 1 réponse pour 2 nouvelles questions.
      • LIEUX : Réutilisez les lieux du registre pour créer un sentiment de familiarité. Décrivez-les avec constance.
      • PERSONNAGES : Respectez scrupuleusement les traits de personnalité et les descriptions physiques du registre.
      • PONT NARRATIF (CRITIQUE) : Plongez directement dans l'action (In Media Res). INTERDICTION de commencer par un récapitulatif ("Previously on..."), un flash-forward, une introduction par un narrateur distant, ou un saut d'ambiance brusque. La première phrase doit être la suite sémantique et visuelle directe du cliffhanger. S'il y a un changement de lieu (ex: vers un monastère), il doit intervenir APRÈS une transition justifiée au cours de l'épisode, jamais en scène 1.
      `,
        user: `DÉTAILS DE L'ÉPISODE : ${topic || options.episodeSummary || 'Générez la suite logique de la saga en vous basant sur le cliffhanger précédent.'}\nCible : ${target} mots.`,
        targetWords: target
      }
    }
  }

  // ─── Pass 2: Structuring system prompt ─────────────────────────────────────

  protected buildStructuringSystemPrompt(options: VideoGenerationOptions): string {
    const spec = this.getEffectiveSpec(options)

    const bridgeInstruction = cliffhangerBridgeInstruction(
      this.seriesContext.lastCliffhanger,
      this.seriesContext.episodeNumber,
      this.seriesContext.lastEpisodeFinalScene
    )

    const cliffhangerContext = this.seriesContext.lastCliffhanger
      ? typeof this.seriesContext.lastCliffhanger === 'string'
        ? `Dernier Cliffhanger (À RÉSOUDRE OU ÉVOLUER): ${this.seriesContext.lastCliffhanger}`
        : `Dernier Cliffhanger [${this.seriesContext.lastCliffhanger.type.toUpperCase()}]: ${this.seriesContext.lastCliffhanger.description}`
      : 'Aucun cliffhanger précédent.'

    const seriesSpec: VideoTypeSpecification = {
      ...spec,
      // PRIORITÉ SAGA : Utiliser la Spec comme guide de style, mais avec priorité à la continuité
      goals: spec.goals,
      task: `${spec.task}\n\nIMPORTANT: Vous DEVEZ inclure l'objet "seriesMetadata" pour permettre la continuité narrative. Sans cet objet, la série s'arrêtera.`,
      context: `[CONTINUITÉ SAGA] 
Épisode N°: ${this.seriesContext.episodeNumber}${this.seriesContext.totalEpisodes ? ` sur ${this.seriesContext.totalEpisodes}` : ''}
ID Saga: ${this.seriesContext.seriesId}
Bible (Contexte global): ${this.seriesContext.globalContext || 'Pas de bible.'}
Historique récent: ${this.seriesContext.previousEpisodesContext || 'Nouveau départ.'}
BIAIS DE RÉCENCE (DERNIER RÉSUMÉ) : ${this.seriesContext.lastEpisodeSummary || 'N/A'}
${cliffhangerContext}

REGISTRE DES PERSONNAGES (CASTING ACTIF):
${Object.entries(this.seriesContext.characterRegistry || {})
  .map(([name, data]) => `• ${name}: ${data.description}${data.modelId ? ` (ID MODÈLE: ${data.modelId})` : ''}`)
  .join('\n')}

REGISTRE DES ENTITÉS & MONSTRES (STORY ASSETS):
${Object.entries(this.seriesContext.assetRegistry || {})
  .map(([name, data]) => `• ${name} [${data.type || 'entité'}]: ${data.description}`)
  .join('\n')}

DIRECTIVES DE CONTINUITÉ (PRÉCÉDENCE ABSOLUE): ${bridgeInstruction}`,
      instructions: [
        ...(spec.instructions || []),

        // SMART SPEC DISTILLATION (ACT-BASED FOCUS)
        ...(this.seriesContext.episodeNumber === 1
          ? [
              "RÔLE NARRATIF (ACTE 1 - EXPOSITION) : Établissez les bases. Suivez scrupuleusement les instructions d'introduction (Hook/Intro) du Spec.",
              "EXPOSITION MONDIALE (OBLIGATOIRE) : Le premier épisode DOIT s'ouvrir (Scène 1 ou 2) par une description visuelle riche de l'ENVIRONNEMENT GLOBAL (ville, univers, paysage) avant de se focaliser sur les personnages. Utilisez un 'Establishing Shot' pour ancrer la géographie de l'histoire."
            ]
          : this.seriesContext.isFinalEpisode
            ? [
                'RÔLE NARRATIF (ACTE FINAL - RÉSOLUTION) : Précédence absolue à la conclusion. Résolvez toutes les intrigues ouvertes.'
              ]
            : [
                `RÔLE NARRATIF (ACTE 2 - ESCALADE - ÉPISODE ${this.seriesContext.episodeNumber}) : Focus sur l'intensification. Le 'Hook' et l' 'Intro' du Spec doivent être distillés comme des éléments d'escalade, pas comme un nouveau départ.`
              ]),

        // CINEMATIC WELD RULE (CRITIQUE)
        'RÈGLE DE SOUDURE (5s) : Les 5 premières secondes de cet épisode DOIVENT être consacrées exclusivement à la résolution visuelle et sémantique directe du cliffhanger précédent. Aucun nouvel élément de décor ou thème du Spec (ex: archives, nouveau lieu) ne peut être introduit avant la seconde 6.',

        // NARRATIVE ALIGNMENT & CONFLICT RESOLUTION
        "PRIORITÉ DE CONTINUITÉ (PRÉCÉDENCE) : Si un Objectif ('Goal') ou une Instruction du 'Spec' semble contredire la situation actuelle (ex: 'Ouvrir sur une archive' alors que vous êtes en forêt), la CONTINUITÉ gagne pour l'ouverture. Intégrez l'élément du Spec plus tard dans l'épisode.",
        "ADAPTATION DES PRESETS : Le preset 'hook' d'une suite (Épisode 2+) doit être traité comme 'Reprise d'Action' tout en conservant la charte esthétique du Spec.",

        // Narrative coherence
        "COHÉRENCE TOTALE : L'épisode DOIT s'inscrire dans la continuité directe du cliffhanger précédent.",
        "ÉVOLUTION IRRÉVERSIBLE : Faites progresser l'intrigue de manière permanente. Rien ne doit pouvoir revenir 'comme avant' après cet épisode.",
        // Addictive tension mechanics
        "FAUSSE RÉSOLUTION (OBLIGATOIRE) : Entre la scène 3 et 5, insérer une scène (preset: 'false_resolution') où le personnage croit avoir résolu le problème principal — suivie d'une aggravation inattendue. C'est la mécanique centrale du binge-watching.",
        "CURIOSITÉ EN ESCALIER : Pour chaque question fermée, ouvrez 2 nouvelles questions. Les 'unresolvedThreads' doivent augmenter d'au moins 1 entrée nette par épisode.",
        "UNRESOLVEDTHREADS — FORMAT OBLIGATOIRE : Chaque fil doit être formulé comme une question active avec un nom propre et un enjeu concret. Exemple valide : 'Pourquoi Marcus a-t-il brûlé les dossiers avant l'arrivée de la police ?' Exemple invalide : 'Marcus a brûlé des dossiers.'",
        // Cliffhanger
        this.seriesContext.isFinalEpisode
          ? "RÉSOLUTION FINALE (OBLIGATOIRE): Concluez TOUTES les intrigues. INTERDICTION de finir sur un cliffhanger. Répondez à chaque unresolvedThread. L'histoire doit être terminée et fermée."
          : "CLIFFHANGER TYPÉ (OBLIGATOIRE) : Finissez sur une tension insoutenable. Choisissez un type parmi : revelation / peril / choice / betrayal. Formulez 'audienceQuestion' comme une vraie question que le public emportera en tête.",
        // next episode tease
        "TEASING PROCHAIN ÉPISODE : Doit contenir un nom propre, une action concrète, et un enjeu. Pas de vague promesse. Exemple valide : 'Saura-t-on pourquoi Elena a effacé les caméras avant le meurtre ?' Exemple invalide : 'Les révélations vont s'enchaîner...'",
        // Identity Locking
        "AUCUNE REDONDANCE PHYSIQUE (CRITIQUE) : Ne décrivez JAMAIS l'âge, les vêtements habituels ou les traits physiques des personnages du registre dans les descriptions de scènes ou les imagePrompts. Utilisez simplement leur nom (ex: 'Alexandre tape sur son clavier'). L'IA connaît déjà leur apparence via le registre.",
        // Episodic summary as a promise
        "RÉSUMÉ DE L'ÉPISODE : Formulez-le comme une promesse narrative orientée vers la suite, pas comme un compte-rendu factuel. Il sera injecté dans le contexte des prochains épisodes.",
        // Casting & locations
        "PERSONNAGES: Utilisez les identifiants du registre pour remplir 'charactersId'.",
        'STABILITÉ SPATIALE (CRITIQUE) : Maintenez une continuité de placement. Si un personnage est à gauche dans une scène, il doit y rester sauf mouvement explicite. Ne faites pas disparaître le protagoniste au profit de figurants.',
        "ASSETS & OBJETS : Utilisez 'newAssets' pour toute entité non-humaine (démon, relique, artefact) et maintenez sa description visuelle constante.",
        "LIEUX: Utilisez l'identifiant 'locationId' pour chaque scène.",

        // NARRATIVE & ATMOSPHERIC HARDENING (V9)
        'SOUDAGE ÉMOTIONNEL (CRITIQUE) : Si \'continueFromPrevious\' est vrai, les \'emotionalTokens\' de chaque personnage de la scène i DOIVENT être reportés ou évoluer logiquement à la scène i+1. Utilisez le format objet { "@Nom": ["Emotion"] }.',
        "CROWD LOGIC : Respectez la densité de population suggérée par le type de lieu. Un 'Marché' ou une 'Ville' doit mentionner une foule ou une activité humaine dans l'imagePrompt, sauf si la bible spécifie un lieu désert.",
        "THREAD MONITORING : Pour chaque épisode, vous DEVEZ tenter de faire progresser au moins un des 'unresolvedThreads' existants. Ne les laissez pas stagner.",

        // RÉGIE VIRTUELLE & PERSPECTIVE (V11)
        "COMPOSITION STRUCTURÉE : Pour CHAQUE scène, remplissez l'objet 'composition'. Utilisez 'shotType' (CLOSEUP, MEDIUM, WIDE, ESTABLISHING, POV, OVERSHOULDER) de manière logique.",
        "CINEMATIC DEPTH (DIRTY FRAME) : Utilisez 'foregroundAnchor' pour suggérer un objet flou au premier plan (ex: 'branche', 'pilier', 'épaule') afin de créer de la profondeur. C'est l'IA qui choisit l'objet le plus logique selon le lieu.",
        "LIGHTING & ATMOSPHERE : Utilisez 'lightingMood' pour fixer l'ambiance lumineuse (ex: 'clair-obscur', 'soleil couchant', 'néon froid').",
        "VERROUILLAGE RELATIONNEL : Utilisez 'interactions' pour définir la tension entre personnages. S'ils se méfient, ils ne doivent pas être l'un à côté de l'autre.",
        "GARDE-FOU VOYAGE LOGIQUE : Si vous changez de lieu pour un endroit lointain, incluerez une scène de transition 'Chemin' ou mentionner le trajet dans la narration.",

        // EXCELLENCE NARRATIVE & IMPACT (V12)
        "ATTACHEMENT PERSONNAGE : Incluez systématiquement un moment de vulnérabilité, de doute ou de peur intime. Si un personnage est 'invincible', il devient ennuyeux. Il doit être vulnérable pour être attachant.",
        "IMPACT & RYTHME : Utilisez le 'Show, Don't Tell'. Ne dites pas 'Il a peur', décrivez 'Ses mains tremblent alors qu'il serre la garde de son épée'. Utilisez des phrases courtes et percutantes pour l'action.",
        "ENJEUX PERSONNELS : Chaque événement du 'Spec' doit être lié à un enjeu émotionnel pour les personnages présents. La terreur ne vient pas du monstre, mais de ce que le personnage risque de perdre.",
        "MÉCANIQUE DE REBONDISSEMENT (TWISTS) : À mi-épisode (Scène 4-6), un événement imprévu doit invalider l'objectif initial ou révéler une vérité cachée (Pivot de Milieu). Utilisez la règle du 'Oui, MAIS' : une petite victoire doit toujours entraîner une complication plus grave.",
        "NARRATION ORALE : La narration doit être écrite pour être lue. Évitez les listes factuelles. Utilisez des silences (caractère unique '|') pour marquer les pauses dramatiques entre les phrases importantes.",

        // ÉVOLUTION VISUELLE & TEMPORELLE (V13)
        "ÉVOLUTION VISUELLE PERSONNAGE : Utilisez l'objet 'visualEvolution' pour marquer les changements physiques de l'épisode (ex: '@Marek': 'Bandeau sur l'œil droit', '@Sarah': 'Robe déchirée'). Ces changements seront hérités par l'épisode suivant.",
        "COHÉRENCE MÉTÉO & TEMPORELLE : Utilisez 'weatherState' (ex: 'Pluie battante') et 'timeOfDay' (ex: 'Plein jour', 'Minuit'). L'épisode suivant DOIT hériter de la météo et de l'heure de la scène finale, sauf ellipse narrative justifiée.",

        // SOCIAL & ASSET HARDENING (V14)
        "SOUDAGE SOCIAL (RELATIONS) : Utilisez 'relationshipMap' pour définir l'état des liens (ex: '@Alexandre': {'@Sarah': 'Amoureux', '@Marek': 'Rival'}). Ces tensions DOIVENT influencer le placement des personnages (ex: ne pas être côte à côte si rivaux).",
        "ÉTAT DES OBJETS CLÉS : Utilisez 'assetEvolution' pour traquer l'état physique des objets uniques (ex: 'Grimoire': 'Brûlé', 'Épée': 'Brisée'). Un objet endommagé le reste jusqu'à sa réparation explicite.",

        // INTÉGRATION NARRATIVE (HISTOIRE & DIALOGUES)
        "ÉCHO NARRATIF DU CONTEXTE (CRITIQUE) : Le script (narration et dialogues) DOIT refléter l'état actuel du monde. Si 'weatherState' est un orage, la narration doit mentionner le tonnerre ou la pluie. Si un objet est 'Brisé', les personnages doivent en parler ou s'adapter à sa perte.",
        "RÉSONANCE SOCIALE : Les dialogues DOIVENT changer selon la 'relationshipMap'. Deux rivaux ne se disent pas 'merci', ils se provoquent. Une menace ne doit être mentionnée que si elle est liée à l'enjeu personnel du personnage.",
        "MATÉRIALITÉ VISUELLE : Ne vous contentez pas d'imagePrompts. Intégrez l'évolution visuelle (@visualEvolution) dans la narration orale. Exemple : 'Regarde cette cicatrice... tu porteras ma marque à jamais.'",
        "PULSE DU TWIST : Le script doit construire la tension vers le rebondissemnt de milieu d'épisode. Chaque phrase doit peser.",

        // AUTEUR STYLE & SYMBOLISM (V15)
        "DIRECTION ARTISTIQUE (COULEURS) : Utilisez 'colorPalette' pour maintenir l'identité visuelle (ex: 'Sépia poussiéreux'). Chaque cadrage doit respecter cette colo.",
        "SYMBOLISME RÉCURRENT : Intégrez discrètement les 'symbolicMotifs' (ex: des horloges partout) dans les décors pour créer un sentiment de destinée.",
        "LANGAGE CAMÉRA GLOBAL : Respectez le 'cameraStyle' (ex: 'Caméra épaule nerveuse') dans toutes le 'cameraAction' générées.",

        // NARRATIVE DEPTH & MASTER PLAN (V16)
        `CONSCIENCE DU MASTER PLAN (ROADMAP) : Voici le plan complet de la saga : ${JSON.stringify(
          this.seriesContext.plannedEpisodes || []
        )}. Utilisez-le pour faire du FORESHADOWING (indices sur les épisodes futurs) et assurer que l'épisode actuel prépare logiquement la suite.`,
        "PROFONDEUR DES PERSONNAGES (BACKSTORIES) : Chaque personnage a un 'backstory' et un 'personalGoal' dans le registre. Les dialogues DOIVENT refléter ce passé. Un personnage ne doit pas seulement réagir, il doit agir selon son but personnel caché.",
        `ARC NARRATIF GLOBAL : Ne traitez pas l'épisode de manière isolée. Il fait partie d'un arc de ${this.seriesContext.totalEpisodes || 10} épisodes. Maintenez la tension.`,

        // SPATIAL INTEGRITY & COMPOSITION HARDENING (V18)
        "INTÉGRITÉ SPATIALE : Si la narration indique que les personnages sont isolés, dispersés, ou dans des lieux différents, MOINS DE GROUPEMENT. Utilisez le mode 'layout': 'MONTAGE' ou 'SPLIT'.",
        "RÈGLE ANTI-HALLUCINATION : Ne placez JAMAIS plusieurs personnages côte à côte si le texte dit 'chacun de son côté' ou 'dispersés'. C'est une erreur narrative grave.",
        "COMPOSITION MULTI-PANEL : Pour le layout 'MONTAGE', décrivez explicitement un polyptyque (ex: 'Un montage de 3 panneaux verticaux montrant Alexandre, Sarah et Marek séparément').",

        // CONTINUITY WELD (V19)
        "SOUDURE VISUELLE SCÈNE 1 : La première scène [Scene 1] de cet épisode DOIT utiliser le même 'locationId' et la même ambiance que la fin du précédent. Pas de saut géographique immédiat.",

        // NARRATIVE ESCAPE (V22)
        "ÉVASION NARRATIVE : Dès la Scène 2 ou 3, forcez une TRANSITION ou un ÉVÉNEMENT qui déplace les personnages ou change radicalement la situation. Ne restez pas bloqué dans la scène de reprise toute la durée de l'épisode."
      ]
    }

    return this.buildSystemInstructions(seriesSpec) || 'Structurez cet épisode de série.'
  }

  // ─── Pass 2: Structuring user prompt ───────────────────────────────────────

  public buildStructuringUserPrompt(
    validatedNarration: string,
    topic: string,
    options: VideoGenerationOptions
  ): string {
    const spec = this.getEffectiveSpec(options)
    const duration = this.getEffectiveDuration(options)
    const wps = this.getWordsPerSecond(options)
    const safetyFactor = this.getSafetyFactor(options)
    const targetWordCount = Math.round(duration * wps * safetyFactor)
    const range = computeSceneCountRange(duration)

    // STRUCTURAL PARTITIONING: If sequel, merge Hook/Intro into a Sequel Reprise
    let effectiveSpec = spec
    const rawStructure = (spec.structure || []) as any[]
    if (this.seriesContext.episodeNumber > 1 && rawStructure.length > 2) {
      const hookWords = typeof rawStructure[0] === 'object' ? rawStructure[0].minWords || 15 : 15
      const introWords = typeof rawStructure[1] === 'object' ? rawStructure[1].minWords || 20 : 20
      const remainingStructure = rawStructure.slice(2)

      effectiveSpec = {
        ...spec,
        structure: [
          {
            preset: 'sequel_reprise',
            minWords: hookWords + introWords,
            minSentences: 3,
            description: "Reprise immédiate du cliffhanger et suite de l'action."
          },
          ...remainingStructure
        ] as any
      }
    }

    return `${this.buildUserData(
      {
        subject: topic,
        duration,
        aspectRatio: options.aspectRatio || '16:9',
        audience: (options as any).audience || spec.audienceDefault,
        language: options.language,
        targetWordCount,
        targetDuration: duration,
        wps,
        sceneCountRange: range
      },
      effectiveSpec
    )}\n\nNARRATION ÉPISODE ${this.seriesContext.episodeNumber} (JSON) :\n---\n${validatedNarration}\n---\n\n${
      this.seriesContext.isFinalEpisode
        ? '⚠️ ÉPISODE FINAL : Ne laissez aucune question sans réponse. Résolution totale de chaque unresolvedThread.'
        : '⚠️ RAPPEL ADDICTIF : Vérifiez que la fausse résolution est présente (scènes 3-5), que le cliffhanger est typé, et que les unresolvedThreads sont des questions actives.'
    }\nTÂCHE : Découpe en scènes JSON valides. SEQUEL MODE ACTIVE : Scene 1 MUST be a sequel reprise.`
  }

  // ─── Pass 2: Build prompts ──────────────────────────────────────────────────

  public buildPass2Prompts(
    validatedNarration: string,
    topic: string,
    options: VideoGenerationOptions,
    chunkContext?: any
  ) {
    let userPrompt = this.buildStructuringUserPrompt(validatedNarration, topic, options)

    if (chunkContext) {
      userPrompt += `\n\n⚠️ MODE TRONÇON : Partie ${chunkContext.chunkIndex + 1} sur ${chunkContext.totalChunks}\n`
      userPrompt += `La numérotation des scènes doit commencer à ${chunkContext.startSceneNumber}.\n`
    }

    return {
      system: this.buildStructuringSystemPrompt(options),
      user: userPrompt
    }
  }

  // ─── Retry prompt ───────────────────────────────────────────────────────────

  public buildNarrationRetryUserPrompt(
    topic: string,
    currentNarration: string,
    options: VideoGenerationOptions,
    targetWords: number,
    actualWords: number,
    attempt: number
  ) {
    return `⚠️ Episode ${this.seriesContext.episodeNumber} - ATTEMPT ${attempt} FAILED.
The narration is too short (${actualWords}/${targetWords} words).
Please expand the script for subject: ${topic}. Focus on narrative depth, the false resolution beat, and continuity.`
  }

  // ─── Misc ───────────────────────────────────────────────────────────────────

  public fixFullNarrationDrift(script: any) {
    return { script, driftFixed: false, driftWords: 0 }
  }

  public async buildScriptGenerationPrompts(
    topic: string,
    options: VideoGenerationOptions
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    return {
      systemPrompt: this.buildStructuringSystemPrompt(options),
      userPrompt: this.buildStructuringUserPrompt('', topic, options)
    }
  }

  // ─── Image & animation prompts ──────────────────────────────────────────────

  public async buildImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages?: boolean,
    aspectRatio?: string,
    memory?: any,
    hasLocationReference?: boolean
  ): Promise<import('../../types/video-script.types').ImagePrompt> {
    const isFirstScene = scene.sceneNumber === 1 || scene.id === (this.seriesContext as any).firstSceneId
    const sequelBridgeUrl = isFirstScene ? this.seriesContext.lastEpisodeFinalImage : undefined

    let paragraph = (scene.imagePrompt || scene.summary || '').trim()

    // ─── ROLLING CONTINUITY (Project Sequel) ───
    // This handles both INTER-episode (Sequel Bridge) and INTRA-episode (Scene-to-Scene) continuity.
    const previousScene = isFirstScene ? this.seriesContext.lastEpisodeFinalScene : (memory as any)?.previousScene

    if (previousScene) {
      const isSequelBridge = isFirstScene && this.seriesContext.episodeNumber > 1
      const isInternalSequence = !isFirstScene && scene.continueFromPrevious

      if (isSequelBridge || isInternalSequence) {
        paragraph = `CONTINUATION DE LA SCÈNE PRÉCÉDENTE : ${previousScene.summary || previousScene.imagePrompt}. ${paragraph}`

        // Lighting persistence for internal sequences
        if (previousScene.persistentDecorTokens && previousScene.persistentDecorTokens.length > 0) {
          const label = isSequelBridge ? 'épisode précédent' : 'scène précédente'
          paragraph = `Lumière et Ambiance de la ${label}: ${previousScene.persistentDecorTokens.join(', ')}. ${paragraph}`
        }

        // Compositional Locking
        const refLabel = isSequelBridge ? 'Sequel Bridge' : `Scene ${previousScene.id}`
        paragraph = `Reference (${refLabel}), COMPOSITION IDENTIQUE : Maintenez le placement spatial exact des personnages et des éléments du décor. ${paragraph}`

        // Silent Presence (Cast & Assets)
        const previousCast = previousScene.charactersId || previousScene.charactersInScene || []
        const currentCast = scene.charactersId || scene.charactersInScene || []
        const silentPresence = previousCast.filter((id: string) => !currentCast.includes(id))

        const registryAssets = Object.keys(this.seriesContext.assetRegistry || {})
        const prevText = (previousScene.summary || previousScene.imagePrompt || '').toLowerCase()
        const currText = (scene.summary || scene.imagePrompt || '').toLowerCase()
        const silentAssets = registryAssets.filter(
          (name) => prevText.includes(name.toLowerCase()) && !currText.includes(name.toLowerCase())
        )

        if (silentPresence.length > 0 || silentAssets.length > 0) {
          const presence = [...silentPresence, ...silentAssets]
          paragraph = `[Background presence - Maintenir positions et présences originales] ${presence.join(', ')}. ${paragraph}`
        }
      }
    }

    const characterMatches = scene.charactersId || scene.charactersInScene || []
    const characterRegistry = this.seriesContext.characterRegistry || {}
    for (const name of characterMatches) {
      const char = characterRegistry[name]
      if (char) {
        // Visual Evolution: If 'isNew' is true, bypass the strict reference anchor to allow new traits (e.g. scar, new outfit)
        const isEvolving = (char as any).isNew === true

        // Character identity anchor: provides name and base appearance for naming in the prompt.
        paragraph = this.applyIdentityLocking(paragraph, !!hasReferenceImages && !isEvolving, {
          character: { [name]: char }
        })

        const effectiveModelId = char.modelId || this.seriesContext.visualStyleModelId
        if (effectiveModelId && !paragraph.includes(effectiveModelId)) {
          paragraph += `, reference style ${effectiveModelId}`
        }
      }
    }

    // Story Assets (Entities like the Demon, or Artifacts)
    for (const [name, asset] of Object.entries(this.seriesContext.assetRegistry || {})) {
      if (paragraph.toLowerCase().includes(name.toLowerCase())) {
        const isEvolving = (asset as any).isNew === true
        paragraph = this.applyIdentityLocking(paragraph, !!hasReferenceImages && !isEvolving, {
          asset: { [name]: asset }
        })
      }
    }

    if (scene.locationId) {
      const locationRegistry = this.seriesContext.locationRegistry || {}
      const loc = locationRegistry[scene.locationId]
      if (loc && loc.description && !paragraph.includes(loc.description.slice(0, 30))) {
        paragraph = `Location ${scene.locationId}: ${loc.description}. ${paragraph}`
      }
      // Explicitly anchor to location reference if available
      if (hasLocationReference && loc?.thumbnailUrl) {
        paragraph = `Reference (Location), ${paragraph}`
      }
    }

    if (scene.persistentDecorTokens && scene.persistentDecorTokens.length > 0) {
      paragraph = `PERSISTENT SCENE ELEMENTS: ${scene.persistentDecorTokens.join(', ')}. ${paragraph}`
    }

    // SEQUEL LIGHTING WELD: Force previous atmosphere into the opening scene
    const isFirstSceneOfSequel =
      (scene.id === '1' || (scene as any).sceneNumber === 1) && this.seriesContext.episodeNumber > 1
    const lastScene = this.seriesContext.lastEpisodeFinalScene
    if (isFirstSceneOfSequel && lastScene?.persistentDecorTokens && lastScene.persistentDecorTokens.length > 0) {
      paragraph = `Ambiance & Lumière de l'épisode précédent (À MAINTENIR): ${lastScene.persistentDecorTokens.join(', ')}. ${paragraph}`
    }

    if (isFirstSceneOfSequel && lastScene?.emotionalTokens && Object.keys(lastScene.emotionalTokens).length > 0) {
      const pastEmotions = Object.entries(lastScene.emotionalTokens)
        .map(([charId, tokens]) => `${charId} était ${(tokens as string[]).join(', ')}`)
        .join(', ')
      paragraph = `État émotionnel initial (REPRISE) : ${pastEmotions}. ${paragraph}`
    }

    if (isFirstSceneOfSequel && lastScene?.interactions && Object.keys(lastScene.interactions).length > 0) {
      const pastInteractions = Object.entries(lastScene.interactions)
        .map(([pair, tension]) => `${pair} : ${tension}`)
        .join(', ')
      paragraph = `Dynamique sociale héritée (REPRISE) : ${pastInteractions}. ${paragraph}`
    }

    if (this.seriesContext.globalContext) {
      paragraph = `Universe Context (${this.seriesContext.globalContext.slice(0, 200)}): ${paragraph}`
    }

    // ─── RÉGIE VIRTUELLE (Virtual Director) ───
    const comp = scene.composition || { shotType: 'MEDIUM' }
    const shotMap: Record<string, string> = {
      CLOSEUP: 'CLOSE-UP SHOT: Focus on face and expression.',
      MEDIUM: 'MEDIUM SHOT: Character from waist up, showing some environment.',
      WIDE: 'WIDE SHOT: Full body and environment, character in context.',
      ESTABLISHING: 'ESTABLISHING SHOT: Extreme wide view to set the location.',
      POV: 'POV SHOT: Seen through the eyes of the character.',
      OVERSHOULDER: 'OVER-THE-SHOULDER SHOT: Looking at subject over another character shoulder.'
    }
    let shotDirective = shotMap[comp.shotType] || shotMap.MEDIUM

    // Add foreground element (Dirty Frame) organically
    if (comp.foregroundAnchor) {
      shotDirective = `${shotDirective} Seen through ${comp.foregroundAnchor} in the blurry foreground (DIRTY FRAME) for depth.`
    }

    // Add Lighting
    if (comp.lightingMood) {
      shotDirective = `${shotDirective} Lighting: ${comp.lightingMood}.`
    }

    // Add Focus Target
    if (comp.focusTarget) {
      shotDirective = `${shotDirective} Focus on ${comp.focusTarget}.`
    }

    paragraph = `${shotDirective} ${paragraph}`

    // ─── ATMOSPHERIC & TEMPORAL CONTEXT (V13) ───
    if (this.seriesContext.timeOfDay || this.seriesContext.weatherState) {
      const time = this.seriesContext.timeOfDay || ''
      const weather = this.seriesContext.weatherState || ''
      paragraph = `Atmosphère : ${time}${time && weather ? ', ' : ''}${weather}. ${paragraph}`
    }

    // ─── VISUAL & ASSET EVOLUTION (V13 & V14) ───
    const evolution = {
      ...(this.seriesContext.visualEvolution || {}),
      ...(scene.visualEvolution || {})
    }
    const assetState = {
      ...(this.seriesContext.assetEvolution || {}),
      ...(scene.assetEvolution || {})
    }
    if (Object.keys(evolution).length > 0 || Object.keys(assetState).length > 0) {
      const evolutionStr = Object.entries(evolution)
        .map(([char, state]) => `${char} (${state})`)
        .join(', ')
      const assetStr = Object.entries(assetState)
        .map(([obj, state]) => `${obj} (${state})`)
        .join(', ')
      paragraph = `État Physique & Objets : ${[evolutionStr, assetStr].filter(Boolean).join('; ')}. ${paragraph}`
    }

    // ─── SOCIAL CONTEXT & RELATIONSHIPS (V14) ───
    const relationships = this.seriesContext.relationshipMap || {}
    if (Object.keys(relationships).length > 0) {
      const relStr = Object.entries(relationships)
        .map(([char, targetMap]) =>
          Object.entries(targetMap as Record<string, string>)
            .map(([target, rel]) => `${char} vis-à-vis de ${target} : ${rel}`)
            .join(', ')
        )
        .join('. ')
      paragraph = `Contexte Social : ${relStr}. ${paragraph}`
    }

    // ─── AUTEUR STYLE & SYMBOLISM (V15) ───
    const palette = this.seriesContext.colorPalette
    const motifs = [...(this.seriesContext.symbolicMotifs || []), ...(scene.symbolicMotifs || [])]
    const camStyle = this.seriesContext.cameraStyle

    if (palette || motifs.length > 0 || camStyle) {
      let styleStr = ''
      if (palette) styleStr += `Color Palette: ${palette}. `
      if (motifs.length > 0) styleStr += `Symbolic Motifs: ${motifs.join(', ')}. `
      if (camStyle) styleStr += `Camera Technique: ${camStyle}. `
      paragraph = `Direction Artistique : ${styleStr}${paragraph}`
    }

    // ─── SPATIAL INTEGRITY (V18) ───
    const layout = scene.composition?.layout || 'SINGLE'
    if (layout === 'MONTAGE' || layout === 'SPLIT' || layout === 'DIAGONAL') {
      const typeLabel = layout === 'MONTAGE' ? 'polyptych / montage of multiple panels' : 'split-screen composition'
      paragraph = `COMPOSITION: A cinematic ${typeLabel} separating the characters into their respective panels. ${paragraph}`
    }

    // ─── UNIVERSE CONTEXT & WORLD EXPOSITION ───
    if (scene.emotionalTokens && Object.keys(scene.emotionalTokens).length > 0) {
      const emotions = Object.entries(scene.emotionalTokens)
        .map(([charId, tokens]) => `${charId} est ${(tokens as string[]).join(', ')}`)
        .join(', ')
      paragraph = `Expressions & État émotionnel : ${emotions}. ${paragraph}`
    }

    // ─── RELATIONSHIP MAPPING ───
    if (scene.interactions && Object.keys(scene.interactions).length > 0) {
      const interactions = Object.entries(scene.interactions)
        .map(([pair, tension]) => `Dynamique ${pair} : ${tension}`)
        .join(', ')
      paragraph = `Atmosphère sociale : ${interactions}. ${paragraph}`
    }

    // ─── HALLUCINATION GUARDS (Anti-Artifacts) ───
    const guards =
      'PAS DE MAIN QUI DESSINE, PAS DE STYLO, PAS DE CRAYON, PAS DE BORDURE BLANCHE, PAS DE TEXTE, PAS DE FILIGRANE. STYLE CINÉMATIQUE UNIQUEMENT.'
    paragraph = `${paragraph}. ${guards}`

    const spec = this.getEffectiveSpec({} as any)
    const finalPrompt = this.getEnrichedImagePrompt(paragraph, spec)

    return {
      sceneId: scene.id,
      prompt: finalPrompt,
      referenceImage: sequelBridgeUrl
    }
  }

  public buildAnimationPrompt(
    scene: EnrichedScene,
    imageStyle?: { characterDescription?: string }
  ): { sceneId: string; instructions: string; movements: any[] } {
    return { sceneId: scene.id, instructions: scene.animationPrompt || '', movements: [] }
  }

  // ─── Reference images ───────────────────────────────────────────────────────

  public async buildThumbnailPrompt(title: string, environment?: string, inspirationUrl?: string): Promise<string> {
    return `Series thumbnail: ${title}`
  }

  public async buildImageSystemInstruction(hasReferenceImages: boolean): Promise<string> {
    const spec = this.getEffectiveSpec({} as any)
    const characterDescription = this.buildCharacterDescription(spec, hasReferenceImages)

    return this.buildImageGenerationInstructions(hasReferenceImages, {
      characterDescription
    })
  }

  protected buildCharacterDescription(spec: VideoTypeSpecification, hasReferenceImages: boolean = false): string {
    const globalModelId = this.seriesContext.visualStyleModelId

    const charSection = Object.entries(this.seriesContext.characterRegistry)
      .map(([name, data]) => {
        const modelId = data.modelId || globalModelId
        return `Recurring Character "${name}"${!hasReferenceImages ? ` (${data.description})` : ''}${modelId ? ` (MODEL: ${modelId})` : ''}`
      })
      .join(', ')

    if (hasReferenceImages) {
      return charSection ? `Recalling characters from references: ${charSection}` : 'Character from reference.'
    }

    return [
      `Universe/Genre: ${this.seriesContext.globalContext?.slice(0, 200) || 'Series Continuity'}.`,
      spec.characterDescription || '',
      `Style episodic series consistency. ${charSection ? `Recalling characters: ${charSection}` : ''}`
    ]
      .filter(Boolean)
      .join('\n')
  }

  // ─── Static context updater ─────────────────────────────────────────────────

  /**
   * Evolves the SeriesContext for the next episode.
   * Handles both typed and legacy string cliffhangers.
   * Validates that unresolvedThreads are questions before storing them.
   */
  public static updateContext(currentContext: SeriesContext, scriptResult: any): SeriesContext {
    const metadata = scriptResult.seriesMetadata || {}

    const updatedRegistry = { ...(currentContext.characterRegistry || {}) }
    const updatedLocationRegistry = { ...(currentContext.locationRegistry || {}) }
    const updatedAssetRegistry = { ...(currentContext.assetRegistry || {}) }

    // Discover new characters from metadata
    if (metadata.newCharacters) {
      for (const [name, desc] of Object.entries(metadata.newCharacters)) {
        if (!updatedRegistry[name]) {
          updatedRegistry[name] = { description: desc as string }
        }
      }
    }

    // Discover new locations from metadata
    if (metadata.newLocations) {
      for (const [name, desc] of Object.entries(metadata.newLocations)) {
        if (!updatedLocationRegistry[name]) {
          updatedLocationRegistry[name] = { description: desc as string }
        }
      }
    }

    // Discover new assets/entities (e.g. demons, objects)
    if (metadata.newAssets) {
      for (const [name, desc] of Object.entries(metadata.newAssets)) {
        if (!updatedAssetRegistry[name]) {
          console.info(`[SeriesGenerator] ✨ New story asset discovered: ${name}`)
          updatedAssetRegistry[name] = { description: desc as string, type: 'other' }
        }
      }
    }

    // Process character continuity (Visual Evolution & Narrative Depth)
    if (metadata.characterContinuity) {
      for (const [name, data] of Object.entries(metadata.characterContinuity)) {
        if (updatedRegistry[name]) {
          const charData = data as any
          if (charData.description) updatedRegistry[name].description = charData.description
          if (charData.backstory) updatedRegistry[name].backstory = charData.backstory
          if (charData.personalGoal) updatedRegistry[name].personalGoal = charData.personalGoal

          if (charData.isNew) {
            console.info(`[SeriesGenerator] 🔄 Visual evolution for ${name}. Clearing stale portrait.`)
            updatedRegistry[name].thumbnailUrl = undefined
          }
        }
      }
    }

    // Resolve cliffhanger: prefer typed object from metadata.cliffhanger
    const nextCliffhanger: TypedCliffhanger | string | undefined =
      metadata.cliffhanger && typeof metadata.cliffhanger === 'object'
        ? (metadata.cliffhanger as TypedCliffhanger)
        : metadata.cliffhanger || currentContext.lastCliffhanger

    // Validate and warn on non-question threads
    const rawThreads: string[] = metadata.unresolvedThreads || currentContext.unresolvedThreads || []
    const warnings = validateThreadsAsQuestions(rawThreads)
    warnings.forEach((w) => console.warn(w))

    // episodeSummary: stored as-is (should be a promise, not a report)
    const episodeSummary = metadata.episodeSummary || 'Pas de résumé.'
    const episodeHistory = `Episode ${currentContext.episodeNumber}: ${episodeSummary}`

    return {
      ...currentContext,
      characterRegistry: updatedRegistry,
      locationRegistry: updatedLocationRegistry,
      assetRegistry: updatedAssetRegistry,
      lastCliffhanger: nextCliffhanger,
      unresolvedThreads: rawThreads,
      previousEpisodesContext: `${currentContext.previousEpisodesContext || ''}\n${episodeHistory}`.trim(),
      episodeNumber: currentContext.episodeNumber + 1,
      visualStyleModelId: currentContext.visualStyleModelId
    }
  }
}
