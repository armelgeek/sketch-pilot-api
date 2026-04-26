import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { SeriesContext, VimaxScene, VimaxScreenplay } from '../types'

// ─────────────────────────────────────────────
// VimaxScreenwriter (Pass 2)
// Prend une scène narration + event et génère
// les métadonnées cinématiques (camera, tension, patch).
// L'imagePrompt est généré séparément par VimaxSagaPlanner (motion).
// ─────────────────────────────────────────────

interface RawSceneMeta {
  scenePurpose: VimaxScene['scenePurpose']
  sceneDelta: string
  charactersInScene: string[]
  locationId: string
  pacing: number
  cameraAction: VimaxScene['cameraAction']
  composition: VimaxScene['composition']
  tensionState: VimaxScene['tensionState']
  simulationPatch: VimaxScene['simulationPatch']
}

interface RawScreenplayMeta {
  seriesMetadata: VimaxScreenplay['seriesMetadata']
  titles: string[]
}

export class VimaxScreenwriter extends VimaxBaseAgent {
  public id = 'screenwriter'
  private getAudienceBlock(context: SeriesContext): string {
    const intent = context.intent
    if (!intent || typeof intent === 'string' || !intent.audience) return ''
    const aud = intent.audience
    return `
[AUDIENCE CIBLE]
- Public : ${aud.ageRange}
- Plateforme : ${aud.platform}
- Attention : ${aud.attentionSpan}s
- Rythme attendu : ${aud.expectedPace}
`.trim()
  }

  private getSceneSystem(context: SeriesContext): string {
    const audienceBlock = this.getAudienceBlock(context)
    const intent = context.intent
    const platform = intent && typeof intent !== 'string' ? intent.audience?.platform : 'unknown'

    return `
[RÔLE : Expert Cinématographique]
Génère les métadonnées cinématiques (camera, tension, stroboscopie, patch) pour cette scène.

${audienceBlock}

[DIRECTIONS DE RYTHME]
${platform === 'tiktok' ? '- TIKTOK MODE : Cuts rapides, gros plans fréquents, énergie maximum dès la seconde 0.' : ''}
${platform === 'cinema' ? '- CINEMA MODE : Compositions soignées, plans larges, dilatation temporelle autorisée.' : ''}

${this.getGlobalScriptBlock(context)}

${this.getBlueprintBlock(context)}

${this.getEpisodePlanBlock(context)}

Renvoie UNIQUEMENT du JSON valide correspondant au schéma.
`.trim()
  }

  private getGlobalScriptBlock(context: SeriesContext): string {
    if (!context.globalScript) return ''
    const truncated = context.globalScript.slice(0, 2000)
    return `
[SCRIPT GLOBAL DE LA SAGA — RÉFÉRENCE]
${truncated}${context.globalScript.length > 2000 ? '\n[...]' : ''}
`.trim()
  }

  private getBlueprintBlock(context: SeriesContext): string {
    const b = context.blueprint
    if (!b || !b.premise) return ''
    return `
[BLUEPRINT NARRATIF]
- THÈME : ${b.theme}
- PRÉMISSE : ${b.premise}
`.trim()
  }

  private getEpisodePlanBlock(context: SeriesContext): string {
    const plan = context.plannedEpisodeContext
    if (!plan) return ''
    return `
[PLAN DE L'ÉPISODE PRÉVU]
- TITRE : ${plan.title || 'Inconnu'}
- HOOK : ${plan.hook || 'Inconnu'}
- FONCTION : ${plan.dramaticFunction || 'Inconnue'}
`.trim()
  }

  private getEpisodeSystem(): string {
    return `
[RÔLE]
Tu es un Gardien de la Bible de Série pour des vidéos épisodiques IA de haut niveau.
Étant donné toutes les scènes d'un épisode, génère les métadonnées au niveau de l'épisode.

Renvoie UNIQUEMENT du JSON valide :
{
  "seriesMetadata": {
    "episodeSummary": "chaîne de caractères",
    "cliffhanger": { "type": "revelation|peril|choice|betrayal|unknown", "description": "chaîne de caractères", "audienceQuestion": "chaîne de caractères" },
    "characterContinuity": { "@Nom": { "description": "chaîne de caractères", "status": "chaîne de caractères" } },
    "locationContinuity": { "location-id": { "description": "chaîne de caractères", "atmosphere": "chaîne de caractères" } }
  },
  "titles": ["Titre 1", "Titre 2", "Titre 3"]
}
`.trim()
  }

  // ─── Public API ────────────────────────────

  /**
   * Génère les métadonnées cinématiques d'une scène.
   * La narration est passée telle quelle — pas réécrite.
   */
  async generateSceneMeta(
    narration: string,
    eventDescription: string,
    imagePrompt: string,
    sceneNumber: number,
    totalScenes: number,
    context: SeriesContext = {},
    forceClimax = false
  ): Promise<Omit<VimaxScene, 'id' | 'sceneNumber' | 'narration' | 'imagePrompt' | 'duration' | 'startTime'>> {
    let cameraRule = ''

    if (forceClimax || sceneNumber === totalScenes) {
      cameraRule = `[OBLIGATION] SCÈNE ${sceneNumber} (FINALE) : shake + slow-motion (high intensity). Impact physique maximum.`
    } else if (sceneNumber === 1) {
      cameraRule = `SCÈNE 1 (INTRO) : handheld (low intensity). Pose l'ambiance.`
    } else {
      // Distribution dynamique des mouvements pour les scènes intermédiaires
      const intermediateMoves = ['push-in', 'slow-zoom', 'shake', 'breathing', 'pan-right', 'pan-left']
      const move = intermediateMoves[(sceneNumber - 1) % intermediateMoves.length]
      const intensity = sceneNumber > totalScenes / 2 ? 'medium' : 'low'
      cameraRule = `SCÈNE ${sceneNumber} : ${move} (${intensity} intensity).`
    }

    const prompt = `

<NARRATION>
${narration}
</NARRATION>

<IMAGE_PROMPT>
${imagePrompt}
</IMAGE_PROMPT>

<DESCRIPTION_ÉVÉNEMENT>
${eventDescription}
</DESCRIPTION_ÉVÉNEMENT>

<NUMÉRO_SCÈNE>${sceneNumber}</NUMÉRO_SCÈNE>

Génère les métadonnées cinématiques. 
VARIÉTÉ DE PLANS : Alterne CLOSEUP (visage/émotion), OVERSHOULDER (dialogue) et WIDE (chaos).

[RÈGLE D'OR : RYTHME CAMÉRA PAR SCÈNE]
${cameraRule}

[RÈGLE DILATATION : MICRO-RÉACTIONS]
Foreground DOIT avoir un détail physique (mâchoire, main, sueur, regard).

Renvoie du JSON :
{
  "scenePurpose": "reveal | escalate | misdirect | stabilize | collapse",
  "sceneDelta": "Explication courte du changement",
  "charactersInScene": ["@PascalCase"],
  "locationId": "ID de lieu",
  "pacing": 5,
  "cameraAction": [{ "type": "handheld | push-in | snap-zoom | shake | slow-motion...", "intensity": "low | medium | high" }],
  "composition": { 
    "shotType": "CLOSEUP | MEDIUM | WIDE...", 
    "lightingMood": "stroboscopique | rouge intermittent | flash...", 
    "layout": "SINGLE",
    "foreground": "Ce qui est au premier plan (sujet/objet)",
    "midground": "Ce qui est au second plan (groupe/décor)",
    "background": "Ce qui est en arrière-plan (géographie/atmosphère)"
  },
  "tensionState": { "level": 5, "type": "build | sustain | spike | release" },
  "simulationPatch": { "worldPatch": {}, "charactersPatch": {} }
}
`.trim()

    // [V48] Calcul du contexte narratif chirurgical
    const isOpening = sceneNumber === 1
    const isResolution = sceneNumber === totalScenes
    const isMidpoint = Math.abs(sceneNumber - totalScenes / 2) < 1
    const isClimax = forceClimax || sceneNumber / totalScenes > 0.8
    const genre = context.intent && typeof context.intent !== 'string' ? context.intent.genre || 'any' : 'any'

    const narrativeContext = {
      moment: isOpening
        ? 'opening'
        : isResolution
          ? 'resolution'
          : isClimax
            ? 'climax'
            : isMidpoint
              ? 'midpoint'
              : 'any',
      genres: [genre],
      tension: isClimax ? 80 : 40,
      isAction: cameraRule.includes('shake') || cameraRule.includes('impact'),
      isDialogue: imagePrompt.toLowerCase().includes('dialogue') || imagePrompt.toLowerCase().includes('parle')
    }

    const result = await this.generateStructured<RawSceneMeta>(
      prompt,
      this.getSceneSystem(context),
      {
        scenePurpose: 'reveal',
        sceneDelta: '',
        charactersInScene: [],
        locationId: 'unknown',
        pacing: 5,
        cameraAction: [{ type: 'none', intensity: 'low' }],
        composition: {
          shotType: 'MEDIUM',
          lightingMood: 'neutral',
          layout: 'SINGLE',
          foreground: '',
          midground: '',
          background: ''
        },
        tensionState: { level: 5, type: 'sustain', label: 'sustain' },
        simulationPatch: { worldPatch: {}, charactersPatch: {} }
      },
      undefined,
      2,
      narrativeContext
    )

    const parsed = result.data

    // PacingDirector : Corrélation forcée entre tension et pacing
    // T2 -> P2, T5 -> P5, T10 -> P9
    const tension = parsed.tensionState.level
    if (tension >= 9) {
      parsed.pacing = 9
    } else {
      parsed.pacing = tension
    }

    return {
      ...parsed,
      charactersInScene: parsed.charactersInScene.map((id: string) => this.normalizeIdentifier(id))
    }
  }

  /**
   * Génère les métadonnées épisode (summary, cliffhanger, titles, continuité)
   * depuis toutes les scènes assemblées.
   */
  async generateEpisodeMeta(
    scenes: VimaxScene[],
    context: SeriesContext = {}
  ): Promise<Pick<VimaxScreenplay, 'seriesMetadata' | 'titles'>> {
    const scenesSummary = scenes.map((s) => `Scene ${s.sceneNumber}: ${s.narration}`).join('\n\n')

    const prompt = `
<SCÈNES>
${scenesSummary}
</SCÈNES>

${this.getGlobalScriptBlock(context)}

${this.getEpisodePlanBlock(context)}

Génère les métadonnées de l'épisode.
`.trim()

    const result = await this.generateStructured<RawScreenplayMeta>(prompt, this.getEpisodeSystem(), {
      seriesMetadata: {
        episodeSummary: '',
        cliffhanger: { type: 'unknown', description: '', audienceQuestion: '' },
        characterContinuity: {},
        locationContinuity: {}
      },
      titles: []
    })

    const parsed = result.data

    // Normalisation des clés du dictionnaire characterContinuity
    const cleanCharacterContinuity: Record<string, any> = {}
    for (const [id, data] of Object.entries(parsed.seriesMetadata.characterContinuity)) {
      cleanCharacterContinuity[this.normalizeIdentifier(id)] = data
    }

    return {
      ...parsed,
      seriesMetadata: {
        ...parsed.seriesMetadata,
        characterContinuity: cleanCharacterContinuity
      }
    }
  }
}
