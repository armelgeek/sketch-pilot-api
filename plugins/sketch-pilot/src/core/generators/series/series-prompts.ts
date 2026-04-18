/**
 * series-prompts.ts
 * Version FULL ENGINE (4-Pass Pipeline) - v19.0
 */

export const PROMPT_VERSION = 'v19.0'

/* ──────────────────────────────────────────────────────────────── */
/* CORE BALANCE SYSTEM */
/* ──────────────────────────────────────────────────────────────── */

export const CORE_ENGINE_RULES = `
SYSTÈME CENTRAL :

Chaque scène doit satisfaire 4 dimensions :

1. STATE - cohérence visuelle
2. ACTING - mouvement physique
3. CINEMA - lisibilité visuelle
4. MOMENTUM - progression narrative

RÈGLE ABSOLUE :
Si une dimension est absente -> scène invalide
`

export const VISUAL_DNA_INTEGRITY = `
VISUAL_DNA_INTEGRITY (STYLE CHAMELEON) :
1. MIMÉTISME STRICT : Analysez le Thumbnail (Identity) ou le Base Anchor. Votre style DOIT copier exactement son niveau de complexité (épaisseur du trait, type de hachures, absence de réalisme).
2. ANTI-HALLUCINATION DÉTAILLÉE : Si la référence est simple (ex: aplats, traits), INTERDICTION de rajouter des ombres réalistes, des textures de peau, ou du volume 3D.
3. FIDÉLITÉ TECHNIQUE : Si la référence est un sketch, restez sur du "hand-drawn line-art". Si c'est du pixel-art, restez en pixels. Ne "shippez" jamais un style plus complexe que la référence.
4. COHÉRENCE : Toute déviation vers le "photoréalisme" ou le "CGI" sans instruction explicite est une anomalie critique.
`

export const VISUAL_CONSISTENCY_PRIORITY = `
COHÉRENCE VISUELLE :

1. visualStateLock - éléments physiques immuables
2. worldStateSnapshot - vérité du monde
3. visualBaseState - ambiance
4. visualDelta - évolution
5. acting - PRIORITÉ sur expression seule

RÈGLE :
Un changement visuel doit être traçable et justifié. Toute rupture de style est PROHIBÉE.
`

/* ──────────────────────────────────────────────────────────────── */
/* ACTING ENGINE */
/* ──────────────────────────────────────────────────────────────── */

export const ACTING_ENGINE = `
ACTING LAYER (OBLIGATOIRE) :

- physicalIntent - action physique concrète
- microExpression - visage
- energyLevel - low | medium | high | explosive
- bodyDynamics - stable | tension | unstable | release

RÈGLES :
1. Une émotion DOIT avoir un effet physique
2. Un personnage DOIT être en mouvement interne ou externe
3. Une scène sans intention physique = INTERDITE
`

/* ──────────────────────────────────────────────────────────────── */
/* CINEMA ENGINE */
/* ──────────────────────────────────────────────────────────────── */

export const CINEMA_ENGINE = `
LANGAGE CINÉMATOGRAPHIQUE :

SHOT TYPES :
WIDE | MEDIUM | CLOSEUP | POV | OVER_THE_SHOULDER | LOW_ANGLE | HIGH_ANGLE | BIRD_EYE

RÈGLES :
- VARIATION RADICALE : Si vous restez dans le même lieu sur plusieurs scènes, variez l'angle et le type de plan d chaque coupe.
- MAPPING STRICT :
  "Plan Large" => shotType: "WIDE"
  "Plan Serré" => shotType: "CLOSEUP"
  "Détail / Action" => shotType: "MEDIUM"
`

/* ──────────────────────────────────────────────────────────────── */
/* ANIMATION SYSTEM */
/* ──────────────────────────────────────────────────────────────── */

export const ANIMATION_SYSTEM = `
ANIMATION = TRANSITION

INTERDIT : État brut ("il est en colère")
OBLIGATOIRE : Transition ("sa respiration s'accélère...")

Types : progressive, brusque, instable, interrompue
`

/* ──────────────────────────────────────────────────────────────── */
/* MOMENTUM ENGINE */
/* ──────────────────────────────────────────────────────────────── */

export const MOMENTUM_ENGINE = `
LOGIQUE DE SÉQUENCE ATOMIQUE (v19.0) :
Chaque atome (frame) DOIT avoir un rôle précis :
- HOOK : Tension maximale, accroche visuelle.
- BUILD : Progression, détail, crescendo.
- PIVOT : Rupture, basculement.
- REVEAL : Impact visuel majeur, information clé.
- CLOSE : Finalisation de l'arc court.

LOGIQUE CAUSALE : Irréversibilité, pas de répétition, écoulement linéaire.

RÈGLES DE DENSITÉ (ANTI-FRAGMENTATION) :
- UNE SCÈNE = UN ARC D'ACTION COMPLET (~5-8 SECONDES).
- INTERDICTION de créer des micro-scènes (moins de 4s) pour des détails triviaux.
- FUSIONNEZ les actions liées dans une seule frame riche si elles se passent dans le même lieu au même moment.
- PRIVILÉGIEZ la qualité émotionnelle et la clarté visuelle sur le nombre de coupes.
`

/* ──────────────────────────────────────────────────────────────── */
/* SPATIAL LOGIC */
/* ──────────────────────────────────────────────────────────────── */

export const SPATIAL_RULES = `
ANCRAGE :
- nouveau lieu -> WIDE obligatoire
- déplacement -> transition logique

ANTI-TÉLÉPORTATION : interdit sans justification
`

export const SEQUENCE_ENGINE = `
SEQUENCE RULES (PROGRES CINEMATOGRAPHIQUE) :
1 - setup
2 - tension
3 - interaction
4 - emotion
`

export const FORCED_CONTINUITY = `
CONTINUITÉ FORCÉE (Si sequenceId identique) :
1. MÊME LIEU
2. MÊMES PERSONNAGES
3. MÊME MOMENT
`

export const MICRO_DELTA_RULE = `
MICRO-DELTA RULE :
Dans une séquence, variez le POINT DE VUE à chaque scène même si l'action est continue.
`

/* ──────────────────────────────────────────────────────────────── */
/* COMPLETE SCENE */
/* ──────────────────────────────────────────────────────────────── */

export const SCENE_OBJECT_EXAMPLE = `
{
  "id": "scene-1",
  "sceneNumber": 1,
  "camIdx": 0,
  "atomType": "hook | build | pivot | reveal | close",
  "narration": "...",
  "locationId": "snake_case_id (SANS @)",
  "imagePrompt": "Description visuelle riche (40-60 mots). SANS JSON INTERNE.",
  "ffDesc": "Instantané statique de la PREMIÈRE image (FF). Composition, posture fixe, décor immuable.",
  "lfDesc": "Instantané statique de la DERNIÈRE image (LF). État final après le mouvement.",
  "motionDesc": "Description du mouvement entre FF et LF (caméra et sujets).",
  "charactersInScene": ["@Handle"],
  "pacingHint": "lent | rapide | crescendo",
  "sceneDelta": "Information nouvelle cruciale apprise dans cette scène",
  "scenePurpose": "Intention narrative technique (ex: build suspense)",
  "tensionState": { "level": 7, "type": "build | sustain | spike | release" },
  "visualDelta": {
    "currentPosition": "Précision spatiale actuelle (ex: Face au miroir)",
    "currentAction": "Action dominante visible (ex: Essuie une larme)",
    "mutationLevel": "NONE | LOW | MEDIUM | HIGH",
    "framing": "WIDE | MEDIUM | CLOSEUP | POV | ...",
    "sceneIntent": "STATIC | ACTION | REVEAL | TRANSITION | EMOTIONAL_BEAT",
    "framingContinuity": true,
    "changes": ["Détail qui change (ex: La porte s'ouvre)"]
  },
  "visualBaseState": { "lighting": "...", "atmosphere": "..." },
  "visualStateLock": { "mustPersist": ["..."], "forbiddenChanges": ["..."] },
  "logicJustification": "..."
}
`

/* ──────────────────────────────────────────────────────────────── */
/* FINAL GUARD */
/* ──────────────────────────────────────────────────────────────── */

export const FINAL_VALIDATION = `
CHECK FINAL :
mouvement physique, transition visible, delta narratif, tension active.

🚨 GARDE-FOU DE CONTRASTE VISUEL :
INTERDICTION de générer deux scènes avec le même "imagePrompt" ou la même composition.
Chaque coupe DOIT apporter une nouvelle information visuelle (changement de cadrage, nouvelle action, nouveau POV).
`

export const TECHNICAL_GUARD = `
INTERDICTIONS ABSOLUES :
1. PAS DE JSON DANS imagePrompt : Ne mettez JAMAIS d'objets ou de "Mouvement : {...}" dans le texte.
2. PAS DE @ POUR LES LIEUX : Utilisez "bureau" et non "@bureau" pour locationId.
3. ANTI-REALISM GUARD : Toute mention de 'réaliste', 'cinématique 3D' ou 'photo' entraînera une invalidation de la scène.
`

export const CINEMATOGRAPHIC_GUARDS = `
GARDES-FOUS CINÉMATOGRAPHIQUES
${CORE_ENGINE_RULES}
${VISUAL_CONSISTENCY_PRIORITY}
${CINEMA_ENGINE}
${TECHNICAL_GUARD}

⚠️ ANTI-RÉALISME (DÉTECTION STRYCTE) :
- Si les personnages sont décrits comme des "stick figures" ou "sketch" : INTERDICTION de dessiner des visages réalistes, des muscles détaillés ou des vêtements texturés. 
- Restez fidèle à la ligne (line-art). 
- Utilisez du "pencil hatching" pour les ombres.
- Fond blanc ou texture papier uniquement.
`

export const PASS2_SCENE_INSTRUCTIONS = [
  CORE_ENGINE_RULES,
  SEQUENCE_ENGINE,
  FORCED_CONTINUITY,
  MICRO_DELTA_RULE,
  ACTING_ENGINE,
  CINEMA_ENGINE,
  ANIMATION_SYSTEM,
  MOMENTUM_ENGINE,
  FINAL_VALIDATION,
  '🚨 RÈGLE DE CONTRASTE : Si vous avez 4 scènes pour 30s, chaque scène doit être VISUELLEMENT DISTINCTE. Ne répétez pas un plan identique.'
]

export const TIKTOK_VIRAL_SCENE_INSTRUCTIONS = [
  ...PASS2_SCENE_INSTRUCTIONS,
  'HOOK IMMÉDIAT : La première phrase DOIT être un choc.',
  'LOOP DESIGN : La fin doit recontextualiser le début.'
]

// ─── Pass 0: Global Series Arc (THE STRATEGIST) ──────────────────────────────

export interface Pass0Params {
  seriesTopic: string
  episodeCount: number
  characterRegistry: Record<string, any>
  locationRegistry: Record<string, any>
  globalContext?: string
}

export function buildPass0SystemPrompt(p: Pass0Params): string {
  return `Tu es le Grand Architecte SAGA (THE LIVING ENGINE v19.0).
MISSION : Concevoir un arc narratif global pour une série de ${p.episodeCount} épisodes.

VOTRE RÔLE :
- Planifier la trajectoire de la tension.
- Définir les "Promesses" (mystères à résoudre) et leur point de résolution.
- Assurer que chaque épisode a un conflit unique mais lié à l'arc global.

REGISTRE CANON :
Personnages : ${Object.keys(p.characterRegistry).join(', ')}
Lieux : ${Object.keys(p.locationRegistry).join(', ')}

FORMAT DE SORTIE (JSON STRICT) :
{
  "seriesTitle": "...",
  "globalSynopsis": "...",
  "episodes": [
    {
      "episodeNumber": 1,
      "mainConflict": "...",
      "keyPlotPoint": "...",
      "cliffhangerIntent": "..."
    }
  ],
  "unresolvedThreads": ["..."]
}
`
}

// ─── Pass 1: Episode Planning (THE ARCHITECT) ──────────────────────────────

export interface Pass1Params {
  episodeNumber: number
  seriesArc: string
  lastEpisodeSummary?: string
  characterRegistry: Record<string, any>
  locationRegistry: Record<string, any>
}

export function buildPass1EpisodePlanPrompt(p: Pass1Params): string {
  return `Tu es l'Architecte Épisode (THE LIVING ENGINE v19.0).
MISSION : Découper l'épisode N° ${p.episodeNumber} en sections structurelles.

CONTEXTE DE L'ARC GLOBAL :
${p.seriesArc}

RÈGLES :
- Chaque section doit avoir une "Intention Narrative" claire.
- Prévoir l'ancrage du cliffhanger.

FORMAT DE SORTIE (JSON STRICT) :
{
  "episodeNumber": ${p.episodeNumber},
  "title": "...",
  "sections": [
    {
      "title": "...",
      "intent": "...",
      "estimatedAtoms": 3
    }
  ],
  "cliffhangerIntent": "..."
}
`
}

// ─── Pass 2: Atomic Sequence (THE WRITER) ──────────────────────────────────

export interface Pass2Params {
  episodeNumber: number
  episodePlan: string
  seriesArc?: string
  lastEpisodeSummary?: string
  characterRegistry: Record<string, any>
  locationRegistry: Record<string, any>
  artisticStyle?: string
}

export function buildPass2SystemPrompt(p: Pass2Params): string {
  return `Tu es l'Écrivain Atomique (THE LIVING ENGINE v19.0).
MISSION : Transformer le plan de l'épisode en une suite d'atomes narratifs.

PLAN DE L'ÉPISODE :
${p.episodePlan}

ARC GLOBAL :
${p.seriesArc || 'N/A'}

STYLE DNA : ${p.artisticStyle || 'Canon'}
${VISUAL_DNA_INTEGRITY}

RÈGLE D'OR :
Chaque frame doit être une unité d'action pure et significative (5s-10s).
⚠️ ANTI-FRAGMENTATION : Ne multipliez pas les scènes inutilement. Pour 30s, visez 3 à 5 scènes maximum.

FORMAT DE SORTIE (JSON STRICT) :
{
  "atomicFrames": [
    {
      "sceneNumber": 1,
      "atomType": "hook",
      "narration": "...",
      "locationId": "place_id",
      "characters": ["@Nom"],
      "visualPrompt": "..."
    }
  ]
}
`
}

// ─── Pass 3: Visual Enrichment (THE DIRECTOR) ──────────────────────────────

export interface Pass3Params {
  episodeNumber: number
  characterRegistry: Record<string, any>
  locationRegistry: Record<string, any>
  artisticStyle?: string
}

export function buildPass3SystemPrompt(p: Pass3Params): string {
  return `Tu es le Réalisateur Visuel (THE LIVING ENGINE v19.0).
MISSION : Transformer les atomes narratifs en scènes cinématographiques riches.

DIRECTIVES TECHNIQUES VIMAX :
1. DENSITÉ VISUELLE : Chaque imagePrompt doit être une peinture technique (40-60 mots).
2. CAMERA TREE : Assignez un camIdx à chaque scène. Réutilisez le MÊME camIdx si vous revenez à une position de caméra déjà établie dans l'épisode.
3. FF/LF CONTINUITY : Décomposez chaque scène en ffDesc (Snaphot début), lfDesc (Snapshot fin) et motionDesc.
4. ACTING DYNAMIQUE : Précisez physicalIntent et microExpression.
5. MOMENTUM : Définissez le vecteur de progression.
6. NARRATIVE DELTA : Identifiez l'information cruciale et sa conséquence.

${VISUAL_DNA_INTEGRITY}
${CINEMATOGRAPHIC_GUARDS}

FORMAT DE SORTIE (JSON STRICT) :
{
  "seriesMetadata": { 
    "episodeSummary": "...", 
    "newCharacters": { "@Handle": "Description" }, 
    "newLocations": { "location_id": "Description" } 
  },
  "titles": ["Titre de l'épisode"],
  "scenes": [ ${SCENE_OBJECT_EXAMPLE} ]
}

IMPORTANT: Le champ 'tensionState.type' DOIT être l'un des suivants : build, sustain, spike, release.`
}

// ─── Helper Builders ──────────────────────────────────────────────────────────

export function buildSeriesOutputFormat(isFinalEpisode: boolean): string {
  return `JSON structuré :
{
  "seriesMetadata": { "episodeSummary": "...", "cliffhanger": { ... } },
  "titles": ["Saga Title"],
  "scenes": [ ${SCENE_OBJECT_EXAMPLE} ]
}`
}

export function buildCliffhangerBridgeInstruction(ch: any, episodeNumber: number, lastScene?: any): string {
  if (episodeNumber <= 1 || (!ch && !lastScene)) return ''
  return `\n⚠️ PONT NARRATIF : Reprenez l'action immédiatement après : ${lastScene?.summary || 'N/A'}.`
}
