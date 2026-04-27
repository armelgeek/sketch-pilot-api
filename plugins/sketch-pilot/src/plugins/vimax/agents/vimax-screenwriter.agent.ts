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
  locationContext?: string
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

[TRAILER STYLE : LE CHOC VISUEL]
- CHAQUE SCÈNE DOIT ÊTRE UNE CLAQUE : Privilégie les angles extrêmes (Plongée totale, Contre-plongée, Angle Hollandais).
- LUMIÈRE : Utilise des ambiances tranchées (Stroboscopie, clair-obscur, néons saturés).
- ZERO ABSTRACTION : Interdiction d'utiliser "tension", "mystère", "ambiance". Décris des FAITS PHYSIQUES.
- [LOI DE LA FRACTURE] : "scenePurpose" et "sceneDelta" doivent décrire des changements d'état irréversibles.
- [LOCK TEMPOREL] : Précise toujours le 'temporalContext' (ex: Manchester 1885, Futuristic City, Vision Dream).
- [LOI DE L'EXTENSION SPATIALE] : Utilise "locationContext" pour décrire le sous-lieu ou l'espace de transition spécifique (ex: "Un ascenseur vers @Lobby").

${this.getGlobalScriptBlock(context)}

${this.getBlueprintBlock(context)}

${this.getEpisodePlanBlock(context)}

${this.getScenePlanBlock(context)}

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
    "locationContinuity": { "location-id": { "description": "chaîne de caractères", "physicalState": "chaîne de caractères" } }
  },
  "titles": ["Titre 1", "Titre 2", "Titre 3"]
}
`.trim()
  }

  // ─── Public API ────────────────────────────

  async generateSceneMeta(
    narration: string,
    eventDescription: string,
    imagePrompt: string,
    sceneNumber: number,
    totalScenes: number,
    context: SeriesContext = {},
    forceClimax = false,
    cameraIntent?: any
  ): Promise<Omit<VimaxScene, 'id' | 'sceneNumber' | 'narration' | 'imagePrompt' | 'duration' | 'startTime'>> {
    let cameraRule = ''

    if (forceClimax || sceneNumber === totalScenes) {
      cameraRule = `[OBLIGATION] SCÈNE ${sceneNumber} (FINALE) : shake + slow-motion (high intensity). Impact physique maximum.`
    } else if (sceneNumber === 1) {
      cameraRule = `SCÈNE 1 (INTRO) : handheld (low intensity). Établit la géographie.`
    } else {
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

${cameraIntent ? `[INTENTION VISUELLE OBLIGATOIRE V41.0]\n- TYPE : ${cameraIntent.shotType}\n- AXE : ${cameraIntent.axisChange}\n- FOCUS : ${cameraIntent.focusSubject}\n` : ''}

Génère les métadonnées cinématiques. 
VARIÉTÉ DE PLANS : Alterne CLOSEUP (visage/émotion), OVERSHOULDER (dialogue) et WIDE (chaos).

[RÈGLE D'OR : RYTHME CAMÉRA PAR SCÈNE]
${cameraRule}

[RÈGLE DILATATION : MICRO-RÉACTIONS]
Foreground DOIT avoir un détail physique (mâchoire, main, sueur, regard).

Renvoie du JSON :
{
  "scenePurpose": "reveal | escalate | misdirect | stabilize | collapse",
  "temporalContext": "Victorian | Modern | Vision | Futuristic | Medieval",
  "sceneDelta": "Explication courte du changement",
  "charactersInScene": ["@PascalCase"],
  "locationId": "ID de lieu",
  "locationContext": "description du sous-lieu improvisé",
  "pacing": 5,
  "cameraAction": [{ "type": "handheld | push-in | snap-zoom | shake | slow-motion...", "intensity": "low | medium | high" }],
  "composition": { 
    "shotType": "CLOSEUP | MEDIUM | WIDE...", 
    "lightingMood": "stroboscopique | rouge intermittent | flash...", 
    "layout": "SINGLE",
    "foreground": "",
    "midground": "",
    "background": ""
  },
  "tensionState": { "level": 5, "type": "build | sustain | spike | release" },
  "simulationPatch": { "worldPatch": {}, "charactersPatch": {} }
}
`.trim()

    const result = await this.generateStructured<RawSceneMeta>(prompt, this.getSceneSystem(context), {
      scenePurpose: 'reveal',
      sceneDelta: '',
      charactersInScene: [],
      locationId: 'unknown',
      locationContext: '',
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

    const tension = parsed.tensionState?.level ?? 5
    parsed.pacing = tension >= 9 ? 9 : tension

    return {
      ...parsed,
      charactersInScene: (parsed.charactersInScene || []).map((id: string) => this.normalizeIdentifier(id))
    }
  }

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

    return result.data
  }
}
