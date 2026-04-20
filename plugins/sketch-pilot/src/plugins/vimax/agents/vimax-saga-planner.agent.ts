import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { SagaIntent, SagaPlan, SeriesContext, VimaxRunOptions } from '../types'

// ─────────────────────────────────────────────
// VimaxSagaPlanner
// Étape 0 du pipeline.
// Route l'intent et amplifie une idée brute en script développé.
// Aussi utilisé en mode "motion" pour générer les imagePrompts par scène.
// ─────────────────────────────────────────────

export class VimaxSagaPlanner extends VimaxBaseAgent {
  // ─── Intent Router ─────────────────────────

  private getRouterSystem(): string {
    return `
Tu es un routeur d'intention pour la planification de scripts.
Classifie l'idée de l'utilisateur dans l'une des intentions suivantes :
- viral : contenu court pour réseaux sociaux, humour absurde, tension dramatique extrême, objets parlants (fruits), arcs émotionnels rapides.
- dramatic : action intense, trahisons, retournements de situation (plot twists), enjeux élevés, arcs narratifs complexes.
Réponds UNIQUEMENT avec du JSON valide : { "intent": "narrative" | "motion" | "montage" | "viral" | "dramatic", "rationale": "chaîne de caractères" }
`.trim()
  }

  // ─── Specialized Prompts ───────────────────

  private getSpecializedSystem(intent: SagaIntent, bibleContext = ''): string {
    switch (intent) {
      case 'motion':
        return `
[RÔLE : Expert en Immersion Mouvement & Vitesse]
Transforme l'idée en un script cinétique, techniquement précis.
- PAS de métaphores. Dialogue minimal.
- Concentre-toi sur les VECTEURS, la VITESSE et l'orientation SPATIALE.
- Techniquement explicite (nomme les types de véhicules, les postures, les frappes).
- Séquence des beats d'action qui peuvent être scénarisés étape par étape.
- Utilise un langage cinématographique mettant l'accent sur la force et le flou de mouvement.
- Renvoie UNIQUEMENT du JSON valide : { "planned_script": "chaîne de caractères" }
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
- Renvoie UNIQUEMENT du JSON valide : { "planned_script": "chaîne de caractères" }
`.trim()

      case 'montage':
        return `
[RÔLE : Expert en Montage & Émotion]
Transforme l'idée en un script de montage axé sur l'émotion.
- PAS de métaphores. Format paragraphe pur.
- Transmets le sens par la progression des plans, le rythme et la juxtaposition visuelle.
- Concentre-toi sur les états internes, les visuels expressifs et les réactions.
- Le rythme doit refléter l'arc émotionnel (montée du tempo, présence du souffle).
- Renvoie UNIQUEMENT du JSON valide : { "planned_script": "chaîne de caractères" }
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
- Renvoie UNIQUEMENT du JSON valide : { "planned_script": "chaîne de caractères" }
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
- Renvoie UNIQUEMENT du JSON valide : { "planned_script": "chaîne de caractères" }

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
    const routerRaw = await this.generate(
      `<BASIC_IDEA>\n${basicIdea}\n</BASIC_IDEA>`,
      this.getRouterSystem(),
      'application/json'
    )

    let intent: SagaIntent = 'narrative'
    const routed = this.parseJSONSafe<{ intent: SagaIntent }>(routerRaw, { intent: 'narrative' })
    intent = routed.intent

    const lengthHint = maxScenes
      ? `\nCible de longueur : ${maxScenes} scènes maximum.`
      : targetDuration
        ? `\nCible de durée : ${targetDuration} secondes.`
        : ''

    const bibleContext = this.getBibleContext({ seriesBible: options.seriesContext?.seriesBible })

    const expandRaw = await this.generate(
      `<IDÉE_DE_BASE>\n${basicIdea}\n</IDÉE_DE_BASE>\n\nDéveloppe cette idée en un script complet.${lengthHint} Calibre la longueur pour respecter ces contraintes.`,
      this.getSpecializedSystem(intent, bibleContext),
      'application/json'
    )

    const expanded = this.parseJSONSafe<{ planned_script: string }>(expandRaw, { planned_script: basicIdea })

    return { intent, script: expanded.planned_script }
  }

  /**
   * Génère un imagePrompt cinématique à partir d'un segment de narration.
   * Utilise un 'anchor' (le prompt de la scène précédente) pour garantir la continuité spatiale et lumineuse.
   */
  async generateImagePrompt(
    narrationSegment: string,
    characterContext = '',
    previousSceneAnchor = ''
  ): Promise<string> {
    const anchorSection = previousSceneAnchor
      ? `\n\n[RÉFÉRENCE VISUELLE PRÉCÉDENTE]\n${previousSceneAnchor}\n\n[DIRECTIVE] Utilise cette référence pour maintenir la cohérence de l'ÉCLAIRAGE et de la POSITION des personnages. Assure-toi que la nouvelle scène montre un VÉRITABLE AVANCEMENT.`
      : ''

    const system = `
[RÔLE : Directeur de la Photographie & Directeur Visuel]
- IDENTIFIANTS : Utilise UNIQUEMENT l'identifiant @Nom (ex: @Banane, @Alexandre).
- [STRUCTURE DU PROMPT] : Ton imagePrompt doit impérativement suivre cette structure :
  [Sujet Principal] + [Action/Posture] + [Angle Caméra/Distance] + [Éclairage/Ambiance] + [Background/Décor].
- COMPOSITION HIÉRARCHIQUE : Chaque prompt DOIT définir :
   1. [FOREGROUND] : Sujet principal @Nom + action précise + position (ex: @Poire au centre, penché).
   2. [MIDGROUND] : Objets ou groupes (ex: silhouettes floues de l'équipe derrière lui).
   3. [BACKGROUND] : Détails géographiques (ex: minuterie de sécurité clignotante en haut à droite).
- GRAMMAIRE DE LA LUMIÈRE : Interdiction de l'expression "éclairage vif". Utilise : "lumière stroboscopique d'alarme", "lumière rouge intermittente", "ombres dures projetées par le bas", "flash blanc aveuglant".
- CAMÉRA NARRATIVE : Décris l'angle et le mouvement lié à l'intention (ex: plan serré désaxé pour du chaos, contre-plongée pour du pouvoir).
- CLIMAX (SCÈNE 5) : Ajoute systématiquement un impact visuel (projection, onde de choc, étincelles, fumée épaisse).
- FLASHBACK : Si la narration indique un souvenir ou un reflet du passé, applique un style "FLASHBACK" (lumière surexposée, léger flou, couleurs désaturées).
- CAUSALITÉ : Décris les ACTIONS concrètes qui provoquent le danger (ex: une barre de fer tombe, une étincelle jaillit).
- Techniquement explicite : nomme les positions exactes, les vecteurs, les détails de l'environnement.
- Utilise @Nom pour les personnages (ex: @Alexandre). Fais correspondre exactement leur profil visuel.
- PAS de métaphores. Description visuelle pure.
- 2-4 phrases maximum.
- [ISOLATION] IGNORE TOUT ce qui est entre crochets [Action / Émotion]. Ces informations sont gérées à part. Ne décris PAS les expressions faciales ou les gestes mentionnés entre crochets.
- [MOUVEMENT & CAUSALITÉ] Décris les ACTIONS qui provoquent le danger ou l'émotion.
- [CONTINUITÉ LUMINEUSE] Assure-toi que l'éclairage et la profondeur de champ sont cohérents avec le contexte global de la série.
- TU DOIS ABSOLUMENT intégrer les trois plans (Premier plan, Second plan, et Arrière-plan) dans une seule phrase fluide et cinématographique. 
- INTERDICTION d'utiliser des crochets, des deux-points ou des tags rigides (ex: pas de "[FOREGROUND]:").
- Renvoie UNIQUEMENT du JSON valide : { "imagePrompt": "Description fluide ici..." }
`.trim()

    const characterSection = characterContext
      ? `\n\n[LISTE DES PERSONNAGES]\n${characterContext}\n[/LISTE DES PERSONNAGES]`
      : ''

    const raw = await this.generate(
      `${anchorSection}\n\n<NARRATION>\n${narrationSegment}\n</NARRATION>${characterSection}\n\nGénère un imagePrompt FLUIDE, RÉALISTE ET CINÉMATOGRAPHIQUE.
Décris la scène en un paragraphe immersif incluant :
1. Le sujet @Nom et son action (Premier plan).
2. Les autres personnages ou objets actifs (Plan moyen).
3. L'environnement, l'éclairage et la profondeur (Arrière-plan).

INTERDICTION de tags ou de listes. Uniquement une phrase narrative.

Renvoie UNIQUEMENT du JSON : { "imagePrompt": "..." }`,
      system,
      'application/json'
    )

    const parsed = this.parseJSONSafe<{ imagePrompt: string }>(raw, { imagePrompt: narrationSegment })
    return parsed.imagePrompt
  }
}
