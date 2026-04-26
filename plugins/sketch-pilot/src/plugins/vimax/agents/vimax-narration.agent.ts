import { LessonStore } from '../core/lesson-store'
import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { SceneMemory, SeriesContext, VimaxEvent } from '../types'

// ─────────────────────────────────────────────
// VimaxNarrationAgent (Pass 1)
// Génère la narration brute d'un segment.
// Utilisé à deux niveaux :
//   1. Niveau épisode — narration complète depuis un event de série
//   2. Niveau scène   — narration courte depuis un event de scène
// ─────────────────────────────────────────────

export class VimaxNarrationAgent extends VimaxBaseAgent {
  public id = 'narration'

  constructor(llm: any) {
    super(llm)
    this.setPersonality({
      temperature: 0.8,
      rolePersona:
        "Tu es un narrateur cinématographique de génie. Ton écriture est viscérale, sensorielle et atmosphérique. Tu pratiques le 'Show, Don't Tell' à l'extrême. Tu es le maître de l'ambiance."
    })
  }

  private getAudienceBlock(context: SeriesContext): string {
    const intent = context.intent
    if (!intent || typeof intent === 'string' || !intent.audience) return ''
    const aud = intent.audience
    return `
[AUDIENCE CIBLE]
- Public : ${aud.ageRange}
- Plateforme : ${aud.platform}
- Attention : ${aud.attentionSpan}s
- Rythme : ${aud.expectedPace}
`.trim()
  }

  private getNarrativeBlock(context: SeriesContext): string {
    const intent = context.intent
    if (!intent || typeof intent === 'string' || !intent.narrativeIntent) {
      return `
- VOIX : Narrateur cinématographique omniscient.
- RYTHME : Standard cinematic, phrases courtes.
- TEMPS : Présent de narration.
- DENSITÉ : Équilibrée.
`.trim()
    }
    const ni = intent.narrativeIntent
    const voice = ni.voice
    const rhythm = ni.rhythm
    const grammar = ni.grammar

    return `
- VOIX (${voice.type.toUpperCase()}) : Tu es un narrateur ${voice.type} avec une distance ${voice.distance}. Focalisation : ${voice.focalCharacter || 'Omnisciente'}. Ton : ${voice.tone}.
- RYTHME : Style ${rhythm.style.toUpperCase()}. ${rhythm.sentenceVariety ? 'Alterne phrases longues et courtes (respiration).' : 'Garde un rythme régulier.'} ${rhythm.useNominalPhrases ? 'Utilise la phrase nominale pour un impact brutal.' : ''}
- TEMPS : Écris principalement au ${grammar.dominantTense.replace('_', ' ')}. ${grammar.tenseSwitching ? 'Tu peux changer de temps pour les flashbacks ou souvenirs.' : 'Garde ce temps strictement.'}
- DENSITÉ : Narration ${ni.density}. ${ni.density === 'sparse' ? "Laisse de l'espace, peu de détails par phrase." : ni.density === 'dense' ? "Beaucoup d'informations et de textures par phrase." : 'Équilibre information et atmosphère.'}
- TAGS TTS ELEVENLABS : ${rhythm.elevenLabsTags ? 'OBLIGATOIRE : Insère des tags <break time="0.5s" /> ou <break time="1.0s" /> pour marquer les silences dramatiques et les ruptures de rythme.' : "N'utilise aucun tag SSML."}
`.trim()
  }

  private getSystem(
    mode: 'series' | 'episode',
    wordCount?: string,
    context: SeriesContext = {},
    previousScenes: SceneMemory[] = [],
    sceneNumber?: number,
    totalScenes?: number,
    intentReminder = '',
    event?: VimaxEvent
  ): string {
    const audienceBlock = this.getAudienceBlock(context)
    const platform =
      context.intent && typeof context.intent !== 'string' ? context.intent.audience?.platform : 'unknown'
    const narrativeBlock = this.getNarrativeBlock(context)

    const common = `
[RÔLE : Expert Narrative Designer]
${audienceBlock}

[DIRECTIONS NARRATIVES (ADN)]
${narrativeBlock}

[DIRECTIONS DE STYLE PAR PLATEFORME]
${platform === 'tiktok' ? '- TIKTOK : Vocabulaire punchy, pas de fioritures, accroche immédiate, phrases courtes.' : ''}
${platform === 'cinema' ? '- CINEMA : Richesse lexicale, silences suggestifs, atmosphères contemplatives, profondeur.' : ''}
`.trim()

    const defaultWordCount = mode === 'series' ? '300-500 mots' : '40-70 mots'
    const finalWordCount = wordCount || defaultWordCount
    const lengthGuide = `
[CONTRÔLE DE DURÉE STRICT] 
- Cible : ${finalWordCount}.
- CONSIGNE : Sois extrêmement concis. Chaque mot superflu réduit la qualité visuelle. 
- PENALTY : Si tu dépasses la limite, la narration sera tronquée.`.trim()

    const granularity =
      mode === 'series' ? 'arc narratif majeur (un épisode complet).' : 'beat de niveau scène (une scène unique).'

    const memoryBlock = mode === 'episode' ? this.getSceneMemoryBlock(previousScenes) : ''

    // Récupération de l'ADN Stylistique (Vocabulaire & Clichés)
    const store = LessonStore.getInstance()
    const dna = store.getStylisticDNA(this.id, this.brainMode)

    const wordBank =
      dna.vocabulary.length > 0
        ? `\n[BANQUE DE MOTS SENSORIELS (À UTILISER EN PRIORITÉ)] :\n- ${dna.vocabulary.join(', ')}`
        : ''

    const negativePrompt =
      dna.forbidden.length > 0 ? `\n[INTERDICTION FORMELLE / CLICHÉS À BANNIR] :\n- ${dna.forbidden.join(', ')}` : ''

    const tensionProgression =
      mode === 'episode' && totalScenes && sceneNumber
        ? `
[COURBE DE TENSION OBLIGATOIRE]
- Scène ${sceneNumber}/${totalScenes}
- Tension attendue : ${Math.round((sceneNumber / totalScenes) * 10)}/10
- La tension DOIT augmenter progressivement vers la scène finale.
`.trim()
        : ''

    const structuralContext = event ? this.getStructuralContext(event) : ''

    return `
Tu es un scénariste de sagas cinématographiques à haute tension.
Génère une NARRATION BRUTE et percutante pour l'événement fourni.

- RÈGLE D'OR : Écris pour l'ÉCRAN, pas pour un livre. Bannis la littérature, cherche la VÉRITÉ PHYSIQUE.
- PRINCIPE "SHOW, DON'T TELL" ABSOLU : Interdiction formelle d'utiliser des adjectifs d'état ou des verbes de perception vague (ex: "sembler", "paraître", "donner l'impression"). Décris l'ACTION ou le DÉTAIL qui le prouve.
- INTERDICTION DES MÉTAPHORES ABSTRAITES : Bannis "pression latente", "intrigue insondable", "silence pesant", "murmure hypnotique". Préfère : "une goutte de sueur", "un grincement d'acier", "le souffle court".
- Narration VISCÉRALE, BRUTE, IMMÉDIATE. Rythme cardiaque.
- Utilise des verbes de MANIFESTATION (tremble, s'assombrit, scintille) au lieu de verbes de Description.
- CHERCHE LA SUBSTANCE : Ne te limite pas aux actions. Capture l'atmosphère par les SENS (le froid qui pique, l'odeur du fer).

${wordBank}
${negativePrompt}

${intentReminder}

${lengthGuide}

[DIRECTIVES DE VOIX & RYTHME]
- RESPECTE L'ADN NARRATIF fourni dans le bloc [DIRECTIONS NARRATIVES].
- CONFLIT INTÉRIEUR : Ne décris pas seulement les actions. Descends dans le doute, la peur ou l'hésitation. Le personnage veut-il vraiment ce qu'il fait ?
- CORPS NARRATIF : Utilise la posture, la respiration et le regard comme outils de narration.
- ÉMOTIONS COMPOSITES : Interdiction des émotions primaires. Cherche le mélange (ex: "un soulagement amer", "une fureur glacée").
- POIDS MORAL : Chaque action doit peser. Fais ressentir la conséquence éthique du choix de @Nom.
- HORS-CHAMP : Suggère l'effet sans montrer la cause pour créer du mystère.
- ENTRÉE TARDIVE / SORTIE PRÉCOCE : Commence l'action déjà en cours, coupe avant la résolution complète.

${this.getProductionContext(context)}

${this.getBibleContext(context)}

${this.getGlobalScriptBlock(context)}

${this.getBlueprintBlock(context)}

${this.getEpisodePlanBlock(context)}

${memoryBlock}

${tensionProgression}

${structuralContext}

[INTERDICTION D'HALLUCINATION] : Tu ne dois JAMAIS inventer de nouveaux noms propres de personnages. Utilise UNIQUEMENT les identifiants @Nom fournis dans le contexte ou le script global. Si un nouveau personnage est nécessaire pour l'action, utilise un rôle générique sans l'@ (ex: "un soldat", "le chauffeur") ou demande explicitement un identifiant au directeur visuel.

[FORMAT]
Renvoie UNIQUEMENT du JSON valide : { "narration": "la narration ici" }
`.trim()
  }

  private getSceneMemoryBlock(previousScenes: SceneMemory[]): string {
    if (!previousScenes.length) return ''

    const last = previousScenes.at(-1)!

    // 1. Rôles utilisés
    const usedRoles = previousScenes.map((s) => s.role).join(', ')

    // 2. État physique des lieux
    const locStates =
      last.locationStates
        ?.map((l) => `- ${l.locationId} : ${l.currentState} (${l.modifications.join(', ')})`)
        .join('\n') || 'Aucune modification.'

    // 3. État des personnages
    const charStates =
      last.characterStates
        ?.map(
          (c) =>
            `- ${c.identifier} : Position ${c.lastKnownPosition} | État ${c.physicalState} | Émotion ${c.emotionalState}`
        )
        .join('\n') || 'États standard.'

    // 4. Contrat Narratif
    const openPromises =
      last.plotContract?.openPromises
        .map((p) => `- ${p.description} (Introduit à ${p.introducedAtScene}, doit résoudre par ${p.mustResolveBy})`)
        .join('\n') || 'Aucune promesse en cours.'

    return `
[MÉMOIRE DES SCÈNES PRÉCÉDENTES]
- Rôles déjà utilisés : ${usedRoles}
- Tension précédente : ${last.tensionLevel}/10
- Dernière action : ${last.lastAction}

[ÉTAT PHYSIQUE DE L'UNIVERS]
${locStates}

[ÉTAT DES PERSONNAGES]
${charStates}

[CONTRAT NARRATIF (PLOT CONTRACT)]
${openPromises}

[CONSIGNES DE CONTINUITÉ]
- INTERDICTION de changer le lieu : "${last.location}" sans transition explicite.
- INTERDICTION de guérir un personnage sans soins décrits.
- INTERDICTION de réparer un objet détruit.
`.trim()
  }

  private getStructuralContext(event: VimaxEvent): string {
    if (!event.dramaticFunction) return ''

    const impacts =
      event.characterImpacts
        ?.map(
          (i) =>
            `- ${i.identifier} : De "${i.arcBefore}" vers "${i.arcAfter}" | Mutation émotionnelle : ${i.emotionalShift}`
        )
        .join('\n') || 'Non spécifié.'

    const debts = event.narrativeDebts
      ? `- CRÉATION DE DETTES : ${event.narrativeDebts.creates.join(', ')}\n- RÉSOLUTION DE DETTES : ${event.narrativeDebts.resolves.join(', ')}`
      : 'Aucune.'

    return `
[ARCHITECTURE V7.0 - DIRECTIVES STRUCTURELLES]
- FONCTION DRAMATIQUE : ${event.dramaticFunction.toUpperCase()}
- POSITION : Acte ${event.actPosition?.act || '?'}, ${event.actPosition?.percentageInAct || '?'}% de l'acte.
- CIBLES : Tension ${event.tensionTarget || '?'}/10, Rythme ${event.paceTarget || 'standard'}.

[TRAJECTOIRES DES PERSONNAGES (ARCS)]
${impacts}

[CONTRAT NARRATIF (DETTES)]
${debts}

[INSTRUCTION D'ARCHITECTE] : Ton écriture DOIT servir la fonction "${event.dramaticFunction}". 
- Si c'est un 'catalyst', l'événement doit être irréversible.
- Si c'est un 'midpoint', introduis un pivot majeur ou une révélation qui change les enjeux.
- Si c'est un 'climax', l'intensité émotionnelle et sensorielle doit être à son paroxysme.
`.trim()
  }

  private getProductionContext(context: SeriesContext): string {
    const intent = context.intent
    if (!intent || typeof intent === 'string') return ''

    const constraints =
      intent.creativeConstraints
        ?.map((c) => `- CONTRAINTE (${c.type}) : ${c.value}${c.mandatory ? ' [OBLIGATOIRE]' : ''}`)
        .join('\n') || 'Aucune.'

    return `
[CONTEXTE DE PRODUCTION & HUMANITÉ (V5.5)]
${constraints}
- MODE QUOTIDIEN : ${context.lastEpisodeFinalScene?.isDailyLife ? "ACTIF. Priorise la banalité, le trivial, l'humain ordinaire. Évite le spectaculaire." : 'Inactif.'}
- NARRATION CHORALE : ${context.lastEpisodeFinalScene?.isChoral ? "ACTIF. Alterne les perspectives sans donner l'avantage à un point de vue unique." : 'Inactif.'}
- EFFET D'ABSENCE : ${context.lastEpisodeFinalScene?.absentProtagonists?.length ? `Les personnages suivants sont ABSENTS : ${context.lastEpisodeFinalScene.absentProtagonists.join(', ')}. Leur absence doit créer un vide, un sujet de conversation ou un manque physique.` : 'Aucun.'}
`.trim()
  }

  private getBibleContext(context: SeriesContext): string {
    const b = context.seriesBible
    if (!b || typeof b === 'string') return ''
    return `
[BIBLE DE LA SÉRIE - SPEC]
- VISUAL STYLE : ${b.visualStyle}
- AUTHORIAL WORLDVIEW : ${context.intent && typeof context.intent !== 'string' ? context.intent.authorialSignature?.worldview : 'Neutral'}
- SYMBOLIC THEMES : ${context.intent && typeof context.intent !== 'string' ? context.intent.authorialSignature?.themes?.join(', ') : 'None'}
- LOIS DE L'UNIVERS : ${b.universeLaws?.join(', ') || 'Standard'}
`.trim()
  }

  /**
   * Injecte le script global de la saga (series.globalContext).
   * Ce document est la source de vérité narrative — personnages, arcs, univers.
   * Tronqué à 3000 chars pour préserver la fenêtre de contexte LLM.
   */
  private getGlobalScriptBlock(context: SeriesContext): string {
    if (!context.globalScript) return ''
    const MAX_CHARS = 3000
    const truncated = context.globalScript.slice(0, MAX_CHARS)
    const isTruncated = context.globalScript.length > MAX_CHARS
    return `
[SCRIPT GLOBAL DE LA SAGA — SOURCE DE VÉRITÉ NARRATIVE]
Cette saga a été planifiée avec le script complet suivant. Ton épisode DOIT s'inscrire dans ce cadre sans le trahir.
${truncated}${isTruncated ? '\n[... suite du script tronquée pour le contexte]' : ''}
`.trim()
  }

  /**
   * Injecte le blueprint narratif V7.0 (Thème, Prémisse, Arcs).
   * Donne une vision structurelle de long terme.
   */
  private getBlueprintBlock(context: SeriesContext): string {
    const b = context.blueprint
    if (!b || !b.premise) return ''
    return `
[BLUEPRINT NARRATIF (STRUCTURE PROFONDE)]
- THÈME PRINCIPAL : ${b.theme}
- PRÉMISSE : ${b.premise}
- CONTRAT AUDIENCE : ${b.audienceContract}
`.trim()
  }

  /**
   * Injecte le plan précis de l'épisode courant (titre, hook, fonction dramatique).
   * C'est le "cahier des charges" de l'épisode : la narration doit le couvrir.
   */
  private getEpisodePlanBlock(context: SeriesContext): string {
    const plan = context.plannedEpisodeContext
    if (!plan) return ''
    return `
[PLAN DE L'ÉPISODE COURANT — DIRECTIVES DU SCÉNARISTE]
- TITRE PRÉVU : ${plan.title || 'Non défini'}
- PITCH / INTRIGUE (HOOK) : ${plan.hook || 'Non défini'}
- FONCTION DRAMATIQUE : ${plan.dramaticFunction || 'Non définie'}
- POSITION DANS L'ARC : ${plan.actPosition || 'Non définie'}
${plan.keyRevelation ? `- RÉVÉLATION CLÉ : ${plan.keyRevelation}` : ''}
${plan.tensionTarget ? `- CIBLE TENSION : ${plan.tensionTarget}/10` : ''}
${plan.paceTarget ? `- RYTHME CIBLE : ${plan.paceTarget}` : ''}
${plan.impactedCharacters?.length ? `- PERSONNAGES CLÉS IMPLIQUÉS : ${plan.impactedCharacters.join(', ')}` : ''}

⚠️ CONSIGNE ABSOLUE : Ta narration DOIT couvrir le HOOK ci-dessus. C'est le cahier des charges de cet épisode — ne l'ignore PAS.
`.trim()
  }

  // ─── Public API ────────────────────────────

  async generateEpisodeNarration(
    event: VimaxEvent,
    context: SeriesContext = {},
    targetDuration?: number,
    maxScenes?: number,
    correctionHint?: string
  ): Promise<string> {
    const correctionBlock = correctionHint ? `\n\n[INSTRUCTION DE CORRECTION]\n${correctionHint}` : ''

    const raw = await this.generate(
      `<ÉVÉNEMENT_D_ÉPISODE>\n${event.description}\n</ÉVÉNEMENT_D_ÉPISODE>${correctionBlock}`,
      this.getSystem('series', undefined, context, [], undefined, undefined, '', event),
      'application/json'
    )

    const parsed = this.parseJSONSafe<{ narration: string }>(raw, { narration: event.description })
    const rawNarration = parsed.narration

    // Polissage optionnel si ADN présent
    const store = LessonStore.getInstance()
    const dna = store.getStylisticDNA(this.id, this.brainMode)
    if (dna.vocabulary.length === 0 && dna.forbidden.length === 0) {
      return rawNarration
    }

    const polishSystem = `
Tu es l'Éditeur Stylistique de Vimax. Ton but est de raffiner la narration brute de l'ÉPISODE pour la rendre plus CINÉMATIQUE et PERCUTANTE.

[ADN STYLISTIQUE - WORD BANK]
${dna.vocabulary.join(', ')}

[ADN STYLISTIQUE - CLICHÉS BANNIS]
${dna.forbidden.join(', ')}

[CONSIGNES] :
1. Injecte le vocabulaire sensoriel de la Word Bank.
2. Purge les clichés bannie.
3. Garde la narration fluide et respecte le ton global de la saga.

[FORMAT] : Renvoie UNIQUEMENT du JSON valide : { "narration": "..." }
`.trim()

    const polishedRaw = await this.generate(
      `<NARRATION_BRUTE>\n${rawNarration}\n</NARRATION_BRUTE>\n\nPolis cette narration.`,
      polishSystem,
      'application/json'
    )
    const final = this.parseJSONSafe<{ narration: string }>(polishedRaw, { narration: rawNarration })

    return final.narration
  }

  /**
   * Génère la narration d'une scène spécifique avec MÉMOIRE 2.0.
   */
  async generateSceneNarration(
    event: VimaxEvent,
    context: SeriesContext,
    targetWordCount?: string,
    maxScenes?: number,
    isActuallyLast = false,
    sceneMemories: SceneMemory[] = [],
    sceneNumber?: number,
    totalScenes?: number,
    continuityBlock = '', // Hardening 2.0 (Engine)
    tensionBlock = '', // Hardening 2.0 (Engine)
    intentReminder = '',
    narrativeContext?: any // [V48] Architecte Narratif
  ): Promise<{ narration: string; memory: SceneMemory }> {
    const recentMemory =
      sceneMemories.length > 0
        ? `
[MÉMOIRE NARRATIVE RÉCENTE]
${sceneMemories
  .slice(-3)
  .map((m, i) => `- Scène ${sceneMemories.length - 2 + i}: ${m.summary}`)
  .join('\n')}
`.trim()
        : "[PREMIÈRE SCÈNE DE L'ÉPISODE]"

    const prompt = `
${recentMemory}

${continuityBlock}

${tensionBlock}

<EVENEMENT_CIBLE>
${event.description}
</EVENEMENT_CIBLE>

Génère la narration de cette scène. 
SI UN PERSONNAGE EST BLESSÉ OU UN LIEU MODIFIÉ DANS LE BLOC DE COHÉRENCE, TU DOIS LE REFLÉTER VISCÉRALEMENT DANS TA NARRATION.
`.trim()

    const system = this.getSystem(
      'episode',
      targetWordCount,
      context,
      sceneMemories,
      sceneNumber,
      totalScenes,
      intentReminder,
      event
    )
    const raw = await this.generate(prompt, system, 'application/json', undefined, narrativeContext)
    const parsedRaw = this.parseJSONSafe<{ narration: string; memory?: SceneMemory }>(raw, {
      narration: event.description
    })

    const narration = parsedRaw.narration || event.description
    const memory = parsedRaw.memory || {
      sceneNumber: sceneNumber || 0,
      role: 'unknown',
      summary: narration.slice(0, 100),
      charactersPresent: [],
      location: 'unknown',
      lastAction: '',
      tensionLevel: 5
    }

    // S'assurer que le memory retourné contient l'index correct et les states
    memory.sceneNumber = sceneNumber || 0
    if (!memory.summary) memory.summary = narration.slice(0, 100)

    return { narration, memory }
  }

  /**
   * Génère une narration polie (Double Pass) en utilisant l'ADN Stylistique.
   */
  async generatePolishedNarration(
    event: VimaxEvent,
    context: SeriesContext,
    targetWordCount?: string,
    maxScenes?: number,
    isActuallyLast = false,
    sceneMemories: SceneMemory[] = [],
    sceneNumber?: number,
    totalScenes?: number,
    continuityBlock = '',
    tensionBlock = '',
    intentReminder = ''
  ): Promise<{ narration: string; memory: SceneMemory }> {
    // [V48] Calcul du contexte pour l'ADN
    const genre =
      context.seriesBible && typeof context.seriesBible !== 'string' ? context.seriesBible.genre || 'any' : 'any'
    const narrativeContext = {
      moment: sceneNumber === 1 ? 'opening' : sceneNumber === totalScenes ? 'resolution' : 'any',
      genres: [genre],
      tension: sceneMemories.length > 0 ? sceneMemories.at(-1).tensionLevel * 10 : 50
    }

    // PASS 1 : Génération Brute
    const { narration: rawNarration, memory } = await this.generateSceneNarration(
      event,
      context,
      targetWordCount,
      maxScenes,
      isActuallyLast,
      sceneMemories,
      sceneNumber,
      totalScenes,
      continuityBlock,
      tensionBlock,
      intentReminder,
      narrativeContext
    )

    // Si on n'a pas d'ADN stylistique, on s'arrête là pour économiser des tokens
    const store = LessonStore.getInstance()
    const dna = store.getStylisticDNA(this.id, this.brainMode, narrativeContext)
    // PASS 2 : Polissage Stylistique (Uniquement si ADN présent)
    let polishedNarration = rawNarration
    if (dna.vocabulary.length > 0 || dna.forbidden.length > 0) {
      const polishSystem = `
Tu es l'Éditeur Stylistique de Vimax. Ton but est de raffiner la narration brute pour la rendre plus CINÉMATIQUE et PERCUTANTE.

[ADN STYLISTIQUE - WORD BANK]
${dna.vocabulary.join(', ')}

[ADN STYLISTIQUE - CLICHÉS BANNIS]
${dna.forbidden.join(', ')}

[CONSIGNES DE POLISSAGE] :
1. Remplace les verbes faibles par des verbes d'action issus de la Word Bank.
2. Élimine TOUS les clichés bannis.
3. STRUCTURE LE RYTHME : Alterne phrases nominales (impact) et phrases complexes (durée).
4. TAGS ELEVENLABS : Insère des <break time="0.3s" /> après les points si le rythme est STACCATO. Insère <break time="1.2s" /> pour un silence lourd.
5. POV : Assure-toi que la narration ne dérive pas d'un personnage à l'autre. Reste dans la tête du focalisateur.
6. DENSITÉ : Si la scène est une révélation, isole l'information. Si c'est de l'action, densifie les verbes de manifestation.
7. CONTRAINTE LONGUEUR : Ne dépasse JAMAIS le volume de la narration brute. Raccourcis si possible.

${this.getGlobalScriptBlock(context)}

${this.getEpisodePlanBlock(context)}

[FORMAT] : Renvoie UNIQUEMENT la narration polie en JSON : { "narration": "..." }
`.trim()

      const rawResult = await this.generate(
        `<NARRATION_BRUTE>\n${rawNarration}\n</NARRATION_BRUTE>\n\nPolis cette narration en respectant strictement l'ADN Stylistique.`,
        polishSystem,
        'application/json',
        undefined,
        narrativeContext
      )

      const polishedResult = this.parseJSONSafe<{ narration: string }>(rawResult, { narration: rawNarration })
      polishedNarration = polishedResult.narration
    }

    // PASS 3 : Subtexte & Atmosphère (V4.5 - Director's Cut) — TOUJOURS ACTIF
    const subtextSystem = `
Tu es le Réalisateur de Vimax. Ton but est d'injecter du **SUBTEXTE** et de l'**ATMOSPHÈRE** dans la narration.
Ne change pas l'action, change la PERCEPTION.

[CRITÈRE DE RÉUSSITE - RÉALISME HUMAIN] :
- Remplace toute métaphore abstraite par un fait biologique (ex: "la peur" -> "les mains moites").
- Supprime les adverbes en "-ment".
- ÉCONOMISATION : Utilise le minimum de mots pour le maximum d'impact. Pas de fioritures.
- ARCHÉTYPES : Alignement sur la structure "${context.intent && typeof context.intent !== 'string' ? context.intent.archetypeBlueprint?.structure : 'Standard'}" et le rôle "${context.intent && typeof context.intent !== 'string' ? context.intent.archetypeBlueprint?.protagonistArchetype : 'Hero'}".
- SOUS-TEXTE : Ce que le personnage ne dit pas est plus important que ce qu'il fait.
- ÉCONOMIE NARRATIVE : Chaque détail doit servir le thème principal : "${context.intent && typeof context.intent !== 'string' ? context.intent.authorialSignature?.themes?.[0] : 'None'}".
- DÉFI CONCISION : Élimine les adverbes. Garde un rythme nerveux.

${this.getGlobalScriptBlock(context)}

${this.getEpisodePlanBlock(context)}

[FORMAT] : Renvoie UNIQUEMENT la narration finale en JSON : { 
  "narration": "...", 
  "emotionalComposite": "description de l'émotion mixte",
  "moralWeight": 0-10 
}
`.trim()

    const finalResult = await this.generate(
      `<NARRATION_POLIE>\n${polishedNarration}\n</NARRATION_POLIE>\n\nInjecte le subtexte et l'atmosphère cinématographique.`,
      subtextSystem,
      'application/json',
      undefined,
      narrativeContext
    )

    const v45Final = this.parseJSONSafe<{ narration: string }>(finalResult, { narration: polishedNarration })

    // Mettre à jour le résumé dans la mémoire
    memory.summary = v45Final.narration.slice(0, 100)

    return { narration: v45Final.narration, memory }
  }

  private async extractSceneMemory(
    narration: string,
    sceneNumber: number,
    lastMemory?: SceneMemory
  ): Promise<SceneMemory> {
    const system = `
Analyse cette narration et extrais les métadonnées de continuité en JSON :
{
  "sceneNumber": ${sceneNumber},
  "role": "Rôle unique de la scène",
  "summary": "Résumé en 1 phrase",
  "charactersPresent": ["@PascalCase"],
  "location": "Lieu de la scène",
  "lastAction": "Dernière action accomplie",
  "tensionLevel": 5,
  "resolutionStatus": "resolved | escalated | dangling",
  "sceneContext": "Thématique/Ambiance (ex: Duel tendu, pause mélancolique)",
  "locationStates": [
    {
      "locationId": "Lieu ID",
      "currentState": "État physique actuel",
      "modifications": ["Ajout de modification visuelle"],
      "lastModifiedAtScene": ${sceneNumber}
    }
  ],
  "characterStates": [
    {
      "identifier": "@Nom",
      "physicalState": "État physique (blessure, fatigue)",
      "lastKnownPosition": "Position précise",
      "emotionalState": "Émotion dominante",
      "lastModifiedAtScene": ${sceneNumber}
    }
  ],
  "plotContract": {
    "openPromises": [],
    "closedPromises": []
  },
  "povCharacter": "@Nom",
  "informationDensity": "sparse | balanced | dense",
  "narrativeRhythm": "Description du rythme actuel",
  "emotionalComposite": "Un mélange d'émotions (ex: fureur glacée)",
  "moralWeight": 5
}

CONSIGNE : Si un état (lieu ou personnage) n'est pas mentionné, hérite de l'état précédent :
${JSON.stringify(lastMemory || {}, null, 2)}
`.trim()

    const raw = await this.generate(
      `<NARRATION>\n${narration}\n</NARRATION>\n\nExtrais la mémoire complète de cette scène.`,
      system,
      'application/json'
    )

    return this.parseJSONSafe<SceneMemory>(raw, {
      sceneNumber,
      role: 'Inconnue',
      summary: narration.slice(0, 100),
      charactersPresent: [],
      location: 'unknown',
      lastAction: '',
      tensionLevel: 5
    })
  }
}
