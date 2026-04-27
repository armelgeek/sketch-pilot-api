import { CharacterUniverseStore } from '../core/character-universe-store'
import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { LLMService } from '../core/llm.interface'
import type { VimaxAgent } from '../pipeline/vimax.agent'
import type {
  ArchetypeBlueprint,
  AudienceProfile,
  AuthorialSignature,
  CreativeConstraint,
  NarrativeIntent,
  NarrativeThread,
  SagaIntent,
  SagaPlan,
  SeriesContext,
  StyleLock,
  TransmediaMap,
  VimaxEvent,
  VimaxRunOptions,
  VisualAnchorState
} from '../types'
import type { VimaxAssetExtractor } from './vimax-asset-extractor.agent'
import type { VimaxAtmosphereExtractor } from './vimax-atmosphere-extractor.agent'
import type { VimaxCharacterExtractor } from './vimax-character-extractor.agent'
import type { VimaxEventExtractor } from './vimax-event-extractor.agent'
import type { VimaxLocationExtractor } from './vimax-location-extractor.agent'
import type { VimaxNarrativeExtractor } from './vimax-narrative-extractor.agent'
import type { VimaxStyleExtractor } from './vimax-style-extractor.agent'

// ─────────────────────────────────────────────
// VimaxSagaPlanner
// Étape 0 du pipeline.
// Route l'intent et amplifie une idée brute en script développé.
// Aussi utilisé en mode "motion" pour générer les imagePrompts par scène.
// ─────────────────────────────────────────────

export class VimaxSagaPlanner extends VimaxBaseAgent {
  public id = 'saga-planner'
  private styleLock: StyleLock | null = null
  private characterExtractor?: VimaxCharacterExtractor
  private locationExtractor?: VimaxLocationExtractor
  private assetExtractor?: VimaxAssetExtractor
  private atmosphereExtractor?: VimaxAtmosphereExtractor
  private narrativeExtractor?: VimaxNarrativeExtractor
  private styleExtractor?: VimaxStyleExtractor
  private eventExtractor?: VimaxEventExtractor

  constructor(llm: LLMService) {
    super(llm)
  }

  onInitialize(agent: VimaxAgent) {
    this.characterExtractor = agent.characterExtractor
    this.locationExtractor = agent.locationExtractor
    this.assetExtractor = agent.assetExtractor
    this.atmosphereExtractor = agent.atmosphereExtractor
    this.narrativeExtractor = agent.narrativeExtractor
    this.styleExtractor = agent.styleExtractor
    this.eventExtractor = agent.eventExtractor
  }

  setStyleLock(lock: StyleLock) {
    this.styleLock = lock
    this.characterExtractor?.setStyleLock(lock)
    this.locationExtractor?.setStyleLock(lock)
  }

  getStyleLock(): StyleLock | null {
    return this.styleLock
  }

  // ─── Intent Router ─────────────────────────

  // ─── Recursive Recalibration ────────────────

  /**
   * Recalibre le blueprint global en fonction des épisodes réellement générés.
   * Empêche la déviance entre le plan rigide et la réalité stochastique.
   */
  async recalibrateBlueprint(originalPlan: SagaPlan, renderedEpisodes: any[]): Promise<SagaPlan> {
    console.info(`[VimaxSagaPlanner] 🔄 Recalibration du Blueprint (N=${renderedEpisodes.length})...`)

    const prompt = `
[MISSION : RECALIBRATION DU BLUEPRINT VIVANT]
Tu es l'Architecte de Saga. Analyse le blueprint original et les épisodes réellement produits pour synchroniser la trajectoire future.

[DÉVIANCE DÉTECTÉE]
Certains milestones ou arcs de personnages ont pu dévier. Ton but est de mettre à jour le blueprint pour que l'épisode suivant reparte d'une base factuelle exacte.

[BLUEPRINT ORIGINAL]
${JSON.stringify(originalPlan.blueprint)}

[ÉPISODES RÉELS (HISTORIQUE)]
${renderedEpisodes.map((ep, i) => `ÉPISODE ${i + 1} : ${ep.summary || ep.narration.slice(0, 200)}`).join('\n')}

[RÈGLES DE RECALIBRATION]
1. MILESTONES : Si un événement prévu n'a pas eu lieu ou a changé, déplace ou reformule les milestones restants.
2. ÉVOLUTION PERSONNAGES : Mets à jour l'état psychologique des personnages (@Nom) en fonction de l'épisode précédent.
3. TENSION : Réajuste la courbe globale si l'impact spectateur a été plus/moins fort que prévu.

[FORMAT RÉPONSE JSON]
Renvoie le blueprint COMPLET mis à jour.
`.trim()

    const raw = await this.generate(
      prompt,
      "Tu es le gardien de la cohérence macrométrique d'une saga cinématographique.",
      'application/json'
    )
    const updatedBlueprint = this.parseJSONSafe<any>(raw, originalPlan.blueprint)

    return {
      ...originalPlan,
      blueprint: updatedBlueprint,
      lastRecalibration: Date.now()
    }
  }

  protected getSystemPrompt(): string {
    return 'Tu es le Cœur Stratégique de Vimax. Ton but est de transformer une idée en une saga épique, cohérente et rythmée.'
  }

  private getRouterSystem(): string {
    return `
Tu es un routeur d'intention narratif. Ton rôle est de classifier l'idée de l'utilisateur avec une précision chirurgicale.

[MISSION]
1. IDENTIFIE la catégorie technique : narrative | motion | montage | viral | dramatic.
2. DÉTERMINE le genre principal (ex: Thriller, Romance, Sci-Fi, Horror, Comedy).
3. PRÉCISE le sous-genre (ex: Psychological, Rom-Com, Space-Opera, Slasher).
4. DÉTECTE le ton dominant (ex: Tragic, Whimsical, Gritty, Epic).
5. MODÉLISE l'audience cible et le format de sortie.

[RÈGLE DE FORMAT]
Réponds UNIQUEMENT avec du JSON :
{
  "intent": "narrative | motion | montage | viral | dramatic",
  "genre": "Nom du genre",
  "subGenre": "Nom du sous-genre",
  "tone": "Ton principal",
  "audience": {
    "ageRange": "kids | teen | adult | all",
    "platform": "tiktok | youtube | cinema | podcast",
    "attentionSpan": 30,
    "culturalContext": "FR | US | JP",
    "expectedPace": "fast | medium | slow"
  },
  "narrativeIntent": {
    "voice": {
      "type": "omniscient | limited | unreliable | first_person | observer",
      "focalCharacter": "@Nom (si limited/first_person)",
      "tone": "Nom du ton",
      "distance": "close | far"
    },
    "rhythm": {
      "style": "staccato | cinematic | melancholic | action | suspended",
      "sentenceVariety": true,
      "useNominalPhrases": true,
      "elevenLabsTags": true
    },
    "grammar": {
      "dominantTense": "present | past_simple | imperfect",
      "tenseSwitching": true
    },
    "density": "sparse | balanced | dense"
  },
  "authorialSignature": {
    "worldview": "cynical | optimistic | paranoid | melancholic | absurdist | stoic",
    "themes": ["thème 1", "thème 2"],
    "stylisticSignature": "Description visuelle de l'auteur (ex: Kubrickian, Noir-Atmospheric)"
  },
  "archetypeBlueprint": {
    "structure": "hero_journey | tragedy | comedy | rebirth | overcoming_monster | quest | voyage_return",
    "protagonistArchetype": "hero | anti-hero | orphan | wanderer | rebel | ruler | magician | innocent",
    "antagonistArchetype": "shadow | threshold_guardian | shapeshifter | trickster | mentor_corrupted",
    "keyBeatsPruned": ["liste des beats narratifs fondamentaux pour cette structure"]
  },
  "transmediaMap": {
    "layers": [{ "type": "podcast | document | social_post", "purpose": "Révélation spécifique" }],
    "branchingPoints": [{ "atScene": 1, "choices": ["A", "B"], "consequences": "..." }]
  },
  "creativeConstraints": [
    { "type": "forbidden_word | fixed_length | pov_shift", "value": "valeur", "mandatory": true }
  ],
  "rationale": "Pourquoi ce choix ?"
}
`.trim()
  }

  // ─── Specialized Prompts ───────────────────

  private getSpecializedSystem(intent: SagaIntent | string, bibleContext = ''): string {
    const identDirective =
      '- IDENTIFIANTS PERSONNAGES : Utilise IMPÉRATIVEMENT le format @PascalCase (ex: @Banane, @DetectiveSmith). AUCUN ESPACE, AUCUNE APOSTROPHE.'
    const formatInstruction = `
[FORMAT RÉPONSE : ARCHITECTURE V7.0]
Renvoie UNIQUEMENT du JSON valide respectant cette structure de "Partition Musicale". 
{
  "title": "Titre spectaculaire",
  "planned_script": "Synopsis littéraire extrêmement détaillé de toute la saga.",
  "blueprint": {
    "theme": "Question philosophique",
    "premise": "Prémisse",
    "audienceContract": "Promesse",
    "characterArcs": [
      {
        "identifier": "@Nom",
        "primaryTrauma": "...",
        "initialState": "...",
        "targetTransformation": "..."
      }
    ],
    "beatSheet": [
      {
        "index": 1,
        "title": "Beat name",
        "summary": "...",
        "function": "opening_image | setup | catalyst | etc.",
        "act": 1,
        "percentageInSaga": 0,
        "tensionTarget": 5,
        "paceTarget": "slow | medium | fast"
      }
    ]
  },
  "finalCliffhanger": "...",
  "unresolved_threads": [ { "id": "...", "title": "...", "description": "..." } ]
}
`

    const intentKey = typeof intent === 'string' ? intent : intent.tone || 'narrative'
    const universe = CharacterUniverseStore.getInstance()
    const legacyCharacters = universe.getAllCharacters()
    const legacyBlock =
      legacyCharacters.length > 0
        ? `\n[MÉMOIRE DE L'UNIVERS VIMAX - PERSONNAGES DISPONIBLES]\n${legacyCharacters.map((c) => `- ${c.identifier}: ${c.physicalDescription} (${c.roleInSaga})`).join('\n')}\n`
        : ''

    return `
[RÔLE : Expert en Planification de Série - Mode ${(intentKey || 'narrative').toUpperCase()}]
Tu es un expert chargé de transformer une idée brute en un script structuré et cinématique.

${legacyBlock}
[CONSIGNE MULTIVERS]
Si l'idée de l'utilisateur s'y prête, n'hésite pas à réutiliser ou à faire référence à des personnages existants de l'[MÉMOIRE DE L'UNIVERS VIMAX] pour créer une continuité transmédia.

[EXIGENCES DE DENSITÉ NARRATIVE]
- BIBLE NARRATIVE (planned_script) : Ne te limite pas à un résumé. Rédige une bible narrative dense (Bible Arcs) détaillant chaque acte, les confrontations majeures, les enjeux dramatiques et l'évolution psychologique des protagonistes.
- LISTE COMPLÈTE DES INTERVENANTS : Identifie explicitement TOUS les personnages (@PascalCase) dès leur première apparition et assure-toi qu'ils ont un rôle défini dans le script.
- ARC COMPLET : Le script doit couvrir toute l'histoire, de l'incident déclencheur à la résolution.

[LOI DE L'ÉVOLUTION ACCÉLÉRÉE - V10.0]
- INTERDICTION DE LA STAGNATION : Interdiction formelle de répéter le même enjeu sur deux épisodes.
- CHAQUE ÉPISODE est une FRACTURE : Le monde ou le personnage doit être radicalement différent entre le début et la fin de chaque épisode.
- TRAILER-STYLE SAGA : Planifie cette saga comme une succession de chocs épiques, pas comme une série lente. Chaque battement du "beatSheet" doit être un changement de destin irréversible.

- VARIÉTÉ HUMAINE (V5.5) : Alterne entre moments extraordinaires et moments du quotidien (isDailyLife). Utilisez l'absence des leaders pour révéler d'autres personnages (absentProtagonists). Casse la linéarité avec des épisodes choraux (isChoral).

${identDirective}

${formatInstruction}

${bibleContext}
`.trim()
  }

  private getBibleContext(context: SeriesContext): string {
    const b = context.seriesBible
    if (!b || typeof b === 'string') return ''
    return `
      [BIBLE DE LA SÉRIE - SPEC]
      - GENRE : ${b.genre}
      - TON : ${b.tone}
      - STYLE VISUEL : ${b.visualStyle}
      - LOIS DE L'UNIVERS : ${b.universeLaws?.join(', ') || 'Standard'}
    `.trim()
  }

  /**
   * Étape 1 : Route l'intent et amplifie l'idée en script développé avec architecture Blueprint V7.0.
   */
  async draftSaga(
    basicIdea: string,
    options: VimaxRunOptions = {}
  ): Promise<{
    intent: SagaIntent
    script: string
    episodes: any[]
    title: string
    blueprint: any // NarrativeBlueprint
    finalCliffhanger: string
    unresolvedThreads: NarrativeThread[]
  }> {
    const { targetEpisodeCount, maxScenes, targetDuration } = options
    await CharacterUniverseStore.getInstance().load()

    // 1. Route intent
    console.info(`[VimaxSagaPlanner] 🚦 Routage de l'intention pour: "${basicIdea.slice(0, 50)}..."`)
    const routed = await this.generateStructured<{
      intent: string
      genre: string
      subGenre: string
      tone: string
      audience: AudienceProfile
      narrativeIntent?: NarrativeIntent
      authorialSignature?: AuthorialSignature
      archetypeBlueprint?: ArchetypeBlueprint
      transmediaMap?: TransmediaMap
      creativeConstraints?: CreativeConstraint[]
    }>(`<BASIC_IDEA>\n${basicIdea}\n</BASIC_IDEA>\n\nRéponds uniquement en JSON.`, this.getRouterSystem(), {
      intent: 'narrative'
    } as any)

    const intent: SagaIntent = {
      title: 'Untitled Saga',
      centralConflict: '',
      climaxAction: '',
      resolutionGoal: '',
      globalTone: routed.data.tone || 'narrative',
      genre: routed.data.genre,
      subGenre: routed.data.subGenre,
      tone: routed.data.tone,
      audience: routed.data.audience,
      narrativeIntent: routed.data.narrativeIntent,
      authorialSignature: routed.data.authorialSignature,
      archetypeBlueprint: routed.data.archetypeBlueprint,
      transmediaMap: routed.data.transmediaMap,
      creativeConstraints: routed.data.creativeConstraints
    }

    console.info(
      `[VimaxSagaPlanner] 🎯 Intention identifiée (v5.0): ${intent.authorialSignature?.worldview || 'Standard'}`
    )

    const lengthHint = targetEpisodeCount
      ? `\nCible de longueur : EXACTEMENT ${targetEpisodeCount} épisodes pour permettre un développement narratif profond.`
      : maxScenes
        ? `\nCible de longueur : ${maxScenes} scènes maximum.`
        : targetDuration
          ? `\nCible de durée : ${targetDuration} secondes.`
          : ''

    const bibleContext = this.getBibleContext({ seriesBible: options.seriesContext?.seriesBible })

    console.info(`[VimaxSagaPlanner] ✍️ Expansion du script global et architecture Blueprint v7.0...`)
    const expanded = await this.generateStructured<{
      title: string
      planned_script: string
      blueprint: any
      episodes: any[]
      finalCliffhanger: string
      unresolved_threads: Array<{ id: string; title: string; description: string }>
    }>(
      `<IDÉE_DE_BASE>\n${basicIdea}\n</IDÉE_DE_BASE>\n\nDéveloppe cette idée en une BIBLE NARRATIVE COMPLÈTE ET DÉTAILLÉE.${lengthHint} 
[CONSIGNE DE PROFONDEUR] : Le champ "planned_script" doit être extrêmement riche. Décris précisément l'arc narratif global, les motivations de chaque personnage (@PascalCase), les environnements traversés et la progression de la tension dramatique. Ne fais aucune ellipse sur les moments clés.

Crée un TITRE CINÉMATIQUE et accrocheur pour la saga globale. [LOI DU CLIFFHANGER ORGANIQUE] : Le dernier épisode du batch actuel DOIT apporter une conclusion satisfaisante à l'arc principal TOUT EN révélant une conséquence imprévue, un secret lié aux événements passés ou un nouveau défi qui découle directement de l'histoire précédente (OUVERTURE). Identifie ce crochet dans le champ "finalCliffhanger" et liste les pistes narratives non résolues dans "unresolved_threads". Le crochet doit sembler être la "suite logique" et non un événement parachuté. Évite les raccourcis narratifs ; prends le temps d'installer les enjeux et les émotions.${targetEpisodeCount ? ` Structure l'histoire en ${targetEpisodeCount} actes bien distincts.` : ''}\n\nRéponds uniquement en JSON.`,
      this.getSpecializedSystem(intent, bibleContext),
      {
        title: 'Saga sans titre',
        planned_script: basicIdea,
        blueprint: {
          theme: '',
          premise: '',
          audienceContract: '',
          characterArcs: [],
          beatSheet: []
        },
        episodes: [],
        finalCliffhanger: '',
        unresolved_threads: []
      }
    )

    return {
      intent,
      title: expanded.data.title,
      script: expanded.data.planned_script,
      blueprint: expanded.data.blueprint,
      episodes: [],
      finalCliffhanger: expanded.data.finalCliffhanger,
      unresolvedThreads: (expanded.data.unresolved_threads || []).map((t: any) => ({ ...t, status: 'active' as const }))
    }
  }

  /**
   * Étape 2 : Extrait les registres (personnages, lieux, etc.) à partir d'un script existant.
   */
  async enrichSaga(script: string, options: VimaxRunOptions = {}): Promise<Partial<SagaPlan>> {
    console.info(`[VimaxSagaPlanner] 🔍 Orchestration des extractions...`)

    if (this.styleLock) {
      this.characterExtractor?.setStyleLock(this.styleLock)
      this.locationExtractor?.setStyleLock(this.styleLock)
    } else if (options.referenceStyleImage && this.styleExtractor) {
      console.info("[VimaxSagaPlanner] 🎨 Extraction tardive du style à partir de l'image de référence...")
      const lock = await this.styleExtractor.extractStyle(options.referenceStyleImage)
      this.setStyleLock(lock)
    }

    const [characterRegistry, locationRegistry, assetRegistry, atmosphereData, narrativeData] = await Promise.all([
      this.characterExtractor
        ? (async () => {
            console.info('[VimaxSagaPlanner] 🎭 Extraction des personnages...')
            return await this.characterExtractor!.extractCharacters(script)
          })()
        : Promise.resolve([]),
      this.locationExtractor
        ? (async () => {
            console.info('[VimaxSagaPlanner] 📍 Extraction des lieux...')
            return await this.locationExtractor!.extractLocations(script)
          })()
        : Promise.resolve([]),
      this.assetExtractor
        ? (async () => {
            console.info('[VimaxSagaPlanner] 📦 Extraction des assets...')
            return await this.assetExtractor!.extractAssets(script)
          })()
        : Promise.resolve([]),
      this.atmosphereExtractor
        ? (async () => {
            console.info("[VimaxSagaPlanner] 🌫️ Extraction de l'atmosphère...")
            return await this.atmosphereExtractor!.extractAtmosphere(script)
          })()
        : Promise.resolve({ atmosphere: {}, visualEvolution: {} }),
      this.narrativeExtractor
        ? (async () => {
            console.info('[VimaxSagaPlanner] 📖 Extraction de la narration...')
            return await this.narrativeExtractor!.extractNarrative(script)
          })()
        : Promise.resolve({ unresolvedThreads: [], roadmap: {}, relationshipMap: {} })
    ])

    return {
      characterRegistry,
      locationRegistry,
      assetRegistry,
      unresolvedThreads: (narrativeData as any).unresolvedThreads,
      roadmap: (narrativeData as any).roadmap,
      atmosphere: (atmosphereData as any).atmosphere,
      visualEvolution: (atmosphereData as any).visualEvolution,
      relationshipMap: (narrativeData as any).relationshipMap
    }
  }

  async planSaga(basicIdea: string, options: VimaxRunOptions = {}): Promise<SagaPlan> {
    const draft = await this.draftSaga(basicIdea, options)

    console.info(
      `[VimaxSagaPlanner] 🛣️ Stage 2: Extraction de la roadmap (${options.targetEpisodeCount || 'auto'} épisodes)...`
    )

    if (!this.eventExtractor) {
      throw new Error('[VimaxSagaPlanner] VimaxEventExtractor is required for multi-episode planning.')
    }

    const episodeEvents = await this.eventExtractor.extractEvents(
      draft.script,
      'series',
      options.targetDuration,
      options.maxScenes,
      options.targetEpisodeCount,
      `BASE TOI SUR CE BLUEPRINT :\n${JSON.stringify(draft.blueprint, null, 2)}`
    )

    console.info(`[VimaxSagaPlanner] 🎬 Stage 3: Detailing scenes for ${episodeEvents.length} episodes...`)

    const episodes = []
    for (const event of episodeEvents) {
      console.info(`   - Planning scenes for Episode ${event.index + 1}: ${event.description.slice(0, 30)}...`)
      const scenes = await this.planEpisodeScenes(event, draft.script, options)
      episodes.push({
        episodeNumber: event.index + 1,
        eventIndex: event.index,
        title: event.description,
        summary: event.description,
        eventDescription: event.description,
        hook: event.description,
        dramaticFunction: event.dramaticFunction,
        actPosition: `${event.actPosition?.act || 1}`,
        tensionTarget: event.tensionTarget || 5,
        paceTarget: event.paceTarget || 'medium',
        impactedCharacters: (event.characterImpacts || []).map((i) => i.identifier),
        isDailyLife: event.isDailyLife,
        isChoral: event.isChoral,
        absentProtagonists: event.absentProtagonists,
        scenes
      })
      event.scenes = scenes
    }

    const enrichment = await this.enrichSaga(draft.script, options)

    console.info('[VimaxSagaPlanner] ✅ Planification de saga multi-pass terminée.')

    const plan: SagaPlan = {
      ...draft,
      ...enrichment,
      episodes,
      episodeEvents,
      basicIdea,
      options
    } as any

    return plan
  }

  async planEpisodeScenes(
    episodeEvent: VimaxEvent,
    globalScript: string,
    options: VimaxRunOptions = {}
  ): Promise<any[]> {
    const system = `
Tu es le Scénariste de Détail de Vimax Architecture (v21.0).
Ta mission est de découper un ÉPISODE de saga en EXACTEMENT 6 scènes ultra-détaillées (10s par scène).
Assure une PROGRESSION DRAMATIQUE : la Scène 1 DOIT être un "Setup" (Normalité, Enjeux). Pas d'action brutale dès le début.
L'action monte crescendo vers le Climax en Scène 5.
[BANNISSEMENT DU MICRO-DÉTAIL - V30.0] : Chaque scène doit faire AVANCER l'histoire de façon massive. Interdiction de scènes statiques (juste regarder, réfléchir, ou un geste mineur).

[CONTEXTE GLOBAL DE LA SAGA]
${globalScript.slice(0, 2000)}

[ÉPISODE À DÉTAILLER]
- Description : ${episodeEvent.description}
- Fonction Dramatique : ${episodeEvent.dramaticFunction}
- Tension Cible : ${episodeEvent.tensionTarget}/10

[DIRECTIVES DE SCÈNE]
Pour chaque scène, fournis :
1. objective : L'objectif dramatique précis.
2. characters : Liste des IDs @PascalCase présents.
3. characterState : L'état physique/émotionnel (ex: "haletant", "regard froid").
4. locationId : L'identifiant @Lieu.
5. function : établissement | confrontation | pivot | révélation | climax.
6. framing : Plan large | Plan moyen | Gros plan | Très gros plan.
7. cameraAngle : Plongée | Contre-plongée | Face | Profil | Holandais.
8. focusSubject : Le sujet central précis de la scène (ex: "Le couteau sur la table", "Le regard de @Nom", "La porte qui s'entrouvre").
9. tensionTarget : 1-10.
10. obligatory : Contrainte visuelle ou narrative.
11. transitionType : continuation | transition | rupture.

[LOI DE LA CONTINUITÉ - V45.0]
- continuation : Même moment, même lieu, mêmes personnages. L'action suit directement la résolution de la scène précédente sans saut.
- transition : Changement de lieu ou de personnage principal (POV).
- rupture : Saut temporel ou émotionnel majeur (Ellipse).

[LOI DE L'EXTENSION SPATIALE - V31.0]
- ANCRAGE FLUIDE : Le 'locationId' est une ancre. Tu as le DROIT d'improviser des sous-lieux ou des lieux de transition (ex: "Un couloir vers @RegistryItem", "Une ruelle près de @RegistryItem").
- VARIÉTÉ VISUELLE : Ne reste pas dans le même cadrage si l'action avance. Change d'angle ou de pièce.
- BANNIS DANS L'OBJECTIVE : "regarde", "pense". Focus sur le MOUVEMENT entre les espaces.

[LOI DU DÉPLACEMENT MACROSCOPIQUE - V30.0]
- VITESSE NARRATIVE : Chaque 10s doit couvrir une action MAJEURE. Pas de surplace.
- CONSÉQUENCE : La scène N doit se terminer par un changement irréversible pour le personnage (lieu atteint, objet perdu, blessure reçue, vérité découverte).
- BANNIS DANS L'OBJECTIVE : "regarde", "pense", "ajuste", "soupire". Focus sur le RÉSULTAT et le DÉPLACEMENT physique.

[LOI DE L'OUVERTURE PROGRESSIVE - V26.0]
- SCÈNE 1 (SETUP) : Tension 1-3. Focus sur l'équilibre, le quotidien ou la mise en place. Interdiction de combat ou de fracture irréversible ici.
- SCÈNE 2 (INCIDENT) : Tension 4-5. L'élément déclencheur qui rompt le Setup.
- SCÈNE 5 (CLIMAX) : Tension 9-10. Le pic de l'épisode. Fracture totale.
- SCÈNE 6 (HOOK) : Tension 4-6. Lendemain, conséquence ou nouvelle menace.

[LOI DU RYTHME FLUIDE - V25.0]
- CLARTÉ NARRATIVE : Chaque scène doit être un maillon INTELLIGIBLE d'une histoire continue.
- MOUVEMENT N-1 vers N : L'objective doit décrire comment on arrive dans la scène.
- BANNIS DANS L'OBJECTIVE : "cheveux", "vêtements", "yeux". Focus sur le DÉPLACEMENT et le CHANGEMENT.

[LOI DE LA CONSTANCE SECONDAIRE - V24.1]
- Si un personnage secondaire (@Nom) est introduit, il doit être LISTÉ dans le champ "characters" de chaque scène où il est physiquement présent.
- [VERROUILLAGE DES FIGURANTS] : Interdiction d'ajouter des personnages génériques non identifiés dans les scènes. Utilise uniquement le registre extrait.
- CONSÉQUENCE : Si la narration mentionne une interaction avec une "foule" ou un "passant", cet acteur doit être identifié (@Foule, @Passant) pour garantir la continuité du rendu IA.

[LOI DU VÉROUILLAGE TEMPOREL - V24.0]
- Interdiction absolue de sauter d'une époque (ex: 1885) à une autre (Moderne) sans un saut narratif de type 'VISION' ou 'TRANSITION' explicite. La Foule doit porter des vêtements de l'époque active.

[LOI DU ZÉRO DOUBLON] : Interdiction absolue de répéter le même verbe d'action ou le même objet focal sur plus d'une scène par épisode.

[MODE TRAILER : 1 SCÈNE = 1 CHAPITRE ÉMOTIONNEL]
Tu travailles sur 6 scènes (10s chacune). Chaque bloc doit marquer un saut temporel ou émotionnel clair (Ellipse).

[FORMAT RÉPONSE JSON]
{
  "scenes": [
    {
      "sceneNumber": 1,
      "function": "...",
      "objective": "...",
      "framing": "...",
      "cameraAngle": "...",
      "focusSubject": "...",
      "characters": ["@Nom"],
      "characterState": { "@Nom": "..." },
      "locationId": "@Lieu",
      "locationContext": "description du sous-lieu improvisé (ex: @House - Dans le grenier)",
      "tensionTarget": 5,
      "paceTarget": "medium",
      "obligatory": "...",
      "transitionType": "continuation | transition | rupture",
      "prepares": "ce qui suit"
    }
  ]
}
`.trim()

    const result = await this.generateStructured<{ scenes: any[] }>(
      `Détaille les scènes pour l'épisode : "${episodeEvent.description}"`,
      system,
      { scenes: [] }
    )

    return result.data.scenes.map((s, i) => ({
      ...s,
      sceneNumber: s.sceneNumber || i + 1,
      tensionTarget: s.tensionTarget || episodeEvent.tensionTarget || 5,
      paceTarget: s.paceTarget || episodeEvent.paceTarget || 'medium'
    }))
  }

  async extendSaga(existingPlan: SagaPlan, additionalCount: number, options: VimaxRunOptions = {}): Promise<SagaPlan> {
    const previousScript =
      typeof existingPlan.intent === 'string' ? existingPlan.script : (existingPlan as any).script || ''

    const previousEpisodes = existingPlan.episodes
      .map((ep, i) => `[ÉPISODE ${ep.episodeNumber}] ${ep.summary || ep.eventDescription}`)
      .join('\n')

    const intent = existingPlan.intent
    const bibleContext = this.getBibleContext({ seriesBible: options.seriesContext?.seriesBible })

    const prompt = `
      [MISSION : EXTENSION DE SAGA - PARTIE 2]
      Voici le script et le résumé des épisodes précédents d'une saga. 
      Ta mission est de générer une SUITE cohérente (Arc 2) de EXACTEMENT ${additionalCount} nouveaux épisodes.

      [RAPPEL DU CONTEXTE PRÉCÉDENT]
      ${previousScript}

      [RAPPEL DES ÉPISODES PRÉCÉDENTS]
      ${previousEpisodes}

      Génère un script de suite et le plan des ${additionalCount} nouveaux épisodes. 
      Assure-toi que les personnages conservent leurs identifiants @PascalCase et que l'intrigue suit logiquement le cliffhanger ou la situation finale du dernier épisode.

      Réponds uniquement en JSON.
`.trim()

    const expanded = await this.generateStructured<{
      title: string
      planned_script: string
      episodes: any[]
      finalCliffhanger: string
      unresolved_threads: Array<{ id: string; title: string; description: string }>
    }>(prompt, this.getSpecializedSystem(intent, bibleContext), {
      title: existingPlan.title,
      planned_script: '',
      episodes: [],
      finalCliffhanger: '',
      unresolved_threads: []
    })

    const script = expanded.data.planned_script
    const episodes = expanded.data.episodes

    const characterRegistry = this.characterExtractor ? await this.characterExtractor.extractCharacters(script) : []
    const locationRegistry = this.locationExtractor ? await this.locationExtractor.extractLocations(script) : []
    const assetRegistry = this.assetExtractor ? await this.assetExtractor.extractAssets(script) : []
    const atmosphereData = this.atmosphereExtractor
      ? await this.atmosphereExtractor.extractAtmosphere(script)
      : { atmosphere: {}, visualEvolution: {} }
    const narrativeData = this.narrativeExtractor
      ? await this.narrativeExtractor.extractNarrative(script)
      : { unresolvedThreads: [], roadmap: {}, relationshipMap: {} }

    return {
      intent,
      title: expanded.data.title,
      script,
      episodes,
      episodeEvents: episodes.map((ep) => ({
        index: ep.episodeNumber - 1,
        description: ep.eventDescription,
        tensionTarget: ep.tensionTarget,
        paceTarget: ep.paceTarget,
        dramaticFunction: ep.dramaticFunction
      })) as any,
      characterRegistry,
      locationRegistry,
      assetRegistry,
      unresolvedThreads: (narrativeData as any).unresolvedThreads,
      roadmap: (narrativeData as any).roadmap,
      atmosphere: (atmosphereData as any).atmosphere,
      visualEvolution: (atmosphereData as any).visualEvolution,
      relationshipMap: (narrativeData as any).relationshipMap
    }
  }

  async generateImagePrompt(
    narrationSegment: string,
    characterContext = '',
    previousAnchor: VisualAnchorState | string | null = null,
    isClimax = false,
    correctionHint?: string,
    context: SeriesContext = {},
    previousVisualBeat?: string,
    transitionType?: string,
    cinematicIntent?: { lightingMood?: string; shotType?: string; framing?: string }, // [V8.6] Cinematic coherence
    dialogue?: string // [V8.9] Acting & Expression alignment
  ): Promise<{ imagePrompt: string; visualAnchor: VisualAnchorState; visualBeat: string }> {
    // [V32.0] Récupération du décor pur depuis le registre (Découplage visuel)
    const locationId =
      context.plannedSceneContext?.locationId ||
      (typeof previousAnchor === 'object' && previousAnchor?.worldState?.locationId)
    const locationState = locationId && context.locationRegistry ? context.locationRegistry[locationId] : null

    const dynamicWorldState =
      typeof previousAnchor === 'object' && previousAnchor?.worldState
        ? Object.entries(previousAnchor.worldState)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
        : ''
    const locationDecorSection = locationState
      ? `\n\n[DÉCOR DE BASE DU LIEU - SANS PERSONNAGES]\n${locationState.baseVisualPrompt}\n${locationState.modifications && locationState.modifications.length > 0 ? `Modifications permanentes : ${locationState.modifications.join(', ')}` : ''}${dynamicWorldState ? `\nÉtat dynamique actuel : ${dynamicWorldState}` : ''}`
      : ''

    const anchorSection = previousAnchor
      ? `\n\n[MÉMOIRE VISUELLE (CONTINUITÉ SCÈNE PRÉCÉDENTE)]\n${typeof previousAnchor === 'string' ? previousAnchor : JSON.stringify(previousAnchor, null, 2)}`
      : ''

    const climaxDirective = isClimax
      ? "\n- IMPACT VISUEL : Ajoute systématiquement un impact physique violent (projection, onde de choc, étincelles, fumée épaisse) car c'est le point culminant."
      : ''

    const lastLocationIdFromAnchor =
      typeof previousAnchor === 'object' && previousAnchor?.worldState?.locationId
        ? previousAnchor.worldState.locationId
        : null

    const continuityDirective =
      previousVisualBeat && locationId === lastLocationIdFromAnchor
        ? `\n\n[CONTINUITÉ DÉCOR - MÊME LIEU]\nL'instant précédent était : "${previousVisualBeat}".\nAssure-toi que les éléments du décor (objets déplacés, lumière, débris) sont COHÉRENTS avec cet instant précédent.`
        : ''

    const transitionDirective =
      transitionType === 'continuation'
        ? `\n\n[LOI DE LA VARIATION DOUCE - CONTINUATION DIRECTE]\nCette scène est la SUITE DIRECTE de l'instant précédent sans ellipse.\nL'image doit être une variation légère (même angle, même focale, mouvement d'acteur continu).`
        : ''

    const styleBlock = this.styleLock
      ? `
[STYLE VISUEL LOCKÉ - OBLIGATOIRE]
- Style : ${this.styleLock.visualStyle}
- Palette : ${this.styleLock.colorPalette.join(', ')}
- Termes interdits : ${this.styleLock.forbiddenTerms.join(', ')}
- Termes requis : ${this.styleLock.mandatoryTerms.join(', ')}
`.trim()
      : ''

    const vs = this.styleLock?.visualStyle.toLowerCase() || ''
    const isWhiteboard = vs.includes('whiteboard') || vs.includes('croquis') || vs.includes('illustration')
    const role = isWhiteboard ? "Directeur de l'Illustration" : 'Directeur de la Photographie'

    const compositionDirective = isWhiteboard
      ? '- COMPOSITION : Dessine le sujet @Nom au premier plan.'
      : "- COMPOSITION : Le sujet @Nom doit être l'élément central."

    const lightDirective = isWhiteboard
      ? "- STYLE : Pas d'ombrage complexe. Fond blanc pur."
      : '- GRAMMAIRE DE LA LUMIÈRE : Nomme impérativement une SOURCE et une COULEUR.'

    const system = `
${role}
${styleBlock}
- IDENTIFIANTS : Utilise UNIQUEMENT @Nom.
- STRICT PRESENCE : Ne dessine JAMAIS de personnage non mentionné.
${compositionDirective}
${lightDirective}
- [LOI DE L'ISOLATION DU DÉCOR - V32.0] : Tu travailles sur un décor nu. IGNORE les personnages passés qui n'apparaissent pas dans la narration actuelle.
- [LOI DE L'ÉPHÉMÉRITÉ DES ACTANTS - V34.0] : Tout objet (prop) ou position est LOCAL à la scène. N'inclus JAMAIS dans 'activeProps' ou 'characterPositions' un élément qui n'est pas vu dans la narration actuelle.
- [COHÉRENCE SPATIALE] : Utilise les éléments du bloc [DÉCOR DE BASE] pour garantir que le lieu est le même, mais traite chaque scène comme une image NEUVE pour les acteurs et les objets. Fais abstraction de toute image de référence passée.
- [LOI DU MOMENT DÉCISIF - V36.0] : La narration peut décrire plusieurs actions successives. Tu dois IDENTIFIER l'instant T de tension maximale (le "frozen moment") et ne dessiner QUE cet instant. Interdiction de faire une moyenne visuelle du début et de la fin de l'action narrative.
- [LOI DES 3 PLANS] : Décris 1. Premier Plan (@Nom) | 2. Plan Moyen | 3. Arrière-Plan (Décor du lieu).
- [LOI DE L'INTÉGRATION DU DÉCOR] : Tu DOIS impérativement utiliser les éléments physiques décrits dans le bloc [DÉCOR DE BASE DU LIEU] (ex: murs, météo, objets fixes) pour construire ton 'imagePrompt'.
- [SYNTHÈSE VISUELLE : L'IMAGE-CLEF] : La narration contient souvent plusieurs micro-actions. Tu DOIS synthétiser le segment en UNE SEULE IMAGE FIXE qui représente le point de bascule ou l'instant le plus iconique.
- [FIDÉLITÉ NARRATIVE] : Ton prompt doit être le MIROIR VISUEL exact de la narration. Si la narration dit "elle tend une allumette", le visuel ne peut pas la montrer en train de marcher.
- [LOI DE L'ACTING ET DU DIALOGUE - V8.9] : Utilise le texte du 'dialogue' fourni pour décrire précisément l'expression faciale et la posture du personnage (ex: bouche ouverte s'il crie, regard fuyant s'il ment).
- [LOI DE L'ÉVOLUTION DU DÉCOR - V8.4] : Si une action narrative modifie l'environnement (ex: explosion, objet brisé, porte ouverte), tu DOIS le noter dans le champ 'worldState' pour que les scènes suivantes en héritent.
- PAS de métaphores. Description visuelle pure et synthétique.

${this.getGlobalScriptBlock(context)}
${this.getEpisodePlanBlock(context)}
${this.getScenePlanBlock(context)}

${cinematicIntent?.lightingMood ? `\n[CINEMATIC LIGHTING OBLIGATOIRE]\n- AMBIANCE : ${cinematicIntent.lightingMood}\n- DIRECTIVE : Ton imagePrompt doit impérativement retranscrire cette ambiance lumineuse précise.` : ''}
${cinematicIntent?.shotType ? `\n[CINEMATIC FRAMING OBLIGATOIRE]\n- TYPE DE PLAN : ${cinematicIntent.shotType}\n- DIRECTIVE : Respecte strictement ce cadrage dans ta description visuelle.` : ''}
`.trim()

    const characterSection = characterContext
      ? `\n\n[LISTE DES PERSONNAGES]\n${characterContext}\n[/LISTE DES PERSONNAGES]`
      : ''
    const visualStyleTag = this.styleLock?.visualStyle || '3D animation render, Pixar style, 8K'

    const styleDirective = `[LOI DU LANGAGE CINÉMATOGRAPHIQUE - V40.1]
Génère une SYNTHÈSE visuelle narrative et fluide en ANGLAIS (Cohesive Descriptive Paragraph).
N'utilise PAS de listes numérotées, PAS de labels, et PAS de pipes (|).
Combine le décor, l'éclairage, la position de @Nom et l'action précise dans un paragraphe RICHE et TECHNIQUE optimisé pour un générateur d'images HD.`

    const framingDirective = context.plannedSceneContext?.framing
      ? `\n[FRAMING] : ${context.plannedSceneContext.framing}`
      : ''
    const angleDirective = context.plannedSceneContext?.cameraAngle
      ? `\n[CAMERA_ANGLE] : ${context.plannedSceneContext.cameraAngle}`
      : ''
    const focusDirective = context.plannedSceneContext?.focusSubject
      ? `\n[FOCUS_SUBJECT] : ${context.plannedSceneContext.focusSubject}`
      : ''

    const result = await this.generateStructured<{
      visualBeat: string
      imagePrompt: string
      visualAnchor: VisualAnchorState
    }>(
      `\n<NARRATION>\n${narrationSegment}\n</NARRATION>${locationDecorSection}${anchorSection}${continuityDirective}${transitionDirective}${framingDirective}${angleDirective}${focusDirective}${dialogue ? `\n\n[DIALOGUE POUR L'ACTING]\n${dialogue}` : ''}${characterSection}\n\n${styleDirective}${climaxDirective}${correctionHint ? `\n\n[CORRECTION] : ${correctionHint}` : ''}
\nGénère le prompt technique en ANGLAIS sous forme de paragraphe narratif.
{ 
  "visualBeat": "Description d'une phrase de l'instant T choisi (ex: @Lucas renverse la table)",
  "imagePrompt": "A detailed descriptive paragraph capturing the scene...", 
  "visualAnchor": { 
    "dominantLight": "...", 
    "cameraAxis": "...", 
    "activeProps": [],
    "characterStates": { "@Nom": "Current physical/emotional state (e.g. bleeding arm, soaking wet)" },
    "worldState": { "environment_change": "Description of persistent change (e.g. table broken, glass on floor)", "locationId": "..." }
  } 
}
`,
      system,
      {
        visualBeat: '',
        imagePrompt: '',
        visualAnchor: {
          dominantLight: 'neutral',
          cameraAxis: 'standard',
          activeProps: [],
          characterStates: {},
          worldState: { locationId: locationId || 'unknown' }
        }
      }
    )

    return result.data
  }
}
