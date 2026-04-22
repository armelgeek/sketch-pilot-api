import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { LLMService } from '../core/llm.interface'
import type { VimaxAgent } from '../pipeline/vimax.agent'
import type {
  NarrativeThread,
  SagaIntent,
  SagaPlan,
  SeriesContext,
  StyleLock,
  VimaxRunOptions,
  VisualAnchorState
} from '../types'
import type { VimaxAssetExtractor } from './vimax-asset-extractor.agent'
import type { VimaxAtmosphereExtractor } from './vimax-atmosphere-extractor.agent'
import type { VimaxCharacterExtractor } from './vimax-character-extractor.agent'
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
Tu es un routeur d'intention pour la planification de scripts.
Classifie l'idée de l'utilisateur dans l'une des intentions suivantes :
- narrative : histoire structurée en 3 actes, arcs de personnages, dialogues naturels, profondeur thématique. (Format long/épisodique)
- motion : action pure, véhicules, frappes, vecteurs de vitesse, sans dialogue ni métaphore.
- montage : émotion par juxtaposition visuelle, états internes, rythme progressif.
- viral : contenu court pour réseaux sociaux, humour absurde, objets anthropomorphiques, hook immédiat, cliffhanger. (Format court/réseaux)
- dramatic : action intense, trahisons, plot twists, enjeux élevés, motivations cachées, confrontations psychologiques.

[RÈGLE DE DÉPARTAGE]
En cas d'ambiguïté entre deux catégories (ex: drama vs viral), privilégie celle qui correspond au FORMAT cible (viral = court/social, dramatic = long/épisodique).

[FORMAT]
Réponds UNIQUEMENT avec du JSON valide : { "intent": "narrative" | "motion" | "montage" | "viral" | "dramatic", "rationale": "chaîne de caractères" }
`.trim()
  }

  // ─── Specialized Prompts ───────────────────

  private getSpecializedSystem(intent: SagaIntent | string, bibleContext = ''): string {
    const identDirective =
      '- IDENTIFIANTS PERSONNAGES : Utilise IMPÉRATIVEMENT le format @PascalCase (ex: @Banane, @DetectiveSmith). AUCUN ESPACE, AUCUNE APOSTROPHE.'
    const formatInstruction =
      '[FORMAT]\nRenvoie UNIQUEMENT du JSON valide : { "title": "...", "planned_script": "...", "episodes": [ { "title": "...", "summary": "..." } ], "finalCliffhanger": "...", "unresolved_threads": [ { "id": "...", "title": "...", "description": "..." } ] }'

    const intentKey = typeof intent === 'string' ? intent : intent.tone || 'narrative'

    return `
[RÔLE : Expert en Planification de Série - Mode ${(intentKey || 'narrative').toUpperCase()}]
Tu es un expert chargé de transformer une idée brute en un script structuré et cinématique.

[INVENTAIRE EXHAUSTIF OBLIGATOIRE]
Le script DOIT nommer et identifier (via @Nom) TOUS les personnages, même les rôles secondaires, les figurants ou les unités collectives (ex: @Garde, @Foule, @Passant), dès qu'ils participent à une action. Ces identifiants sont la base du moteur de rendu visuel.

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
   * Étape 1 : Route l'intent et amplifie l'idée en script développé.
   * @param options Optionnel : options de génération (durée, context, etc.)
   */
  async draftSaga(
    basicIdea: string,
    options: VimaxRunOptions = {}
  ): Promise<{
    intent: SagaIntent
    script: string
    episodes: any[]
    title: string
    finalCliffhanger: string
    unresolvedThreads: NarrativeThread[]
  }> {
    const { targetEpisodeCount, maxScenes, targetDuration } = options

    // 1. Route intent
    console.info(`[VimaxSagaPlanner] 🚦 Routage de l'intention pour: "${basicIdea.slice(0, 50)}..."`)
    const routed = await this.generateStructured<{ intent: SagaIntent }>(
      `<BASIC_IDEA>\n${basicIdea}\n</BASIC_IDEA>\n\nRéponds uniquement en JSON.`,
      this.getRouterSystem(),
      { intent: { tone: 'narrative' } as any }
    )
    const intent = routed.data.intent
    console.info(`[VimaxSagaPlanner] 🎯 Intention identifiée: ${intent}`)

    const lengthHint = targetEpisodeCount
      ? `\nCible de longueur : EXACTEMENT ${targetEpisodeCount} épisodes pour permettre un développement narratif profond.`
      : maxScenes
        ? `\nCible de longueur : ${maxScenes} scènes maximum.`
        : targetDuration
          ? `\nCible de durée : ${targetDuration} secondes.`
          : ''

    const bibleContext = this.getBibleContext({ seriesBible: options.seriesContext?.seriesBible })

    console.info('[VimaxSagaPlanner] ✍️ Expansion du script global...')
    const expanded = await this.generateStructured<{
      title: string
      planned_script: string
      episodes: any[]
      finalCliffhanger: string
      unresolved_threads: Array<{ id: string; title: string; description: string }>
    }>(
      `<IDÉE_DE_BASE>\n${basicIdea}\n</IDÉE_DE_BASE>\n\nDéveloppe cette idée en un script complet.${lengthHint} Crée un TITRE CINÉMATIQUE et accrocheur pour la saga globale. [LOI DU CLIFFHANGER ORGANIQUE] : Le dernier épisode du batch actuel DOIT apporter une conclusion satisfaisante à l'arc principal TOUT EN révélant une conséquence imprévue, un secret lié aux événements passés ou un nouveau défi qui découle directement de l'histoire précédente (OUVERTURE). Identifie ce crochet dans le champ "finalCliffhanger" et liste les pistes narratives non résolues dans "unresolved_threads". Le crochet doit sembler être la "suite logique" et non un événement parachuté. Évite les raccourcis narratifs ; prends le temps d'installer les enjeux et les émotions.${targetEpisodeCount ? ` Structure l'histoire en ${targetEpisodeCount} actes bien distincts.` : ''}\n\nRéponds uniquement en JSON.`,
      this.getSpecializedSystem(intent, bibleContext),
      {
        title: 'Saga sans titre',
        planned_script: basicIdea,
        episodes: [],
        finalCliffhanger: '',
        unresolved_threads: []
      }
    )

    return {
      intent,
      title: expanded.data.title,
      script: expanded.data.planned_script,
      episodes: expanded.data.episodes,
      finalCliffhanger: expanded.data.finalCliffhanger,
      unresolvedThreads: expanded.data.unresolved_threads.map((t) => ({ ...t, status: 'active' as const }))
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
   * Wrapper pour backward compatibility - appelle draftSaga puis enrichSaga.
   */
  async planSaga(basicIdea: string, options: VimaxRunOptions = {}): Promise<SagaPlan> {
    const draft = await this.draftSaga(basicIdea, options)
    const enrichment = await this.enrichSaga(draft.script, options)

    console.info('[VimaxSagaPlanner] ✅ Planification de saga terminée.')

    return {
      ...draft,
      ...(enrichment as SagaPlan)
    }
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
      relationshipMap: narrativeData.relationshipMap
    }
  }

  /**
   * Génère un imagePrompt cinématique à partir d'un segment de narration.
   * Utilise un 'anchor' (état visuel de la scène précédente) pour garantir la continuité spatiale et lumineuse.
   */
  async generateImagePrompt(
    narrationSegment: string,
    characterContext = '',
    previousAnchor: VisualAnchorState | string | null = null,
    isClimax = false
  ): Promise<{ imagePrompt: string; visualAnchor: VisualAnchorState }> {
    const anchorData = typeof previousAnchor === 'string' ? previousAnchor : JSON.stringify(previousAnchor, null, 2)

    const anchorSection = previousAnchor
      ? `\n\n[RÉFÉRENCE VISUELLE PRÉCÉDENTE]\n${anchorData}\n\n[DIRECTIVE] Utilise cet état pour maintenir la cohérence de l'ÉCLAIRAGE, de l'AXE CAMÉRA et de la POSITION des personnages. Assure-toi que la nouvelle scène est spatialement cohérente avec la précédente.`
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

    const isWhiteboard = this.styleLock?.visualStyle.toLowerCase().includes('whiteboard')
    const systemRole = isWhiteboard
      ? "[RÔLE : Dessinateur d'Animation Whiteboard]"
      : '[RÔLE : Directeur de la Photographie & Directeur Visuel]'

    const compositionDirective = isWhiteboard
      ? '- COMPOSITION : Dessine @Nom au premier plan dans une action claire, avec les autres éléments au second plan. Utilise des lignes épurées.'
      : "- COMPOSITION : La description DOIT inclure dans une seule phrase fluide : le sujet @Nom au premier plan avec une action précise, les personnages actifs au plan moyen, et l'environnement géographique avec son éclairage en arrière-plan."

    const lightDirective = isWhiteboard
      ? "- STYLE : Pas d'ombrage complexe. Fond blanc pur. Traits noirs."
      : '- GRAMMAIRE DE LA LUMIÈRE : Interdiction de l\'expression "éclairage vif". Utilise : "lumière stroboscopique d\'alarme", "lumière rouge intermittente", "ombres dures projetées par le bas", "flash blanc aveuglant".'

    const system = `
${systemRole}
${styleBlock}
- IDENTIFIANTS : Utilise UNIQUEMENT l'identifiant @Nom (ex: @Banane, @Alexandre). Fais correspondre exactement leur profil visuel. [OBLIGATION] PROTECT THE IDENTITY : Ne simplifie jamais les traits physiques fournis ; ils sont la clé de la cohérence visuelle.
- COMPOSITION : La description DOIT inclure dans une seule phrase fluide : le sujet @Nom au premier plan avec une action précise, les personnages actifs au plan moyen, et l'environnement géographique avec son éclairage en arrière-plan.
- GRAMMAIRE DE LA LUMIÈRE : Interdiction de l'expression "éclairage vif". Utilise : "lumière stroboscopique d'alarme", "lumière rouge intermittente", "ombres dures projetées par le bas", "flash blanc aveuglant".
- CAMÉRA NARRATIVE : Décris l'angle et le mouvement lié à l'intention (ex: plan serré désaxé pour du chaos, contre-plongée pour du pouvoir).${climaxDirective}
- FLASHBACK : Si la narration indique un souvenir ou un reflet du passé, applique un style "FLASHBACK" (lumière surexposée, léger flou, couleurs désaturées).
- CAUSALITÉ : Décris les ACTIONS concrètes qui provoquent le danger (ex: une barre de fer tombe, une étincelle jaillit).
- Techniquement explicite : nomme les positions exactes, les vecteurs, les détails de l'environnement.
- PAS de métaphores. Description visuelle pure.
- LONGUEUR : 2-4 phrases maximum.
- [CONTINUITÉ LUMINEUSE] Assure la cohérence avec le reste de la série.
- [ISOLATION] IGNORE TOUT ce qui est entre crochets [Action / Émotion].
- INTERDICTION d'utiliser des crochets ou des tags rigides.

[FORMAT]
Renvoie UNIQUEMENT du JSON valide : 
{ 
  "imagePrompt": "...", 
  "visualAnchor": {
    "dominantLight": "...",
    "cameraAxis": "...",
    "characterPositions": { "@Nom": "position..." },
    "activeProps": ["prop1", "prop2"]
  }
}
`.trim()

    const characterSection = characterContext
      ? `\n\n[LISTE DES PERSONNAGES]\n${characterContext}\n[/LISTE DES PERSONNAGES]`
      : ''

    const styleDirective = this.styleLock?.visualStyle.toLowerCase().includes('whiteboard')
      ? "Génère un imagePrompt de style WHITEBOARD ANIMATION (dessin au tableau blanc, traits noirs simples sur fond blanc, style croquis rapide, pas d'ombres complexes)."
      : 'Génère un imagePrompt FLUIDE, NARRATIF ET CINÉMATOGRAPHIQUE respectant strictement le style verrouillé.'

    const result = await this.generateStructured<{ imagePrompt: string; visualAnchor: VisualAnchorState }>(
      `${anchorSection}\n\n<NARRATION>\n${narrationSegment}\n</NARRATION>${characterSection}\n\n${styleDirective}
Génère la description en une seule phrase narrative couvrant le sujet principal @Nom au premier plan, les éléments secondaires au plan moyen, et l'environnement lumineux avec sa profondeur en arrière-plan.
\nRéponds UNIQUEMENT with du JSON.`,
      system,
      {
        imagePrompt: narrationSegment,
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
}
