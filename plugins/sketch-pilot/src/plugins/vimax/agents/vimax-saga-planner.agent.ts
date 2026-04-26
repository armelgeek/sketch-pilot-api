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

  // ─── Public API ────────────────────────────

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
      episodes: [], // Sera rempli par Pass 2
      finalCliffhanger: expanded.data.finalCliffhanger,
      unresolvedThreads: (expanded.data.unresolved_threads || []).map((t: any) => ({ ...t, status: 'active' as const }))
    }
  }

  /**
   * Étape 2 : Extrait les registres (personnages, lieux, etc.) à partir d'un script existant.
   */
  async enrichSaga(script: string, options: VimaxRunOptions = {}): Promise<Partial<SagaPlan>> {
    console.info(`[VimaxSagaPlanner] 🔍 Orchestration des extractions...`)

    const narrativeExtractor = this.narrativeExtractor

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

  /**
   * Orchestration Séquentielle 3-Pass (V8.0)
   * 1. Bible & Blueprint (Draft)
   * 2. Roadmap Extraction (Event Decomposition)
   * 3. Scene Detailing (Per-episode loop)
   */
  async planSaga(basicIdea: string, options: VimaxRunOptions = {}): Promise<SagaPlan> {
    // PASS 1 : Bible & Blueprint
    const draft = await this.draftSaga(basicIdea, options)

    // PASS 2 : Décomposition en Épisodes (Roadmap)
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

    // PASS 3 : Planification des Scènes par Épisode (Deep Planning)
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
      for (const scene of scenes) {
        console.info(`     > Scène ${scene.sceneNumber}: ${scene.objective}`)
      }
      // Update event with detailed scenes for later use
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

    // Alias legacy
    ;(plan as any).plan = {
      ...draft,
      episodes: plan.episodes
    }

    return plan
  }

  /**
   * Stage 3 : Planifie les scènes détaillées pour un épisode spécifique.
   * Isole l'épisode pour éviter la saturation du LLM.
   */
  async planEpisodeScenes(
    episodeEvent: VimaxEvent,
    globalScript: string,
    options: VimaxRunOptions = {}
  ): Promise<any[]> {
    const system = `
Tu es le Scénariste de Détail de Vimax Architecture (v21.0).
Ta mission est de découper un ÉPISODE de saga en EXACTEMENT 6 scènes ultra-détaillées (10s par scène).

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

[LOI DU STORYTELLING ÉVOCATEUR - V22.0]
- CLARTÉ NARRATIVE : Chaque scène doit être un maillon INTELLIGIBLE d'une histoire.
- IMAGERIE PHYSIQUE : L'objective doit utiliser une imagerie forte (ex: "La flamme danse dans le vent", "Lucas déchire sa chemise pour bander sa plaie").
- BANNIS : "présenter", "découvrir", "réfléchir", "tension", "ambiance".
- LOI DU CHANGEMENT D'ÉTAT : Un personnage doit radicalement changer d'état entre la Scène 1 et la Scène 6. Planifie une trajectoire de FRACTURE.

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
      "tensionTarget": 5,
      "paceTarget": "medium",
      "obligatory": "...",
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

  /**
   * Étend une saga existante avec de nouveaux épisodes.
   */
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

    // Extraction complète pour le nouvel Arc
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
      finalCliffhanger: expanded.data.finalCliffhanger,
      characterRegistry,
      locationRegistry,
      assetRegistry,
      unresolvedThreads: [
        ...existingPlan.unresolvedThreads.filter((t) => t.status === 'resolved'),
        ...expanded.data.unresolved_threads.map((t) => ({ ...t, status: 'active' as const }))
      ],
      roadmap: narrativeData.roadmap,
      atmosphere: atmosphereData.atmosphere,
      visualEvolution: atmosphereData.visualEvolution,
      relationshipMap: narrativeData.relationshipMap,
      episodeEvents: []
    } as SagaPlan
  }

  /**
   * Génère un imagePrompt cinématique à partir d'un segment de narration.
   * Utilise un 'anchor' (état visuel de la scène précédente) pour garantir la continuité spatiale et lumineuse.
   */
  async generateImagePrompt(
    narrationSegment: string,
    characterContext = '',
    previousAnchor: VisualAnchorState | string | null = null,
    isClimax = false,
    correctionHint?: string,
    context: SeriesContext = {}
  ): Promise<{ imagePrompt: string; visualAnchor: VisualAnchorState }> {
    const anchorData = typeof previousAnchor === 'string' ? previousAnchor : JSON.stringify(previousAnchor, null, 2)

    const anchorSection = previousAnchor
      ? `\n\n[RÉFÉRENCE VISUELLE PRÉCÉDENTE]\n${anchorData}\n\n[DIRECTIVE] Utilise cet état pour maintenir la cohérence de l'AXE CAMÉRA et de la POSITION des personnages. 
${context.locationChanged ? "[RUPTURE VISUELLE OBLIGATOIRE] : Le lieu a changé. IGNORE la lumière de la scène précédente. Crée un contraste de lumière et d'atmosphère RADICAL par rapport à l'anchor précédente." : 'Assure-toi que la nouvelle scène est spatialement et lumineusement cohérente avec la précédente.'}`
      : ''

    const climaxDirective = isClimax
      ? "\n- IMPACT VISUEL : Ajoute systématiquement un impact physique violent (projection, onde de choc, étincelles, fumée épaisse) car c'est le point culminant."
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
    const isWhiteboard =
      vs.includes('whiteboard') ||
      vs.includes('bâton') ||
      vs.includes('stick figure') ||
      vs.includes('croquis') ||
      vs.includes('dessin') ||
      vs.includes('illustration') ||
      vs.includes('comics') ||
      vs.includes('manga') ||
      vs.includes('animation 2d')

    const role = isWhiteboard
      ? "Tu es le Directeur de l'Illustration et Concept Artist."
      : 'Tu es le Directeur de la Photographie et Superviseur VFX.'

    const compositionDirective = isWhiteboard
      ? "- COMPOSITION : Dessine le sujet @Nom au premier plan. Si l'action est centrée sur un détail ou un geste, focalise le dessin sur ce point précis (gros plan). Sinon, montre le sujet en entier."
      : "- COMPOSITION : Adapte la distance focale à la narration. Le sujet @Nom doit être l'élément central. Si la narration décrit une action précise (ex: toucher un objet), utilise un GROS PLAN. S'il s'agit d'une action globale ou d'une découverte de lieu, utilise un PLAN LARGE incluant l'environnement et l'éclairage."

    const lightDirective = isWhiteboard
      ? "- STYLE : Pas d'ombrage complexe. Fond blanc pur. Traits noirs."
      : '- GRAMMAIRE DE LA LUMIÈRE : Interdiction de l\'expression "éclairage vif". Utilise : "lumière stroboscopique d\'alarme", "lumière rouge intermittente", "ombres dures projetées par le bas", "flash blanc aveuglant".'

    const system = `
${role}
${styleBlock}
- IDENTIFIANTS : Utilise UNIQUEMENT l'identifiant @Nom (ex: @Banane, @Alexandre). Fais correspondre exactement leur profil visuel. [OBLIGATION] PROTECT THE IDENTITY : Ne simplifie jamais les traits physiques fournis ; ils sont la clé de la cohérence visuelle.
- STRICT PRESENCE : Ne dessine JAMAIS de personnage qui n'est pas explicitement mentionné dans la narration. L'ajout d'un personnage non mentionné est une erreur grave.
${compositionDirective}
${lightDirective}
- CAMÉRA TECHNIQUE : Utilise impérativement le cadrage [FRAMING], l'angle [CAMERA_ANGLE] et le sujet focal [FOCUS_SUBJECT] demandés.
- FOCUS VISUEL : Met en avant le [FOCUS_SUBJECT] au premier plan.
- CAMÉRA NARRATIVE : Adapte le cadrage aux détails de la narration. Si un détail est accentué, passe en GROS PLAN si le [FRAMING] global le permet.
- [LOI DES 3 PLANS] : Décris EXPLICITEMENT : 1. Premier Plan (Sujet focal @Nom) | 2. Plan Moyen (Action/Interaction) | 3. Arrière-Plan (Profondeur/Décor).
- [BANNISSEMENT DES ADJECTIFS] : Interdiction absolue d'utiliser : "sombre", "mystérieux", "épique", "angoissant", "magnifique". 
- OBLIGATION DE PREUVE PHYSIQUE : Remplace l'adjectif par un fait (ex: au lieu de "sombre", dis "murs de béton brut noirs, une seule ampoule nue").
- GRAMMAIRE DE LA LUMIÈRE : Nomme impérativement une SOURCE et une COULEUR (ex: "néon bleu glacial", "lueurs d'incendie orange", "faisceau de lampe torche blanc").
- CAUSALITÉ VISUELLE : Décris les ACTIONS concrètes (ex: une barre de fer tombe, une étincelle jaillit).
- [LOI DE L'INNOVATION VISUELLE] : INTERDICTION ABSOLUE de répéter les mêmes sources de lumière (ex: néon, bougie), les mêmes couleurs dominantes ou les mêmes objets de décor que la scène précédente si le lieu a changé. Chaque prompt doit être une découverte visuelle.
- PAS de métaphores. Description visuelle pure.
- [CONTINUITÉ LUMINEUSE] Assure la cohérence avec le reste de la série.
- [ISOLATION] IGNORE TOUT ce qui est entre crochets [Action / Émotion].
- INTERDICTION d'utiliser des crochets ou des tags rigides.

${this.getGlobalScriptBlock(context)}

${this.getEpisodePlanBlock(context)}

[EXEMPLE GOLDEN 1 - VUE LARGE / DÉTAIL DÉCOR]
dimly lit ancient city street, winter storm, thick uneven snow, stone buildings, gas lamp orange glow, wet cobblestones, Wide shot, eye level, @Little Girl, cylindrical brown body, large blue eyes, bundle of matches, standing center, trembling, faces toward right, @Passersby walking away in background, backs turned, 3D animation render, Pixar style, 8K, sharp focus, cold blue dominant light, warm orange accent from lamp, long eerie shadows, 16:9 cinematic ratio, no text, no watermark.

[EXEMPLE GOLDEN 2 - GROS PLAN / VFX MIRAGE]
dark alleyway at night, deep shadows, floating embers, translucent outline of an ornate black iron stove, shimmering table with golden plates superimposed, Close-up, @Little Girl, thin wooden fingers, holding single burning matchstick between fingers and camera, face bathed in flickering golden light, match flame foreground, glowing mirage of black Victorian iron stove in soft-focus background, 3D animation render, 8K, depth of field, cinematic lighting, warm flickering golden light from match flame, cool dark blue shadows, 16:9 cinematic ratio, no text, no watermark.
`.trim()

    const characterSection = characterContext
      ? `\n\n[LISTE DES PERSONNAGES]\n${characterContext}\n[/LISTE DES PERSONNAGES]`
      : ''

    const visualStyleTag = this.styleLock?.visualStyle || '3D animation render, Pixar style, 8K, unreal engine 5 style'

    // TEMPLATE FINAL V18.1
    const styleDirective = `[LOI DU LANGAGE MACHINE - V18.1]
Tu dois générer un prompt technique UNIFIÉ, sans en-tête ni crochet.
STRUCTURE INTERNE OBLIGATOIRE (tags séparés par des virgules) :
1. DÉCOR (climat, heure, architecture).
2. VUE (cadrage, angle).
3. PERSONNAGE (Id, physique, action brusque).
4. RELATION (position relative).
5. QUALITÉ (${visualStyleTag}, 8K, cinematic).
6. LUMIÈRE (Source + couleur).
7. FORMAT (16:9).
8. NÉGATIFS.

INTERDICTION de mettre des labels comme "[DECOR] :". Génère juste la suite de tags.`

    const framingDirective = context.plannedSceneContext?.framing
      ? `\n[FRAMING] : ${context.plannedSceneContext.framing}`
      : ''
    const angleDirective = context.plannedSceneContext?.cameraAngle
      ? `\n[CAMERA_ANGLE] : ${context.plannedSceneContext.cameraAngle}`
      : ''
    const focusDirective = context.plannedSceneContext?.focusSubject
      ? `\n[FOCUS_SUBJECT] : ${context.plannedSceneContext.focusSubject}`
      : ''

    const result = await this.generateStructured<{ imagePrompt: string; visualAnchor: VisualAnchorState }>(
      `${anchorSection}\n\n<NARRATION>\n${narrationSegment}\n</NARRATION>${framingDirective}${angleDirective}${focusDirective}${characterSection}\n\n${styleDirective}${correctionHint ? `\n\n[CONSIGNE DE CORRECTION PRIORITAIRE] :\n${correctionHint}` : ''}
\nGénère le prompt technique final unifié (tags sans labels).
[IMPORTANT] : Traduis la description finale en ANGLAIS TECHNIQUE pour la machine.
\n[FORMAT RÉPONSE JSON]
{ 
  "imagePrompt": "...", 
  "visualAnchor": {
    "dominantLight": "...",
    "cameraAxis": "...",
    "characterPositions": { "@Nom": "@Lieu, position..." },
    "activeProps": ["prop1"]
  }
}
\nRéponds UNIQUEMENT with du JSON.`,
      system,
      {
        imagePrompt: '',
        visualAnchor: {
          dominantLight: 'neutral',
          cameraAxis: 'standard',
          characterPositions: {},
          activeProps: []
        }
      }
    )

    return result.data
  }

  private getGlobalScriptBlock(context: SeriesContext): string {
    if (!context.globalScript) return ''
    const truncated = context.globalScript.slice(0, 1500)
    return `
[SCRIPT GLOBAL DE LA SAGA — RÉFÉRENCE VISUELLE]
${truncated}${context.globalScript.length > 1500 ? '\n[...]' : ''}
`.trim()
  }

  private getEpisodePlanBlock(context: SeriesContext): string {
    const plan = context.plannedEpisodeContext
    if (!plan) return ''
    return `
[PLAN DE L'ÉPISODE PRÉVU]
- TITRE : ${plan.title || 'Inconnu'}
- HOOK : ${plan.hook || 'Inconnu'}
`.trim()
  }
}
