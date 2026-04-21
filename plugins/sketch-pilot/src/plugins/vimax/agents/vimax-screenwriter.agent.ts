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
  private getSceneSystem(): string {
    return `
[RÔLE : Expert Cinématographique]
Génère les métadonnées cinématiques (camera, tension, stroboscopie, patch) pour cette scène.

Renvoie UNIQUEMENT du JSON valide correspondant au schéma.
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

<CONTEXTE_SÉRIE>
${JSON.stringify(context, null, 2)}
</CONTEXTE_SÉRIE>

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

    const result = await this.generateStructured<RawSceneMeta>(prompt, this.getSceneSystem(), {
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
    })

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

<CONTEXTE_SÉRIE>
${JSON.stringify(context, null, 2)}
</CONTEXTE_SÉRIE>

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
