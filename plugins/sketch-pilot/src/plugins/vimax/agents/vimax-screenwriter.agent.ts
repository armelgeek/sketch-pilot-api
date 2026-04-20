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
  private getSceneSystem(): string {
    return `
[DIRECTIVES CINÉMATOGRAPHIQUES]
1. ID UNIQUE : Utilise impérativement le NUMÉRO_SCÈNE fourni pour construire l'ID logique.
2. ALIGNEMENT : 'charactersInScene' doit correspondre EXACTEMENT aux personnages présents physiquement dans la narration ou l'imagePrompt.
3. LUMIÈRE & STAGING : Définis une source de lumière dominante et COHÉRENTE avec l'environnement (ex: "lumière chaude des flammes", "nuit froide"). 
5. RHYTHME CAMÉRA OBLIGATOIRE (Audit de Rigueur) :
   - SCÈNE 1 (Ambiance) : handheld léger (low intensity)
   - SCÈNE 2 (Tension) : push-in (medium intensity)
   - SCÈNE 3 (Révélation) : slow-zoom (low/medium intensity)
   - SCÈNE 4 (Chaos) : shake OU dutch-tilt (medium intensity)
   - SCÈNE 5 (Blast Effect) : shake + slow-motion (high intensity)
6. MICRO-RÉACTIONS PHYSIQUES (DÉTAILLÉES) :
   - Tu DOIS inclure un micro-détail physique pour le sujet au "foreground" (ex: "tempe qui palpite", "mâchoire qui se crispe", "main s'accrochant au rebord").
   - "midground": Réaction de la foule ou des alliés (ex: "reculent d'un pas synchrone", "se figent comme des statues").
   - "background": Géographie atmosphérique.
7. AUDIT DE TRAHISON (@Poire) : Si @Poire est présent et que la vérité éclate, il DOIT avoir une posture fuyante (évite le regard, corps de trois-quarts).
8. ALIGNEMENT : 'charactersInScene' = exacte présence physique.
9. LUMIÈRE : "faisceau directionnel", "rouge intermittent", "flash d'explosion", "ombres dures".

[CONTRAINTES — ÉNUMÉRATIONS UNIQUEMENT]
- scenePurpose: "reveal" | "escalate" | "misdirect" | "stabilize" | "collapse"
- composition.shotType: "CLOSEUP" | "MEDIUM" | "WIDE" | "ESTABLISHING" | "PANORAMIC" | "POV" | "OVERSHOULDER"
- composition.layout: "SINGLE" | "MONTAGE" | "SPLIT" | "DIAGONAL"
- cameraAction.type: "none" | "pan-left" | "pan-right" | "pan-up" | "pan-down" | "zoom-in" | "zoom-out" | "shake" | "breathing" | "snap-zoom" | "dutch-tilt" | "handheld" | "slow-motion" | "push-in"
- cameraAction.intensity: "low" | "medium" | "high"
- tensionState.type: "build" | "sustain" | "spike" | "release"
- tensionState.level: entier 1-10
- pacing: entier 1-10

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
    context: SeriesContext = {},
    forceClimax = false
  ): Promise<Omit<VimaxScene, 'id' | 'sceneNumber' | 'narration' | 'imagePrompt' | 'duration' | 'startTime'>> {
    const cameraRule = forceClimax
      ? `[OBLIGATION] SCÈNE ${sceneNumber} : shake + slow-motion (high intensity)`
      : `
- SCÈNE 1 : handheld (low)
- SCÈNE 2 : push-in (medium)
- SCÈNE 3 : slow-zoom (low)
- SCÈNE 4 : shake (medium)
- SCÈNE 5 : shake + slow-motion (high)
`.trim()

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

    const raw = await this.generate(prompt, this.getSceneSystem(), 'application/json')
    const parsed = this.parseJSONSafe<RawSceneMeta>(raw, {
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
      tensionState: { level: 5, type: 'sustain' },
      simulationPatch: { worldPatch: {}, charactersPatch: {} }
    })

    return {
      ...parsed,
      charactersInScene: parsed.charactersInScene.map((id) => this.normalizeIdentifier(id))
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

    const raw = await this.generate(prompt, this.getEpisodeSystem(), 'application/json')
    const parsed = this.parseJSONSafe<RawScreenplayMeta>(raw, {
      seriesMetadata: {
        episodeSummary: '',
        cliffhanger: { type: 'unknown', description: '', audienceQuestion: '' },
        characterContinuity: {},
        locationContinuity: {}
      },
      titles: []
    })

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
