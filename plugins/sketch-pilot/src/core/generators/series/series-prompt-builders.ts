import { CAMERA_ACTIONS_LIST, TRANSITIONS_LIST } from '../video-generator.abstract'
import type { SeriesContext } from '../series-video-generator'

export class SeriesPromptBuilders {
  /**
   * [V60] Cinematic Vision Hardening:
   * Extra rules for high-fidelity rendering, focusing on texture, lighting narrative, and vertical axis.
   */
  public static readonly CINEMATIC_VISION_RULES = `
--- 🎥 CINEMATIC VISION HARDENING (V60) 🎥 ---
- **Materiality & Texture** : Ne décrivez pas juste "une rue". Décrivez la texture du sol ("pavés luisants et inégaux", "boue gelée craquante"). La texture VEND le rendu.
- **Lighting Narrative** : Au lieu d'un mood simple, décrivez la SOURCE et l'EFFET ("Une lanterne à gaz vacillante projette des ombres allongées et déformées sur les murs en pierre").
- **Vertical Axis (ALS)** : Utilisez explicitement 'cameraElevation' dans votre JSON ({ "composition": { "cameraElevation": "high-angle | eye-level | low-angle" } }).
- **Atmospheric FX** : Spécifiez systématiquement un 'atmosphericFX' ({ "atmosphericFX": "floating embers | light dust | swirling snowflakes | thick fog" }).
- **Physicality** : Décrivez l'état physique du personnage en réaction au climat (corps tremblant, buée s'échappant de la bouche, épaules voûtées).
`

  public static buildPass1System(seriesContext: SeriesContext, narrativeInstructions: string[]): string {
    const characterRegistry = seriesContext.characterRegistry || {}
    const authorizedCharacters = Object.keys(characterRegistry).join(', ')

    return `Vous êtes un scénariste de séries expert en binge-watching et en narration épisodique.
      Episode N° ${seriesContext.episodeNumber}.
      RÔLE NARRATIF : ${
        seriesContext.episodeNumber === 1
          ? 'ACTE 1 (DÉCOMPRESSION/DÉPART)'
          : seriesContext.isFinalEpisode
            ? 'ACTE 3 (RÉSOLUTION FINALE)'
            : `ACTE 2 (DÉVELOPPEMENT/INTENSIFICATION - Épisode ${seriesContext.episodeNumber})`
      }
      Tâche: Écrire la narration de l'épisode ${seriesContext.episodeNumber}.

      🚨 DIRECTIVE NARRATIVE PRIORITAIRE (PHASE ACTUELLE) :
      ${narrativeInstructions.join('\n')}

      ${this.CINEMATIC_VISION_RULES}

      CONTEXTE GLOBAL (BIBLE) :
      ${seriesContext.globalContext || 'Pas de bible spécifiée.'}

      REGISTRE DES LIEUX (Canon) :
      ${Object.entries(seriesContext.locationRegistry || {})
        .map(([name, data]) => `• ${name}: ${data.description}`)
        .join('\n')}

      --- RÈGLES D'OR DE NARRATION ---
      • SHOW DON'T TELL : Ne dites pas qu'il fait froid, montrez la buée et les mains qui tremblent.
      • IDENTITÉS CANON : Utilisez EXCLUSIVEMENT les personnages : ${authorizedCharacters}.
      • ÉCONOMIE DE MOYENS : Limitez les nouveaux lieux (1 max).
    `
  }

  public static buildStructuringSystem(seriesContext: SeriesContext, narrativeInstructions: string[]): string {
    return `
🚨 DIRECTIVE NARRATIVE PRIORITAIRE :
${narrativeInstructions.join('\n')}

${this.CINEMATIC_VISION_RULES}

--- 🎬 DYNAMISME CINÉMATOGRAPHIQUE & STRUCTURE 🎬 ---
1. **Règle 45 (Variation de Cadrage)** : INTERDICTION DE RÉPÉTER le même 'shotType' consécutivement. Variation obligatoire: WIDE -> CLOSEUP -> MEDIUM -> OTS.
2. **Règle 48 (Materiality Engine)** : Chaque 'imagePrompt' DOIT décrire la texture d'au moins une surface (sol, mur, objet).
3. **Règle 49 (Atmospheric FX)** : Chaque scène DOIT avoir un effet aérosol ou particulaire (fumée, étincelles, poussière).

--- ⚠️ GARDES-FOUS TECHNIQUES ⚠️ ---
TRANSITIONS : [${TRANSITIONS_LIST.join(', ')}]
CAMERA ACTIONS : [${CAMERA_ACTIONS_LIST.join(', ')}]
SHOT TYPES: [CLOSEUP, MEDIUM, WIDE, ESTABLISHING, POV, OVERSHOULDER, PANORAMIC, LOW_ANGLE, HIGH_ANGLE, BIRD_EYE]

Schéma JSON attendu (Structure Saga v4) :
{
  "seriesMetadata": { ... },
  "titles": ["..."],
  "fullNarration": "...",
  "scenes": [
    {
      "id": "scene-1",
      "shotType": "WIDE",
      "composition": {
        "shotType": "WIDE",
        "cameraElevation": "eye-level | high-angle | low-angle",
        "lightingDescription": "Description narrative de la lumière et des ombres",
        "foregroundAnchor": "objet flou au premier plan"
      },
      "atmosphericFX": "particules/effets",
      "persistentDecorTokens": ["objet1", "objet2"],
      "imagePrompt": "Description VISUELLE et TEXTURÉE (Focus sur matérialité)",
      "animationPrompt": "Action physique du sujet",
      "charactersInScene": ["@Nom"],
      "locationId": "identifiant-lieu"
    }
  ]
}
`
  }

  public static buildPass2System(seriesContext: SeriesContext, narrativeInstructions: string[]): string {
    return `Vous êtes un réalisateur et monteur expert en séries.
      TRANSFORMATION NARRATION → SCRIPT VISUEL.
      
      🚨 DIRECTIVE NARRATIVE PRIORITAIRE :
      ${narrativeInstructions.join('\n')}

      ${this.CINEMATIC_VISION_RULES}

      CONSIGNES DE SCRIPTING :
      - Pour chaque scène, extrayez une partie VERBATIM de la narration.
      - Générez un 'imagePrompt' ultra-détaillé incluant matérialité et lumière.
      - Injectez systématiquement 'atmosphericFX' et 'cameraElevation'.
      - Identifiez les personnages via @Handle.
    `
  }

  public static buildImagePrompt(
    scene: any,
    seriesContext: SeriesContext
  ): {
    prompt: string
    referenceImages: any[]
    characterSheets: any[]
    reuseReferenceImage: boolean
    shotDirective?: string
    cameraDirective?: string
  } {
    const characterRegistry = seriesContext.characterRegistry || {}
    const assetRegistry = seriesContext.assetRegistry || {}
    const locationRegistry = seriesContext.locationRegistry || {}

    // 1. Identify characters and assets in scene
    const characterMatches: string[] = []
    const characterSearchText =
      `${scene.imagePrompt || ''} ${scene.summary || ''} ${scene.narration || ''} ${scene.charactersInScene?.join(' ') || ''}`.toLowerCase()

    for (const name of Object.keys(characterRegistry)) {
      if (characterSearchText.includes(name.toLowerCase())) {
        characterMatches.push(name)
      }
    }

    // 2. Resolve Environment & Continuity
    let locationMasterUrl: string | undefined
    if (scene.locationId) {
      const locKey = Object.keys(locationRegistry).find(
        (k) =>
          k.toLowerCase() === scene.locationId.toLowerCase() || `@${k.toLowerCase()}` === scene.locationId.toLowerCase()
      )
      const loc = locKey ? locationRegistry[locKey] : undefined
      if (loc?.thumbnailUrl) {
        locationMasterUrl = loc.thumbnailUrl
      }
    }

    const referenceImageUrl = scene.sequelBridgeUrl || scene.previousImageUrl || locationMasterUrl

    // ─── 3. Built-in Cinematic Hardening (V60) ──────────────────────────────────
    let paragraph = scene.imagePrompt || scene.summary || ''

    // ALS Injection
    const comp = scene.composition || {}
    if (comp.lightingDescription) {
      paragraph = `LIGHTING: ${comp.lightingDescription}. ${paragraph}`
    } else if (seriesContext.timeOfDay) {
      paragraph = `Atmosphere: ${seriesContext.timeOfDay} light. ${paragraph}`
    }

    if (scene.atmosphericFX) {
      paragraph = `ATMOSPHERIC FX: ${scene.atmosphericFX}. ${paragraph}`
    }

    // Framing & Shot Type
    const shotMap: Record<string, string> = {
      CLOSEUP: 'CLOSE-UP SHOT: Cinematic focus on head and shoulders. Depth of field.',
      EXTREME_CLOSEUP: 'EXTREME CLOSE-UP (ECU): Macro cinematic focus on a specific detail. High texture visibility.',
      MEDIUM: 'MEDIUM SHOT: Character from waist up. Cinematic composition.',
      WIDE: 'WIDE SHOT: Full body and environment. Establish scale.',
      ESTABLISHING: 'ESTABLISHING SHOT: Aerial view. Grand scale.',
      POV: 'POV SHOT: Subjective perspective.',
      OVERSHOULDER: 'OVER-THE-SHOULDER SHOT: Narrative focus over shoulder.',
      LOW_ANGLE: 'LOW-ANGLE SHOT: Camera looking up.',
      HIGH_ANGLE: 'HIGH-ANGLE SHOT: Camera looking down.'
    }
    const shotDirective = shotMap[comp.shotType] || shotMap.MEDIUM
    const elevation = comp.cameraElevation ? `CAMERA ELEVATION: ${comp.cameraElevation}.` : ''

    paragraph = `${shotDirective} ${elevation} ${paragraph}`

    // ─── 4. Reference Images & Sheets ───────────────────────────────────────────
    const referenceImages: any[] = []
    const characterSheets: any[] = []

    if (referenceImageUrl) {
      referenceImages.push(referenceImageUrl)
    }

    for (const name of characterMatches) {
      const char = characterRegistry[name]
      if (char) {
        if (char.thumbnailUrl) referenceImages.push({ name, data: char.thumbnailUrl })
        characterSheets.push({
          name: name.replace(/^@/, ''),
          appearance: { description: char.description || '' },
          role: char.role || ''
        })
      }
    }

    return {
      prompt: paragraph,
      referenceImages,
      characterSheets,
      reuseReferenceImage: !!scene.sequelBridgeUrl,
      shotDirective,
      cameraDirective: comp.cameraAction ? JSON.stringify(comp.cameraAction) : undefined
    }
  }
}
