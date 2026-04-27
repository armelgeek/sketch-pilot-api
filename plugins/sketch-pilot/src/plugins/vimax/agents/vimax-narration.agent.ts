import { LessonStore } from '../core/lesson-store'
import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { NarrativeIntent, SagaIntent, SceneMemory, SeriesContext, VimaxEvent } from '../types'

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
        'Tu es un narrateur cinématographique Expert en Narration Viscérale et Atmosphérique. Ton écriture est courte mais riche en subtexte et en sensations physiques. Tu équilibres concision et immersion littéraire.'
    })
  }

  private getNarrativeIdentity(intent?: SagaIntent | string): NarrativeIntent {
    if (!intent || typeof intent === 'string' || !intent.narrativeIntent) {
      return {
        voice: { type: 'omniscient', tone: 'cinematic', distance: 'close' },
        rhythm: { style: 'cinematic', sentenceVariety: true, useNominalPhrases: false },
        grammar: { dominantTense: 'present', tenseSwitching: false },
        density: 'balanced'
      }
    }
    return intent.narrativeIntent
  }

  private getEmotionalDepthBlock(mode: 'series' | 'episode'): string {
    if (mode === 'episode') return '' // Désactivé pour les scènes courtes
    return `
[PROFONDEUR ÉMOTIONNELLE - MODE SÉRIE UNIQUEMENT]
- CONFLIT INTÉRIEUR : Descends dans le doute, la peur ou l'hésitation.
- ÉMOTIONS COMPOSITES : Cherche le mélange (ex: soulagement amer).
- POIDS MORAL : Fais ressentir la conséquence éthique du choix.
- CORPS NARRATIF : Utilise la posture, la respiration et le regard.
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
    const ni = this.getNarrativeIdentity(context.intent as SagaIntent)
    const dna = LessonStore.getInstance().getStylisticDNA(this.id, this.brainMode)

    const wordBank = dna.vocabulary.length > 0 ? `\n[BANQUE DE MOTS] :\n- ${dna.vocabulary.join(', ')}` : ''
    const negativePrompt = dna.forbidden.length > 0 ? `\n[INTERDICTION] :\n- ${dna.forbidden.join(', ')}` : ''

    const structuralContext = event ? this.getStructuralContext(event) : ''
    const emotionalDepth = this.getEmotionalDepthBlock(mode)
    const memoryBlock = mode === 'episode' ? this.getSceneMemoryBlock(previousScenes) : ''

    const ghostScriptBlock =
      mode === 'episode' && context.globalScript
        ? `\n[HÉRITAGE ATMOSPHÉRIQUE - GHOST SCRIPT]\n${context.globalScript}\n(Respecte scrupuleusement le vocabulaire et les métaphores de ce texte pour ta scène.)`
        : ''

    return `
Tu es une Voix-Off de Trailer Cinématique. Ton but est de créer une atmosphère viscérale et immersive tout en restant extrêmement concis Adopte le standard "Atmospheric Narrative Fluidity".

${structuralContext}
${emotionalDepth}
${intentReminder}
${this.getGlobalScriptBlock(context)}
${this.getBlueprintBlock(context)}
${this.getEpisodePlanBlock(context)}
${mode === 'episode' ? this.getScenePlanBlock(context) : ''}
${memoryBlock}
${ghostScriptBlock}

[LOI DE L'HÉRITAGE VISUEL-NARRATIF - V39.0]
- Tu connais désormais l'IMAGE exacte générée pour les scènes précédentes (via 'Visual Beat').
- Si une image a capturé un moment fort (ex: un objet qui casse), ta narration suivante doit en tenir compte.
- Traite les 'Visual Beats' passés comme tes nouveaux faits narratifs de référence.

[DIRECTIVES DE STYLE]
- RYTHME : Phrases courtes et complètes. Utilise des adjectifs sensoriels (froid, sombre, brûlant) pour poser le décor.
- TEMPS : Écris au PRÉSENT STRICT.
- DENSITÉ : Narration ATMOSPHÉRIQUE mais ULTRA-CONCISE.

${wordBank}
${negativePrompt}

[LOI DE LA CONCISION CHIRURGICALE - PRIORITÉ ABSOLUE]
1. PLAFOND STRICT : Interdiction de dépasser ${wordCount || '15'} mots par scène.
2. SUBTEXTE SENSORIEL : Chaque phrase doit évoquer un climat ou une émotion physique (ex: "In the freezing shadows...").
3. ACTION MACRO-SENSORIELLE : Focus sur le RÉSULTAT ou le DÉPLACEMENT, mais rattaché à l'ambiance du lieu.
4. LIANT NARRATIF : Chaque scène (sauf la 1) commence par un pont de mouvement (Participe Présent ou Adverbe de lieu).

[LOI ANTI-FILLER & ANTI-CLICHÉ - V35.0]
- INTERDICTION de commencer par : "Alors que", "Tandis que", "Pendant que".
- BANNIS : "Tout bascule", "Le destin", "Soudain", "Il ne savait pas que", "Dans ce monde", "C'est alors que".
- PAS DE MÉTAPHORES CLASSIQUES : Évite les "ombres qui dansent" ou "le silence de mort". Préfère le froid, le métal, le sang, la sueur.

[LOI DU "SHOW, DON'T TELL"]
- Ne dis pas "Il a peur". Dis "Sa main tremble sur le chrome".
- Ne dis pas "C'est dangereux". Décris une lame ou une étincelle.

[ÉCHANTILLON GOLDEN - HIGH-VELOCITY V30.0] : 
- S1 : L'usine s'efface dans l'aube. Lucas franchit les grilles. Pas de retour.
- S2 : S'engouffrant dans la ville, Lucas évite les gardes. La traque commence.
- S5 : Le feu dévore tout. Lucas saute dans le vide. La fracture est totale.

RESTE BIEN SOUS LES ${wordCount || '15'} MOTS. RENVOIE DU JSON : { "narration": "..." }
`.trim()
  }

  private getSceneMemoryBlock(scenes: SceneMemory[]): string {
    if (scenes.length === 0) return ''
    const history = scenes
      .map(
        (s) =>
          `SCÈNE ${s.sceneNumber} :
- Texte: ${s.summary}
- Visuel (Beat): ${s.visualBeat || 'Inconnu'}
- Action Finale: ${s.lastAction}`
      )
      .join('\n\n')

    return `\n[HISTORIQUE NARRATIF ET VISUEL]\n${history}`
  }

  private getTransitionStyleBlock(transitionType?: string): string {
    if (transitionType === 'continuation') {
      return `
[STYLE CONTINUATION DIRECTE]
1. PAS DE LEAD-IN : Interdiction de commencer par un pont de mouvement (ex: "S'extirpant de...", "Quittant le...").
2. ACTION IMMÉDIATE : Commence directement par le verbe (ex: "@She tend l'allumette. Le froid mords.").
3. FLUIDITÉ : Traite cette scène comme la fin de la phrase précédente.
`.trim()
    }
    return ''
  }

  private getStructuralContext(event: VimaxEvent): string {
    return `[FONCTION] : ${event.dramaticFunction?.toUpperCase() || 'ACTION'} | [TARGET] : Tension ${event.tensionTarget || 5}/10`.trim()
  }

  // ─── Public API ────────────────────────────

  async generateEpisodeNarration(
    event: VimaxEvent,
    context: SeriesContext = {},
    targetDuration?: number,
    maxScenes?: number,
    correctionHint?: string
  ): Promise<string> {
    const raw = await this.generate(
      `<EVENT>\n${event.description}\n</EVENT>`,
      this.getSystem('series', undefined, context, [], undefined, undefined, '', event),
      'application/json'
    )
    const parsed = this.parseJSONSafe<{ narration: string }>(raw, { narration: event.description })
    return parsed.narration
  }

  public async generateSceneNarration(
    event: VimaxEvent,
    context: SeriesContext,
    targetWordCount?: string,
    maxScenes?: number,
    isActuallyLast = false,
    previousScenes: SceneMemory[] = [],
    sceneNumber?: number,
    totalScenes?: number,
    continuityBlock = '',
    tensionBlock = '',
    intentReminder = '',
    episodeNarration?: string, // [V47] Ghost Script
    transitionType?: string
  ): Promise<{ narration: string; memory: SceneMemory }> {
    const ni = this.getNarrativeIdentity(context.intent as SagaIntent)
    const transitionStyle = this.getTransitionStyleBlock(transitionType)

    // Override globalScript temporarily for the system prompt if episodeNarration is provided
    const tempContext = { ...context, globalScript: episodeNarration || context.globalScript }

    const system = this.getSystem(
      'episode',
      targetWordCount,
      tempContext,
      previousScenes,
      sceneNumber,
      totalScenes,
      intentReminder + transitionStyle,
      event
    )
    const prompt = `
${continuityBlock}
${tensionBlock}
<TARGET_EVENT>
${event.description}
</TARGET_EVENT>
`.trim()

    const raw = await this.generate(prompt, system, 'application/json')
    const parsedRaw = this.parseJSONSafe<{ narration: string; memory?: SceneMemory }>(raw, {
      narration: event.description
    })

    const narration = parsedRaw.narration || event.description
    const memory = parsedRaw.memory || {
      sceneNumber: sceneNumber || 0,
      summary: narration.slice(0, 100),
      lastAction: narration.split('.').at(-1) || '',
      tensionLevel: 5,
      charactersPresent: [],
      location: 'unknown'
    }

    return { narration, memory }
  }

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
    intentReminder = '',
    episodeNarration?: string, // [V47] Ghost Script
    transitionType?: string
  ): Promise<{ narration: string; memory: SceneMemory }> {
    // Pass 1: Raw
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
      episodeNarration,
      transitionType
    )

    // Pass 2: Style (Simplified)
    const polishedNarration = rawNarration

    // Pass 3: Cutter (The Hard Enforcer)
    const subtextSystem = `
Tu es le CUTTER de Vimax. Ton unique mission : TAILLER ce texte pour qu'il fasse MOINS DE ${targetWordCount || '12'} mots.
IGNORE la longueur du texte reçu. COUPE SANS PITIÉ.

[DIRECTIVES] :
1. SUPPRIME TOUT sauf l'action physique et le lien (Laissant..., S'extirpant...).
2. SUPPRIME les adjectifs abstraits (beau, terrifiant, mystérieux). Ne garde que le SENSORIEL (froid, bleu, lourd).
3. SUPPRIME les pensées internes ou le futur ("Il va faire..."). Focus sur l'instant présent.
4. CIBLE : ${targetWordCount || '12'} mots.

[EXEMPLE] :
Source: "Alors que Lucas se lève, il sent le poids du destin peser sur ses épaules, prêt à tout briser."
Cutter: "Lucas se lève. Le métal grince sous son poids. Briser le cycle."

Renvoie du JSON : { "narration": "..." }
`.trim()

    const finalResult = await this.generate(`<SOURCE>\n${rawNarration}\n</SOURCE>`, subtextSystem, 'application/json')

    const final = this.parseJSONSafe<{ narration: string }>(finalResult, { narration: rawNarration })
    const finalNarration = final?.narration || rawNarration
    memory.summary = finalNarration.slice(0, 100)

    return { narration: finalNarration, memory }
  }
}
