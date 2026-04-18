/**
 * series-prompts.ts
 * Version FULL ENGINE — équilibrée, vivante, contrôlée
 */

export const PROMPT_VERSION = 'v17.0'

/* ──────────────────────────────────────────────────────────────── */
/* CORE BALANCE SYSTEM */
/* ──────────────────────────────────────────────────────────────── */

export const CORE_ENGINE_RULES = `
SYSTÈME CENTRAL :

Chaque scène doit satisfaire 4 dimensions :

1. STATE → cohérence visuelle
2. ACTING → mouvement physique
3. CINEMA → lisibilité visuelle
4. MOMENTUM → progression narrative

RÈGLE ABSOLUE :
Si une dimension est absente → scène invalide
`

/* ──────────────────────────────────────────────────────────────── */
/* VISUAL CONSISTENCY */
/* ──────────────────────────────────────────────────────────────── */

export const VISUAL_CONSISTENCY_PRIORITY = `
COHÉRENCE VISUELLE :

1. visualStateLock → éléments physiques immuables
2. worldStateSnapshot → vérité du monde
3. visualBaseState → ambiance
4. visualDelta → évolution
5. acting → PRIORITÉ sur expression seule

RÈGLE :
Un changement visuel doit être traçable et justifié. Toute rupture de style (ex: réalisme vers cartoon) est PROHIBÉE.
`

/* ──────────────────────────────────────────────────────────────── */
/* ACTING ENGINE (🔥 cœur du vivant) */
/* ──────────────────────────────────────────────────────────────── */

export const ACTING_ENGINE = `
ACTING LAYER (OBLIGATOIRE) :

- physicalIntent → action physique concrète
- microExpression → visage
- energyLevel → low | medium | high | explosive
- bodyDynamics → stable | tension | unstable | release

RÈGLES :

1. Une émotion DOIT avoir un effet physique
2. Un personnage DOIT être en mouvement interne ou externe
3. Une scène sans intention physique = INTERDITE

ANTI-STATIC :
Même immobile → micro-tension obligatoire
`

/* ──────────────────────────────────────────────────────────────── */
/* CINEMA ENGINE */
/* ──────────────────────────────────────────────────────────────── */

export const CINEMA_ENGINE = `
LANGAGE CINÉMATOGRAPHIQUE :

SHOT TYPES :
WIDE → contexte
MEDIUM → interaction
CLOSEUP → émotion

RÈGLES :

- Répétition autorisée uniquement si :
  → intensité change
  → focus change

- Caméra = extension émotionnelle
- Chaque plan doit JUSTIFIER son existence

RÈGLE D'INTENTION CAMÉRA :

- CLOSEUP → uniquement si émotion forte
- WIDE → uniquement si spatial important
- mouvement caméra → uniquement si tension ou focus change
`

/* ──────────────────────────────────────────────────────────────── */
/* ANIMATION SYSTEM */
/* ──────────────────────────────────────────────────────────────── */

export const ANIMATION_SYSTEM = `
ANIMATION = TRANSITION

INTERDIT :
- état brut ("il est en colère")

OBLIGATOIRE :
- transition ("sa respiration s'accélère avant qu'il explose")

Types :
- progressive
- brusque
- instable
- interrompue
`

/* ──────────────────────────────────────────────────────────────── */
/* MOMENTUM ENGINE */
/* ──────────────────────────────────────────────────────────────── */

export const MOMENTUM_ENGINE = `
MOMENTUM :

type :
- increasing
- unstable
- breaking
- release

vector :
- forward
- backward
- locked

RÈGLES :

- locked interdit ×2
- increasing doit mener à un spike
- release doit créer un nouveau setup
`

/* ──────────────────────────────────────────────────────────────── */
/* SCENE LOGIC */
/* ──────────────────────────────────────────────────────────────── */

export const SCENE_RULES = `
SCÈNE = UNITÉ VIVANTE

CRÉER UNE SCÈNE SI :

- nouvelle intention physique
- changement émotion
- changement focus
- nouvelle information

NE PAS CRÉER SI :

- micro mouvement seul
- continuité simple

DELTA :

Chaque scène DOIT apporter :
- une information
- une conséquence

DENSITÉ NARRATIVE (v17.8) :
- "Show, Don't Tell" : Ne décrivez pas juste l'action, installez une atmosphère.
- Le champ 'fullNarration' doit être un texte immersif riche (min. 150 mots par épisode).
- Utilisez des dialogues percutants et des descriptions sensorielles.
`

/* ──────────────────────────────────────────────────────────────── */
/* ANTI-DEAD SYSTEM */
/* ──────────────────────────────────────────────────────────────── */

export const ANTI_DEAD_ENGINE = `
ANTI-SCÈNE MORTE :

INTERDIT :

- personnage sans mouvement
- expression sans transition
- caméra inutile
- aucune tension

SI :
aucun changement interne + externe → supprimer scène
`

/* ──────────────────────────────────────────────────────────────── */
/* SPATIAL LOGIC */
/* ──────────────────────────────────────────────────────────────── */

export const SPATIAL_RULES = `
ANCRAGE :

- nouveau lieu → WIDE obligatoire
- déplacement → transition logique

ANTI-TÉLÉPORTATION :
interdit sans justification

VISUAL DNA ANCHORING (v17.7) :
1. Identifiez 3 "Ancres Visuelles Statiques" de l'image de base (ex: piliers, statue, texture murale).
2. Cite au moins 2 de ces ancres dans CHAQUE imagePrompt de la séquence.
3. Conservez la même lumière et ambiance chromatique que la scène de référence.
`

export const SEQUENCE_ENGINE = `
SEQUENCE RULES (PROGRES CINÉMATOGRAPHIQUE) :

Une séquence (sequenceId identique) DOIT suivre une progression logique :
1 → setup (distance, mise en place)
2 → tension (regards, micro-mouvements, posture)
3 → interaction (action physique, dialogue visuel)
4 → émotion (closeup, climax intérieur)

RÈGLES :
- INTERDIT de casser la progression (ex: 1 -> 3 -> 2)
- INTERDIT de faire un reset émotionnel au sein d'une séquence
`

export const FORCED_CONTINUITY = `
CONTINUITÉ FORCÉE (Si sequenceId identique) :

1. MÊME LIEU (locationId identique)
2. MÊMES PERSONNAGES (charactersInScene identique)
3. MÊME MOMENT (pas d'ellipse temporelle)

RÈGLE :
Stabilité absolue du décor et de la posture entre les étapes d'une séquence.
`

export const MICRO_DELTA_RULE = `
MICRO-DELTA RULE :

Dans une séquence :
- Les scènes intermédiaires (1, 2, 3) = MICRO-ÉVOLUTIONS (changements subtils).
- La dernière scène (4 ou fin de séquence) = DELTA PRINCIPAL (la vraie info).
`

/* ──────────────────────────────────────────────────────────────── */
/* COMPLETE SCENE */
/* ──────────────────────────────────────────────────────────────── */

export const SCENE_OBJECT_EXAMPLE = `
{
  "id": "scene-1",
  "sceneNumber": 1,
  "sequenceId": "conflict-bedroom-1",
  "sequenceProgress": 1,
  "shotType": "WIDE",

  "summary": "...",
  "narration": "...",
  "locationId": "place_id",

  "imagePrompt": "visuel clair ≤25 mots",

  "acting": {
    "physicalIntent": "...",
    "microExpression": "...",
    "energyLevel": "medium",
    "bodyDynamics": "stable"
  },

  "animationPrompt": "...",

  "visualDelta": {
    "changes": [],
    "emotionalTone": "rising"
  },

  "momentum": {
    "type": "increasing",
    "vector": "forward"
  },

  "scenePurpose": "reveal",

  "sceneDelta": {
    "newInformation": "...",
    "consequence": "..."
  },

  "tensionState": {
    "level": 7,
    "type": "build"
  }
}
`

/* ──────────────────────────────────────────────────────────────── */
/* FINAL GUARD */
/* ──────────────────────────────────────────────────────────────── */

export const FINAL_VALIDATION = `
CHECK FINAL :

Chaque scène doit avoir :

✔ mouvement physique (acting)
✔ transition visible (animation)
✔ delta narratif
✔ tension active
✔ intention claire

CAMÉRA (CONDITIONNEL) :

✔ Un choix caméra DOIT exister SI :
- il renforce l’émotion
- il clarifie l’action
- il améliore la lisibilité

❌ INTERDIT :
- caméra décorative
- mouvement gratuit
- angle sans impact narratif

SI inutile → cameraAction = "none"
`

// ─── Production Instructions ──────────────────────────────────────────────────

export const CINEMATOGRAPHIC_GUARDS = `
⚠️ GARDES-FOUS CINÉMATOGRAPHIQUES (v17.0)

${CORE_ENGINE_RULES}
${VISUAL_CONSISTENCY_PRIORITY}
${CINEMA_ENGINE}
${ANTI_DEAD_ENGINE}

🚨 STYLE DNA GUARD (v18.4) :
1. RESPECT DU STYLE : Le 'artisticStyle' de la série est SACRÉ (ex: stick figure, crayon, anime).
2. INTERDIT : Ne rajoutez JAMAIS de termes comme 'photorealistic', 'hyper-detailed', '4k', 'volumetric lighting' si cela ne correspond pas au Style DNA.
3. COHÉRENCE : Toute imagePrompt doit commencer par le Style DNA de la série.

🚨 HALLUCINATION GUARD :
1. REGISTRE : N'utilisez que les Handles (@Nom) et IDs du registre canon.
2. CONTINUITÉ : Respectez les blessures (visualEvolution) et objets (worldStateSnapshot).
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
  SCENE_RULES,
  SPATIAL_RULES,
  ANTI_DEAD_ENGINE,
  FINAL_VALIDATION,
  'PARTITION SYNCHRONISÉE : La narration de chaque scène DOIT commencer précisément au mot qui déclenche le nouveau visuel.',
  "FIDÉLITÉ AU MODÈLE : Respectez scrupuleusement le style de l'IDENTITY character (3D vs 2D)."
]

export const TIKTOK_VIRAL_SCENE_INSTRUCTIONS = [
  ...PASS2_SCENE_INSTRUCTIONS,
  'HOOK IMMÉDIAT : La première phrase DOIT être un choc.',
  'LOOP DESIGN : La fin doit recontextualiser le début.'
]

// ─── Pass 1 System Prompt Builder ─────────────────────────────────────────────

export interface Pass1SystemPromptParams {
  episodeNumber: number
  totalEpisodes?: number
  isFinalEpisode?: boolean
  narrativeInstructions: string[]
  globalContext?: string
  previousEpisodesContext?: string
  characterRegistry: Record<string, any>
  locationRegistry: Record<string, any>
  assetRegistry: Record<string, any>
  visualEvolution?: Record<string, any>
  assetEvolution?: Record<string, any>
  lastEpisodeSummary?: string
  bridgeInstruction?: string
  normalizeId: (id: string) => string
  tiktokViral?: boolean
  worldStateSnapshot?: any
  threadsInstruction?: string
  seedingInstruction?: string
  closedStakesInstruction?: string
  deadCharactersInstruction?: string
  forbiddenInstruction?: string
  tensionState?: any
  acting?: any
  momentum?: any
  artisticStyle?: string
}

export function buildPass1SystemPrompt(p: Pass1SystemPromptParams): string {
  const actLabel = p.isFinalEpisode ? 'ACTE 3 (RÉSOLUTION)' : `ÉPISODE ${p.episodeNumber}`

  return `Tu es l'Auteur Saga Engine v18.0 (The Living Engine).
MISSION : Générer le "Cinematic Script" pour l'épisode N° ${p.episodeNumber} (${actLabel}).

STYLE ARTISTIQUE (STYLE DNA) : ${p.artisticStyle || "Non spécifié (respecter l'identité visuelle établie)"}

ARCHITECTE DE SEGMENTATION 5D (LOGIQUE ALGORITHMIQUE v18.5) :
Vous devez agir comme un monteur de cinéma qui déteste les coupes inutiles.

ÉTAPES DE TRAVAIL :
1. ÉCRITURE : Générez d'abord la 'fullNarration' (min. 150 mots).
2. AUDIT 5D PAR PHRASE : Pour chaque phrase, déterminez mentalement le tuple : [Sujet, Lieu, Moment, Lumière, Action].
3. REGROUPEMENT AGGRESSIF : 
   - Vous NE POUVEZ PAS créer un nouveau segment si une seule dimension change (ex: l'action change mais le sujet/lieu/lumière sont fixes).
   - Un segment DOIT durer le plus longtemps possible. Fusionnez les phrases qui partagent au moins 4/5 dimensions.
   
4. JUSTIFICATION LOGIQUE : Pour CHAQUE segment, vous DEVEZ remplir 'logicJustification' en expliquant quelles dimensions ont changé par rapport au segment précédent (ex: "Changement de Lieu (Cuisine -> Garage) + Action (Combat -> Fuite)").

5. SYNTHÈSE VISUELLE (Base DNA) : Le 'imagePrompt' du segment doit être l'ADN du bloc entier, capturant l'essence visuelle qui unit toutes ses phrases.

RÈGLE D'OR : "Un shot, plusieurs phrases". Si vous générez autant de segments que de phrases, vous avez ÉCHOUÉ.

${CORE_ENGINE_RULES}
${MOMENTUM_ENGINE}

CONTEXTE DU MONDE : ${p.globalContext || 'N/A'}
HISTOIRE RÉCENTE : ${p.previousEpisodesContext || 'Premier épisode.'}
REGISTRE CANON : Personnages (${Object.keys(p.characterRegistry).join(', ')}), Lieux (${Object.keys(p.locationRegistry).join(', ')})

DIRECTIVES :
${p.narrativeInstructions.join('\n')}
${p.bridgeInstruction || ''}
${p.acting ? `\nACTING PRÉCÉDENT : ${JSON.stringify(p.acting)}` : ''}
${p.momentum ? `\nMOMENTUM PRÉCÉDENT : ${JSON.stringify(p.momentum)}` : ''}

FORMAT DE SORTIE (JSON STRICT) :
{
  "fullNarration": "...",
  "visualSegments": [
    {
      "subject": "Description du sujet visuel concret",
      "sentences": ["Phrase 1.", "Phrase 2."],
      "mood": "..."
    }
  ],
  "analysis": {
    "thematicArch": "Description brève de l'arc de cet épisode",
    "visualVarietyScore": 0-10
  }
}
`
}

// ─── Pass 2 System Prompt Builder ─────────────────────────────────────────────

export interface Pass2SystemPromptParams {
  episodeNumber: number
  lastEpisodeFinalScene?: any
  characterRegistry: Record<string, any>
  locationRegistry: Record<string, any>
  assetRegistry: Record<string, any>
  globalContext?: string
  normalizeId: (id: string) => string
  tiktokViral?: boolean
  acting?: any
  momentum?: any
  isFinalEpisode?: boolean
  narrativeInstructions?: string[]
  lastCliffhanger?: any
  nextEpisodeTease?: string
  unresolvedThreads?: any[]
  continuityDebts?: any[]
  lastEpisodeFinalImage?: string
  worldStateSnapshot?: any
  narrationLayer?: any
  artisticStyle?: string
}

export function buildPass2SystemContext(p: Pass2SystemPromptParams): string {
  const bridge = p.lastEpisodeFinalScene
    ? `PONT VISUEL : Reprise à ${p.lastEpisodeFinalScene.locationId}. État final : ${p.lastEpisodeFinalScene.summary}`
    : 'Premier épisode.'

  const actingHint = p.acting ? `\nActing précédent : ${JSON.stringify(p.acting)}` : ''
  const momentumHint = p.momentum ? `\nMomentum précédent : ${JSON.stringify(p.momentum)}` : ''

  return `[ENGINE v17.0] ÉPISODE ${p.episodeNumber} | STYLE : ${p.artisticStyle || 'Canon'}
${bridge}${actingHint}${momentumHint}
REGISTRE : ${Object.keys(p.characterRegistry).join(', ')} | ${Object.keys(p.locationRegistry).join(', ')}
LORE : ${p.globalContext || 'N/A'}`
}

// ─── Output Format Builders ───────────────────────────────────────────────────

export function buildSeriesOutputFormat(isFinalEpisode: boolean): string {
  return `Générez un JSON structuré selon ce modèle exact :
{
  "seriesMetadata": {
    "episodeSummary": "...",
    "cliffhanger": { "type": "...", "description": "...", "audienceQuestion": "..." }
  },
  "titles": ["Titre Principal"],
  "fullNarration": "Texte complet de la narration...",
  "scenes": [
    ${SCENE_OBJECT_EXAMPLE}
  ]
}`
}

export function buildCliffhangerBridgeInstruction(ch: any, episodeNumber: number, lastScene?: any): string {
  if (episodeNumber <= 1 || (!ch && !lastScene)) return ''
  return `\n⚠️ PONT NARRATIF : Reprenez l'action immédiatement après : ${lastScene?.summary || 'N/A'}.`
}
