import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { LLMService } from '../core/llm.interface'
import type { SagaIntent, SagaPlan, SeriesContext, StyleLock, VimaxRunOptions, VisualAnchorState } from '../types'

// ─────────────────────────────────────────────
// VimaxSagaPlanner
// Étape 0 du pipeline.
// Route l'intent et amplifie une idée brute en script développé.
// Aussi utilisé en mode "motion" pour générer les imagePrompts par scène.
// ─────────────────────────────────────────────

export class VimaxSagaPlanner extends VimaxBaseAgent {
  private styleLock: StyleLock | null = null

  constructor(llm: LLMService) {
    super(llm)
  }

  setStyleLock(lock: StyleLock) {
    this.styleLock = lock
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

  private getSpecializedSystem(intent: SagaIntent, bibleContext = ''): string {
    const identDirective =
      '- IDENTIFIANTS PERSONNAGES : Utilise IMPÉRATIVEMENT le format @PascalCase (ex: @Banane, @DetectiveSmith). AUCUN ESPACE, AUCUNE APOSTROPHE.'
    const formatInstruction =
      '[FORMAT]\nRenvoie UNIQUEMENT du JSON valide : { "planned_script": "chaîne de caractères" }'

    switch (intent) {
      case 'motion':
        return `
[RÔLE : Expert en Immersion Mouvement & Vitesse]
Transforme l'idée en un script cinétique, techniquement précis.
- PAS de métaphores. Dialogue minimal.
- STRUCTURE : 4 à 6 beats d'action distincts, chacun décrivant une phase de mouvement (approche, impact, esquive, résolution).
- LONGUEUR : 150-250 mots maximum.
- Concentre-toi sur les VECTEURS, la VITESSE et l'orientation SPATIALE.
- Techniquement explicite (nomme les types de véhicules, les postures, les frappes).
- Séquence des beats d'action qui peuvent être scénarisés étape par étape.
- Utilise un langage cinématographique mettant l'accent sur la force et le flou de mouvement.
${identDirective}

${formatInstruction}

${bibleContext}
`.trim()

      case 'viral':
        return `
[RÔLE : Architecte de Contenu Viral & Social Media]
Transforme l'idée en un script percutant, optimisé pour l'engagement.
- HOOK IMMÉDIAT : La première scène doit capturer l'attention en 1 seconde (absurdité, émotion forte, question provocante).
- ARCHÉTYPES : Supporte les objets/animaux anthropomorphiques (fruits qui parlent, chats qui pleurent).
- STRUCTURE : Rythme rapide, contrastes émotionnels brutaux (de la joie aux larmes en une scène).
- CLIFFHANGER : Fin ouverte ou choc pour générer du partage/commentaires.
- Évite les explications longues. Priorise le "Show, don't tell" et le dialogue émotionnel direct.
- ACTIONS & ÉMOTIONS : Utilise des balises de direction d'acteur [Action/Emotion] dans le script pour guider l'animation et le jeu.
${identDirective}

${formatInstruction}

${bibleContext}
`.trim()

      case 'montage':
        return `
[RÔLE : Expert en Montage & Émotion]
Transforme l'idée en un script de montage axé sur l'émotion.
- PAS de métaphores. Format paragraphe pur.
- Transmets le sens par la progression des plans, le rythme et la juxtaposition visuelle.
- Concentre-toi sur les états internes, les visuels expressifs et les réactions.
- Le rythme doit refléter l'arc émotionnel (montée du tempo, présence du souffle).
${identDirective}

${formatInstruction}

${bibleContext}
`.trim()

      case 'dramatic':
        return `
[RÔLE : Expert en Suspense, Action & Drame Psychologique]
Transforme l'idée en un script intense et imprévisible.
- TRAHISON & MYSTÈRE : Introduis des motivations cachées ou des alliés qui changent de camp au moment critique.
- PLOT TWISTS : La scène finale de chaque épisode (sauf le dernier) doit se terminer sur une révélation choc ou un retournement.
- ACTION : Décris des confrontations physiques ou psychologiques tendues.
- STRUCTURE : Favorise les arcs "High Stakes" où chaque décision a des conséquences graves.
- ACTIONS & ÉMOTIONS : Utilise des balises [Action/Emotion] pour guider l'acting.
${identDirective}

${formatInstruction}

${bibleContext}
`.trim()

      case 'narrative':
      default:
        return `
[RÔLE : Scénariste de Classe Mondiale]
Transforme l'idée en un script narratif riche.
- Structure en trois actes : exposition, confrontation, résolution.
- Arcs de personnages convaincants et dialogues naturels.
- Langage cinématographique privilégiant les éléments visuels sur l'exposition.
- Maintiens la cohérence du genre et la profondeur thématique.
- Pas de métaphores dans les descriptions visuelles.
${identDirective}

${formatInstruction}

${bibleContext}
`.trim()
    }
  }

  private getBibleContext(context: SeriesContext): string {
    if (!context.seriesBible) return ''
    const b = context.seriesBible
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
   * Route l'intent et amplifie l'idée en script développé.
   * @param options Optionnel : options de génération (durée, context, etc.)
   */
  async planSaga(basicIdea: string, options: VimaxRunOptions = {}): Promise<SagaPlan> {
    const { targetDuration, maxScenes } = options

    // 1. Route intent
    const routed = await this.generateStructured<{ intent: SagaIntent }>(
      `<BASIC_IDEA>\n${basicIdea}\n</BASIC_IDEA>\n\nRéponds uniquement en JSON.`,
      this.getRouterSystem(),
      { intent: 'narrative' }
    )
    const intent = routed.data.intent

    const lengthHint = maxScenes
      ? `\nCible de longueur : ${maxScenes} scènes maximum.`
      : targetDuration
        ? `\nCible de durée : ${targetDuration} secondes.`
        : ''

    const bibleContext = this.getBibleContext({ seriesBible: options.seriesContext?.seriesBible })

    const expanded = await this.generateStructured<{ planned_script: string }>(
      `<IDÉE_DE_BASE>\n${basicIdea}\n</IDÉE_DE_BASE>\n\nDéveloppe cette idée en un script complet.${lengthHint} Calibre la longueur pour respecter ces contraintes.\n\nRéponds uniquement en JSON.`,
      this.getSpecializedSystem(intent, bibleContext),
      { planned_script: basicIdea }
    )

    return { intent, script: expanded.data.planned_script }
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

    const system = `
[RÔLE : Directeur de la Photographie & Directeur Visuel]
${styleBlock}
- IDENTIFIANTS : Utilise UNIQUEMENT l'identifiant @Nom (ex: @Banane, @Alexandre). Fais correspondre exactement leur profil visuel.
- COMPOSITION : La description DOIT inclure dans une seule phrase fluide : le sujet @Nom au premier plan avec une action précise, les personnages actifs au plan moyen, et l'environnement géographique avec son éclairage en arrière-plan.
- GRAMMAIRE DE LA LUMIÈRE : Interdiction de l'expression "éclairage vif". Utilise : "lumière stroboscopique d'alarme", "lumière rouge intermittente", "ombres dures projetées par le bas", "flash blanc aveuglant".
- CAMÉRA NARRATIVE : Décris l'angle et le mouvement lié à l'intention (ex: plan serré désaxé pour du chaos, contre-plongée pour du pouvoir).${climaxDirective}
- FLASHBACK : Si la narration indique un souvenir ou un reflet du passé, applique un style "FLASHBACK" (lumière surexposée, léger flou, couleurs désaturées).
- CAUSALITÉ : Décris les ACTIONS concrètes qui provoquent le danger (ex: une barre de fer tombe, une étincelle jaillit).
- Techniquement explicite : nomme les positions exactes, les vecteurs, les détails de l'environnement.
- PAS de métaphores. Description visuelle pure.
- LONGUEUR : 2-4 phrases maximum.
- [ISOLATION] IGNORE TOUT ce qui est entre crochets [Action / Émotion]. Ces informations sont gérées à part. Ne décris PAS les expressions faciales ou les gestes mentionnés entre crochets.
- [CONTINUITÉ LUMINEUSE] Assure-toi que l'éclairage et la profondeur de champ sont cohérents avec le contexte global de la série.
- TU DOIS ABSOLUMENT intégrer les trois plans (Premier plan, Second plan, et Arrière-plan) dans une seule phrase fluide, narrative et cinématographique. 
- INTERDICTION d'utiliser des crochets, des deux-points ou des tags rigides (ex: pas de "[FOREGROUND]:").

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

    const result = await this.generateStructured<{ imagePrompt: string; visualAnchor: VisualAnchorState }>(
      `${anchorSection}\n\n<NARRATION>\n${narrationSegment}\n</NARRATION>${characterSection}\n\nGénère un imagePrompt FLUIDE, RÉALISTE ET CINÉMATOGRAPHIQUE.
Génère la description en une seule phrase narrative couvrant le sujet principal @Nom au premier plan, les éléments secondaires au plan moyen, et l'environnement lumineux avec sa profondeur en arrière-plan.
\nRéponds UNIQUEMENT avec du JSON.`,
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
