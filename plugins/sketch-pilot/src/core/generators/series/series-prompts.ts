/**
 * series-prompts.ts
 *
 * All LLM prompt templates extracted from SeriesVideoGenerator.
 * Edit narrative rules here — never in the generator class itself.
 *
 * Versioning: bump PROMPT_VERSION on any structural change.
 */

export const PROMPT_VERSION = 'v15.0'

// ─── Visual Consistency Hierarchy ─────────────────────────────────────────────

export const VISUAL_CONSISTENCY_PRIORITY = `
🧠 GUIDAGE DE LA COHÉRENCE (DYNAMIQUE v12.0) :
1. visualStateLock = ANCRE DE CONTINUITÉ (Référence pour les détails clés, ex: 'écharpe rouge').
2. visualBaseState = BASE ATMOSPHÉRIQUE (Ton et lumière du décor).
3. visualDelta = ÉVOLUTION NARRATIVE (Mouvements, actions et changements d'états).
4. imagePrompt = VIE DE LA SÉQUENCE (Priorité à l'expression et au dynamisme).

🚀 RÈGLE DE FLUIDITÉ : Privilégiez le mouvement et l'évolution naturelle. La cohérence visuelle est un guide, pas une prison. Autorisez un drift créatif pour favoriser le dynamisme et la variété des plans.

🎭 RYTHME VISUEL ET VARIATION (ANTI-REDOUTANCE) :
- Si une séquence se déroule dans le MÊME lieu (@locationId), vous DEVEZ alterner les échelles de plan (shotType) à chaque scène.
- Enchaînement suggéré : WIDE (Établissement) -> MEDIUM (Action) -> CLOSEUP (Émotion/Réaction) -> MEDIUM.
- Évitez de répéter le même shotType deux fois de suite dans un contexte stable.
`

export const SCENE_CONSOLIDATION_RULES = `
📦 CONSOLIDATION DE SCÈNES (OPTIMISATION) :
1. NE créez PAS de nouvelle scène si le décor et les personnages restent les mêmes et que l'action est continue.
2. GROUPEZ la narration dans une scène plus longue (jusqu'à 40-50 mots) et utilisez des listes de 'cameraAction' pour créer du mouvement interne.
3. Ne déclenchez une NOUVELLE scène que si : 
   - Un personnage entre/sort.
   - La lumière/météo change radicalement.
   - Un saut temporel se produit.
   - L'angle de vue doit changer du tout au tout (nouvel ancrage).
`

export const NARRATIVE_BEAT_RULES = `
🏗️ NORMES DE NARRATION PAR BEATS (SEQUENCE-READY) :
1. 📖 BEAT NARRATIF : 1 bloc de texte = 1 unité dramatique cohérente (ex: un échange, une découverte).
2. 🎬 DÉCOMPOSITION VISUELLE : Chaque beat pourra être décomposé en PLUSIEURS scènes (coupes caméra) pour dynamiser le rendu.
3. 👁️ INTENTION VISUELLE : Décrivez l'action de façon à ce qu'elle suggère naturellement des changements d'angle (ex: "X parle, Y réagit avec effroi").
4. 🧱 DENSITÉ : Un beat peut faire 10 à 40 mots selon l'importance du moment. Plus le beat est riche émotionnellement, plus il mérite de découpages (shots).

Exemple de beat unique : 
"Alaric s'approche du trône avec hésitation. Il pose la main sur l'accoudoir froid. Soudain, les runes s'illuminent d'un bleu électrique."
-> Ce beat pourra générer 3 scènes : WIDE (approche), MEDIUM (la main), CLOSEUP (réaction/runes).
`

export const NARRATION_LAYER_RULES = `
🧠 COUCHE DE NARRATION (STRATÉGIE ET COHÉRENCE) :
Pour chaque épisode, vous DEVEZ générer un 'narrationLayer' qui sert de cerveau de cohérence.
Ce champ ne sera PAS lu à haute voix, il sert uniquement à piloter l'intelligence du récit.

🔥 SÉPARATION DES COUCHES (ARCHITECTURE v8.0) :
1. STORY LAYER (Cœur narratif) : 
   - 'scenePurpose' : Pourquoi cette scène existe (STRUCTURE : reveal, escalate, misdirect, stabilize, collapse).
   - 'sceneDelta' : Quelle est l'information NOUVELLE et sa conséquence (Information Delta Rule).
   - 'tensionState' : État émotionnel (DYNAMIQUE : build, sustain, spike, release).
2. VISUAL LAYER (Rendu) :
   - 'imagePrompt' : Description télégraphique de ce qu'on voit.
   - 'composition' : Cadrage et lumière.
   - 'animationPrompt' : Mouvements des sujets.
3. STATE LAYER (Vérité) :
   - 'worldStateSnapshot' : Inventaire absolu de l'état du monde.
   - 'visualStateLock' : Verrous physiques impératifs.

Champs requis dans 'narrationLayer' :
• psychologicalArc : Décrivez l'évolution mentale des personnages (ex: "Guillaume passe de la curiosité à une forme d'obsession").
• causalThread : La logique invisible qui lie les événements (ex: "Le parchemin réagit à la lignée de Guillaume").
• hiddenForce : Les puissances de l'ombre ou mémoires du lieu influençant la scène (ex: "Le lieu 'appelle' un sacrifice").

🚫 RÈGLES DE NON-REDONDANCE :
- La narration (narration) porte le SENS et l'EMOTION.
- La projection (projections.visualDescription) porte l'IMAGE brute.
- Ne dis pas ce qui est visible (ex: "Il pleut"). Parle de ce que la pluie représente pour le personnage.
`

// ─── Shared Output Format ─────────────────────────────────────────────────────

export const SCENE_OBJECT_EXAMPLE = `
{
  "id": "scene-1",
  "sceneNumber": 1,
  "shotType": "WIDE",
  "summary": "Résumé visuel",
  "narration": "Projection sémantique de l'histoire pour cette scène (ajustée pour le timing)...",
  "locationId": "identifiant-lieu-unique",
  "persistentDecorTokens": ["lampe de bureau rouge", "plante verte", "lumière de fin de journée"],
  "imagePrompt": "Description visuelle",
  "charactersInScene": ["@Sarah"],
  "isEstablishingShot": true,
  "spatialAnchor": "Sur la colline surplombant le village",
  "emotionalTokens": { "@Sarah": ["Terrifié", "Essoufflé"] },
  "interactions": { "@Sarah-@Marek": "Suspicion mutuelle" },
  "composition": {
    "shotType": "WIDE",
    "foregroundAnchor": "des branches d'arbres floues",
    "lightingMood": "crépuscule froid",
    "focusTarget": "@Sarah"
  },
  "visualEvolution": { "@Sarah": "Cicatrice au front" },
  "characterEvolution": { "@Sarah": { "state": "Blessé au bras", "status": "injured" } },
  "weatherState": "Pluie diluvienne",
  "timeOfDay": "Aube",
  "relationshipMap": { "@Sarah": { "@Alexandre": "Alliance", "@Marek": "Méfiance" } },
  "assetEvolution": { "Épée": "Brisée" },
  
  "visualDelta": {
    "changes": ["fumée sur la gauche", "voiture avancée"],
    "damages": ["traces d'impact sur le mur"],
    "positions": ["@Sarah plus proche de la caméra"],
    "cameraShift": "déplacement léger vers la droite",
    "emotionalTone": "tension accrue"
  },
  "worldStateSnapshot": {
    "location": "usine_abandonnée",
    "lighting": "néon bleu stable",
    "weather": "pluie constante",
    "activeProps": ["voiture brûlée", "porte cassée"],
    "lockedCharacters": {
      "@Sarah": { "injury": "main coupée", "clothing": "manteau rouge déchiré" }
    }
  },
  "visualBaseState": {
    "lighting": "néon bleu froid",
    "atmosphere": "brume industrielle",
    "persistentElements": ["pluie forte", "enseigne clignotante"]
  },
  "visualStateLock": {
    "mustPersist": ["écharpe rouge", "@Sarah blessure main"],
    "forbiddenChanges": ["pas de soleil"]
  },
  "frameAnchor": { "referenceSceneId": "scene-1", "similarityMode": "soft" },
  "animationPrompt": "Instructions de mouvement fluide...",
  "cameraAction": [{ "type": "zoom-in", "intensity": "high" }],
  "preset": "hook",
  "scenePurpose": { "function": "reveal" },
  "sceneDelta": { 
    "newInformation": "L'objet vibre au contact du sang", 
    "consequence": "@Mathieu lâche l'objet de terreur" 
  },
  "tensionState": { "level": 7, "type": "spike" },
  "pacing": 5,
  "transition": "fade",
  "continueFromPrevious": true
}`

export const VALID_TRANSITIONS = [
  'none',
  'fade',
  'blur',
  'crossfade',
  'zoom-in',
  'zoom-out',
  'dissolve',
  'fade-black',
  'fade-white',
  'wipe-left',
  'wipe-right',
  'wipe-up',
  'wipe-down',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
  'circleopen',
  'circleclose',
  'pixelize',
  'radial',
  'smooth-left',
  'smooth-right',
  'smooth-up',
  'smooth-down',
  'squeezev',
  'squeezeh',
  'zoomin',
  'zoomout',
  'diagtl',
  'diagtr',
  'diagbl',
  'diagbr'
].join(', ')

export const VALID_CAMERA_ACTIONS = [
  'none',
  'pan-left',
  'pan-right',
  'pan-up',
  'pan-down',
  'zoom-in',
  'zoom-out',
  'shake',
  'breathing',
  'snap-zoom',
  'dutch-tilt'
].join(', ')

export const CINEMATOGRAPHIC_GUARDS = `
⚠️ GARDES-FOUS CINÉMATOGRAPHIQUES

🆘 TRANSITION VS CAMERA ACTION (STRICT) :
- TRANSITION : Changement de scène. 'shake', 'static', 'breathing' ne sont PAS des transitions.
- CAMERA ACTION : Mouvement DANS la scène. 'shake' est une CAMERA ACTION.
Si vous voulez une secousse, utilisez 'cameraAction': 'shake' et 'transition': 'none'.

TRANSITIONS AUTORISÉES : ${VALID_TRANSITIONS}
CAMERA ACTIONS AUTORISÉES : ${VALID_CAMERA_ACTIONS}

🚨 HALLUCINATION GUARD (HARDCORE) :
1. INTERDICTION DE CRÉER DES PERSONNAGES : N'utilisez que ceux du Registre Canon. Toute invention sera détectée par le SentineL.
2. INTERDICTION DE CRÉER DES LIEUX : Si un lieu n'est pas @ID-Existant, déclarez-le impérativement dans seriesMetadata.newLocations.
3. COHÉRENCE @HANDLE (STRICT) : 
   - Personnages : Utilisez @Nom (ex: @Sarah).
   - Lieux : N'utilisez JAMAIS de '@'. Utilisez des IDs en snake_case (ex: antique_shop).
4. EMOTIONAL TOKENS : Utilisez uniquement des mots-clés en minuscule, standardisés (ex: "fear", "curiosity", "anger").
5. VISUAL STATE LOCK : Le champ 'mustPersist' ne doit contenir QUE des éléments physiques observables (matériau, blessure, vêtement, objet précis). INTERDICTION de verrouiller des concepts abstraits (ex: "un secret").
6. INFRACTION = RETRY : Toute hallucination ou non-respect des formats entraînera un échec de la génération.

📈 TENSION SYSTEM (STATEFUL v8.0) : 
La tension est un état dynamique piloté par l'intrigue :
- CAUSALITÉ : Chaque scène DOIT faire progresser le 'tensionState.level' (0-10) en fonction des enjeux.
- DYNAMIQUE : Définissez le 'tensionState.type' (build | sustain | spike | release).
- MOMENTUM : Gérez le 'residue' dans 'momentum' pour maintenir l'atmosphère.

🚨 NARRATIVE DELTA RULE (OBLIGATOIRE) :
1 SCÈNE = 1 INFORMATION NOUVELLE IRRÉVERSIBLE.
- Interdiction de répéter la même révélation (ex: "L'objet est mystérieux").
- Si une scène n'apporte pas de nouveau 'sceneDelta' (Info + Conséquence), elle doit être supprimée.
- Chaque Delta doit changer l'état du monde ou la connaissance d'un personnage de façon permanente.

⚠️ CONFUSION À ÉVITER : 
- 'scenePurpose' = Rôle de la scène dans l'histoire (ex: 'reveal').
- 'tensionState.type' = Mouvement de la tension (ex: 'build'). 
Ne mettez JAMAIS 'build' dans 'scenePurpose'.

CHAMPS OBLIGATOIRES : 'scenePurpose', 'sceneDelta', 'tensionState' (0-10) et 'momentum'.

🚨 RÈGLES DE PRODUCTION (HARDCORE) :
1. VISUAL STATE LOCK : Le champ 'mustPersist' ne doit contenir QUE des éléments physiques observables (matériau, blessure, vêtement, objet précis). INTERDICTION de verrouiller des concepts abstraits (ex: "un secret").
2. EMOTIONAL TOKENS : Utilisez uniquement des mots-clés en minuscule, standardisés (ex: "fear", "curiosity", "anger").
3. CANONICAL IDs : 
   - Personnages : @Nom (ex: @Sarah).
   - Lieux : snake_case sans '@' (ex: antique_shop).
4. INFRACTION = RETRY : Toute hallucination ou violation de format entraînera un échec de la génération.
5. FRAME ANCHOR (STRICT) : 'frameAnchor.similarityMode' DOIT être uniquement 'strict' ou 'soft'.
6. OBJECTS ONLY : Les champs 'interactions', 'relationshipMap', 'emotionalTokens' et 'visualEvolution' ne doivent JAMAIS être 'null'. Utilisez un objet vide {} au minimum.
`

export const SPATIAL_ANCHORING_RULES = `
--- 📍 ANCRAGE SPATIAL & COHÉRENCE MONDE 📍 ---
- Plan d'Ensemble OBLIGATOIRE : Si une scène introduit un NOUVEAU lieu, la première scène DOIT avoir isEstablishingShot: true et un cadrage WIDE.
- Ancre Spatiale : Remplir spatialAnchor pour situer le lieu par rapport au reste du monde.
- Logique de Déplacement : Si un personnage "va à l'église", commencez par un plan large avant de passer à l'intérieur.
`

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
  threadsInstruction?: string
  seedingInstruction?: string
  closedStakesInstruction?: string
  deadCharactersInstruction?: string
  forbiddenInstruction?: string
  normalizeId: (id: string) => string
  tiktokViral?: boolean
  worldStateSnapshot?: any
  tensionState?: { residue: number; level?: number; type?: string }
}

export function buildPass1SystemPrompt(p: Pass1SystemPromptParams): string {
  const actLabel =
    p.episodeNumber === 1
      ? 'ACTE 1 (DÉCOMPRESSION/DÉPART)'
      : p.isFinalEpisode
        ? 'ACTE 3 (RÉSOLUTION FINALE)'
        : `ACTE 2 (DÉVELOPPEMENT/INTENSIFICATION - Épisode ${p.episodeNumber})`

  const characterBlock =
    Object.entries(p.characterRegistry)
      .map(([name, data]) => {
        const attrs: string[] = []
        if (data.backstory) attrs.push(`Infos : ${data.backstory}`)
        if (data.abilities?.length) attrs.push(`Capacités : ${data.abilities.join(', ')}`)
        if (data.knownFacts?.length) attrs.push(`Faits établis : ${data.knownFacts.join(', ')}`)
        if (data.fate) attrs.push(`Destin : ${data.fate}`)
        const attrText = attrs.length ? ` | ${attrs.join(' | ')}` : ''
        return `• ${name}: (Motivation: ${data.motivation || 'N/A'}, But: ${data.personalGoal || 'N/A'}, Statut: ${data.status || 'alive'})${attrText}`
      })
      .join('\n') || 'Aucun personnage récurrent défini.'

  const locationBlock =
    Object.entries(p.locationRegistry)
      .map(([name, data]) => {
        const normalized = p.normalizeId(name)
        const evol = p.visualEvolution?.[normalized]
        const stateText = evol ? ` [ÉTAT ACTUEL : ${typeof evol === 'string' ? evol : evol.state}]` : ''
        return `• ${name}: ${data.description}${stateText}`
      })
      .join('\n') || 'Aucun lieu récurrent défini.'

  const assetBlock =
    Object.entries(p.assetRegistry)
      .map(([name, data]) => {
        const normalized = p.normalizeId(name)
        const evol = p.assetEvolution?.[normalized]
        const stateText = evol ? ` [ÉTAT ACTUEL : ${typeof evol === 'string' ? evol : evol.state}]` : ''
        return `• ${name} [${data.type || 'entité'}]: ${data.description}${stateText}`
      })
      .join('\n') || 'Aucune entité récurrente définie.'

  const authorizedCharacters = Object.keys(p.characterRegistry).join(', ')
  const authorizedLocations = Object.keys(p.locationRegistry).join(', ') || 'Aucun lieu défini'

  const role = p.tiktokViral
    ? 'Vous êtes un expert en storytelling TikTok Viral, spécialisé dans la rétention ultra-haute et les boucles addictives.'
    : 'Vous êtes un scénariste de séries expert en binge-watching et en narration épisodique.'

  const tiktokRules = p.tiktokViral ? TIKTOK_VIRAL_NARRATIVE_RULES : ''

  return `Tu es l'Auteur Saga Engine v11.0.

MISSION : Générer l'épisode N° ${p.episodeNumber} sous forme de BEATS NARRATIFS.

---

### ARCHITECTURE DE PRODUCTION (v12.0)
Générez UNIQUEMENT un tableau JSON de chaînes de caractères.
Chaque chaîne est un "beat narratif" (un bloc de récit cohérent).
Exemple : [ "Beat 1", "Beat 2", "Beat 3" ]

---

### RÈGLES CRITIQUES
- **Beats Cohérents**: Chaque bloc doit former une unité dramatique.
- **Action Directe**: Pas de fioritures narratives, restez sur le visuel et l'action immédiate.
- **Causalité**: Chaque beat doit être la suite logique et chronologique du précédent.

---

RÔLE NARRATIF : ${actLabel}
${
  p.tensionState && p.tensionState.residue > 0
    ? `\n📈 TENSION DE SIMULATION : Momentum résiduel ${p.tensionState.residue}/10. ${p.tensionState.residue > 5 ? '⚠️ Momentum élevé : privilégie le mouvement brusque.' : ''}\n`
    : ''
}

---

### CONTEXTE DU MONDE
${p.globalContext || 'Pas de bible.'}

---

### ÉPISODES PRÉCÉDENTS
${p.previousEpisodesContext || 'Premier épisode.'}

---

### REGISTRES (VÉRITÉ CANONIQUE)
PERSONNAGES :
${characterBlock}

LIEUX :
${locationBlock}

ASSETS :
${assetBlock}

---

### DIRECTIVES DE L'ÉPISODE
${p.narrativeInstructions.join('\n')}
${p.bridgeInstruction || ''}
${p.threadsInstruction || ''}

---

${p.tiktokViral ? GOLDEN_TIKTOK_RULES : GOLDEN_NARRATION_RULES(authorizedCharacters, authorizedLocations)}`
}

export const GOLDEN_NARRATION_RULES = (authorizedCharacters: string, authorizedLocations: string) => `
RÈGLES D'OR DE NARRATION :
• BEATS NARRATIFS : Proposez des blocs de texte cohérents. Utilisez un tableau JSON [ "Beat 1", "Beat 2" ].
• ACTION PURE : Bannissez les intros du type "Il était une fois" ou les conclusions explicatives.
• IDENTITÉ @HANDLE (STRICT) : Utilisez uniquement les handles du registre canon.
• RYTHME CHRONOLOGIQUE : Chaque ligne du tableau doit faire avancer le temps.
${NARRATIVE_BEAT_RULES}
`

// ─── Pass 2 System Prompt Builder ─────────────────────────────────────────────

export interface Pass2SystemPromptParams {
  episodeNumber: number
  narrativeInstructions: string[]
  lastCliffhanger?: any
  nextEpisodeTease?: string
  unresolvedThreads?: any[]
  continuityDebts?: (string | any)[]
  lastEpisodeFinalScene?: any
  lastEpisodeFinalImage?: string
  characterRegistry: Record<string, any>
  locationRegistry: Record<string, any>
  assetRegistry: Record<string, any>
  globalContext?: string
  normalizeId: (id: string) => string
  isFinalEpisode?: boolean
  tiktokViral?: boolean
  worldStateSnapshot?: any
  narrationLayer?: {
    psychologicalArc: string
    causalThread: string
    hiddenForce: string
  }
}

export function buildPass2SystemContext(p: Pass2SystemPromptParams): string {
  const ch = p.lastCliffhanger
  const cliffhangerContext = ch
    ? typeof ch === 'string'
      ? `Dernier Cliffhanger (À RÉSOUDRE OU ÉVOLUER): ${ch}`
      : `Dernier Cliffhanger [${ch.type?.toUpperCase()}]: ${ch.description}`
    : 'Aucun cliffhanger précédent.'

  const lastTease = p.nextEpisodeTease || 'Aucun teasing spécifique.'
  const lastQuestion =
    typeof p.lastCliffhanger === 'object' ? p.lastCliffhanger?.audienceQuestion : 'Aucune question spécifique.'

  const threadsBlock = p.unresolvedThreads?.length
    ? p.unresolvedThreads
        .map((t, i) => {
          const id = t.id || `T${i + 1}`
          return `[${id}] (${t.status?.toUpperCase()}) ${t.title}: ${t.description}`
        })
        .join(' ; ')
    : 'Aucun.'

  const finalSceneBlock = p.lastEpisodeFinalScene
    ? `L'épisode précédent s'est terminé sur : "${p.lastEpisodeFinalScene.summary}".
     DÉTAILS TECHNIQUES POUR LA SCÈNE 1 :
     - Image de référence : ${p.lastEpisodeFinalImage || 'Non disponible'}
     - Prompt visuel précédent : "${p.lastEpisodeFinalScene.imagePrompt}"
     - Jetons de Décor : ${p.lastEpisodeFinalScene.persistentDecorTokens?.join(', ') || 'Standard'}
     - Emplacement précis : ${p.lastEpisodeFinalScene.locationId}
     - État émotionnel : ${JSON.stringify(p.lastEpisodeFinalScene.emotionalTokens || {})}
     - Personnages présents : ${p.lastEpisodeFinalScene.charactersInScene?.join(', ') || 'Inconnu'}
     La première scène de ce NOUVEL ÉPISODE doit être la suite immédiate de cet état.`
    : 'Aucun (Premier épisode).'

  const characterBlock =
    Object.entries(p.characterRegistry)
      .map(([name, data]) => {
        const handle = p.normalizeId(name)
        return `${name} (${handle}): ${data.description}`
      })
      .join(' | ') || 'Aucun.'

  const locationBlock =
    Object.entries(p.locationRegistry)
      .map(([name, data]) => {
        const normalized = p.normalizeId(name)
        return `${normalized}: ${data.description}`
      })
      .join(' | ') || 'Aucun.'

  const assetBlock =
    Object.entries(p.assetRegistry)
      .map(([name, data]) => `${name}: ${data.description}`)
      .join(' | ') || 'Aucun.'

  return `[STRUCTURATION SAGA N°${p.episodeNumber}]${p.tiktokViral ? ' [MODE TIKTOK VIRAL]' : ''}
${cliffhangerContext}
ATTENTE PRÉCÉDENTE (PROMESSA) : "${lastTease}"
QUESTION DU PUBLIC À RÉSOUDRE : "${lastQuestion}"
FILS NARRATIFS ACTIFS : ${threadsBlock}
DETTES DE CONTINUITÉ : ${p.continuityDebts?.length ? p.continuityDebts.map((d) => (typeof d === 'string' ? d : d.description)).join(' ; ') : 'Aucune.'}
PONT VISUEL OBLIGATOIRE : ${finalSceneBlock}
REGISTRE DES PERSONNAGES : ${characterBlock}
REGISTRE DES LIEUX : ${locationBlock}
REGISTRE DES ASSETS : ${assetBlock}
LORE BIBLE : ${p.globalContext || 'Vide.'}
STRATÉGIE NARRATIVE (LAYER) : ${p.narrationLayer ? JSON.stringify(p.narrationLayer) : 'N/A'}`
}

export const PASS2_SCENE_INSTRUCTIONS = [
  'IMAGE PROMPT (PROSE VISUELLE COURTE) : `imagePrompt` DOIT être une phrase fluide et concise (max 20-25 mots). L\'accent DOIT être mis sur le LIEU et le SUJET principal. Exemple : "Sarah devant la vieille bibliothèque en bois sombre, éclairage à la bougie vacillante, atmosphère de mystère médiéval."',
  'RÈGLE DE PROJECTION (SÉMANTIQUE) : Ne découpez le beat en plusieurs scènes QUE si la SITUATION change radicalement (Changement de LIEU, PUNCTUATION majeure, entrée/sortie de perso).',
  'DÉCLENCHEUR DE SHOT (TRIGGER) : Un simple mouvement physique (marcher, parler) ne justifie PAS un nouveau shot. Ne créez un nouveau shot que pour un changement de POINT DE VUE ou de FOCUS nécessaire.',
  "LOI DE CONSOLIDATION RADICALE (V15.0) : Interdiction formelle de découper une scène pour un changement interne (Yeux qui s'allument, livre qui brille, apparition d'accessoire comme des mains d'ombre). Si le LIEU et l'ANGLE sont identiques, REGROUPEZ tout dans une seule scène et utilisez `animationPrompt` pour décrire la séquence d'évolution interne.",
  "FIDÉLITÉ ABSOLUE AU MODÈLE : Chaque personnage DOIT respecter scrupuleusement le style de son `IDENTITY`. Un perso défini comme '3D Render' ne peut JAMAIS apparaître en dessin 2D.",
  "PERSISTANCE DES ACCESSOIRES : Tout objet introduit (ex: mains d'ombres, livre incandescent) DOIT être maintenu dans les scènes suivantes du même lieu, avec la même intensité lumineuse/couleur (accent color).",
  "ANIMATION vs SPLIT (STRICT) : Les changements de luminosité ou de petits mouvements sont l'affaire de `animationPrompt`. NE PAS créer de nouvelle image pour cela.",
  "PARTITION SYNCHRONISÉE : La narration de chaque scène DOIT commencer précisément au mot qui déclenche le nouveau visuel. AUCUN décalage entre le texte parlé et l'action montrée.",
  'DETTE PHYSIQUE (STRICT) : Vérifiez `visualEvolution` avant CHAQUE imagePrompt. Si un personnage est blessé, sale ou mouillé, cette mention DOIT être la première directive visuelle de sa description dans la scène.',
  "STABILITÉ ÉMOTIONNELLE : Les personnages ne doivent pas changer d'humeur radicalement entre deux scènes sans explication narrative. Utilisez `emotionalTokens` pour assurer une courbe cohérente.",
  'LOGIQUE SPATIALE & ANTI-TÉLÉPORTATION : Interdiction de changer de lieu sans une transition logique (ellipse, personnage qui sort, trajet). Si le lieu change, précisez la transition dans `summary`.',
  "GARDE ANTI-RÉSURRECTION : Vérifiez la liste 'PERSONNAGES MORTS'. Toute mention d'un mort en tant que personnage vivant entraînera un rejet critique.",
  'SIMULATION PATCH (STRICT) : Si un objet change ou un personnage est blessé, documente-le EXCLUSIVEMENT dans simulationPatch.locks.',
  "STYLE VISUEL (GOLDEN STANDARD) : Favorisez un style direct et épuré. Ne gardez que l'essentiel narratif visuel.",
  'INVENTAIRE ACTIF : Tout changement physique persistant DOIT être patché pour être propagé.',
  "TEASING PRÉCIS : 'nextEpisodeTease' doit contenir un nom propre et un enjeu concret.",
  "MANDAT DE JUSTIFICATION : Remplir le champ 'justification' pour CHAQUE scène.",
  "LORE GUARD : Tout fait nouveau introduit dans l'épisode DOIT être consigné dans 'loreUpdates'.",
  "FIL CONDUCTEUR : Chaque épisode DOIT faire progresser l'un des 'unresolvedThreads'.",
  "STABILITÉ GÉOGRAPHIQUE : Réutilisez les lieux du registre. Chaque scène DOIT avoir un 'locationId' valide.",
  "FRAME ANCHOR : 'frameAnchor.similarityMode' accepte UNIQUEMENT ['strict', 'soft']. 'strict' pour une identité visuelle identique, 'soft' pour une variation stylistique.",
  "OBJECT SAFETY : Interdiction formelle d'assigner 'null' à un champ Record (ex: interactions, relationshipMap). Utilisez toujours {} si vide.",
  "ENREGISTREMENT NOUVEAUX LIEUX : Tout lieu absent du registre DOIT être dans 'seriesMetadata.newLocations'.",
  "EXPULSION NARRATIVE : Si un personnage quitte la scène, le retirer de 'charactersInScene' immédiatement.",
  'IDENTITÉ DES PERSONNAGES : Utilisez UNIQUEMENT le PRÉNOM pour les handles @. Excluez préfixes et noms de famille.',
  VISUAL_CONSISTENCY_PRIORITY,
  SCENE_CONSOLIDATION_RULES,
  "🌍 WORLD STATE SNAPSHOT : Pour chaque scène, vous DEVEZ fournir un 'worldStateSnapshot' qui récapitule la vérité absolue actuelle du décor et des personnages.",
  "📈 GESTION DES INTRIGUES : Mettez à jour 'importance' (1-10) et 'maturity' (0-100) pour chaque 'unresolvedThread'. Une maturité élevée (80+) annonce une résolution imminente.",
  "🏁 HARDENED CONCLUSION (SCÈNE FINALE) : La dernière scène (preset: 'conclusion') DOIT être dense (min. 25-35 mots), comporter au moins 3 phrases, et inclure impérativement une réflexion finale ou une menace suggérée pour maintenir l'engagement."
]

// ─── Output Format Builders ───────────────────────────────────────────────────

export function buildSeriesOutputFormat(isFinalEpisode: boolean): string {
  const metadataBlock = isFinalEpisode
    ? `"seriesMetadata": {
    "episodeSummary": "Résumé narratif final de la série.",
    "resolution": "Description de la conclusion définitive."
  }`
    : `"seriesMetadata": {
    "episodeSummary": "Résumé narratif.",
    "cliffhanger": { "type": "...", "description": "...", "audienceQuestion": "..." },
    "simulationPatch": { "charactersPatch": {}, "worldPatch": {}, "assetPatch": {} },
    "narrationLayer": { "psychologicalArc": "...", "causalThread": "...", "hiddenForce": "..." },
    "nextEpisodeTease": "..."
  }`

  return `
{
  ${metadataBlock},
  "titles": ["titre épisode"],
  "fullNarration": "La narration complète...",
  "scenes": [
    {
      "id": "scene-1",
      "sceneNumber": 1,
      "shotType": "WIDE",
      "summary": "Résumé visuel",
      "narration": "Projection sémantique de l'histoire pour cette scène (ajustée pour le timing)...",
      "locationId": "identifiant-lieu-unique",
      "persistentDecorTokens": ["lampe de bureau rouge", "plante verte", "lumière de fin de journée"],
      "imagePrompt": "Description visuelle",
      "charactersInScene": ["@Sarah"],
      "isEstablishingShot": true,
      "spatialAnchor": "Sur la colline surplombant le village",
      "emotionalTokens": { "@Sarah": ["Terrifié", "Essoufflé"] },
      "interactions": { "@Sarah-@Marek": "Suspicion mutuelle" },
      "composition": {
        "shotType": "WIDE",
        "foregroundAnchor": "des branches d'arbres floues",
        "lightingMood": "crépuscule froid",
        "focusTarget": "@Sarah"
      },
      "visualEvolution": { "@Sarah": "Cicatrice au front" },
      "characterEvolution": { "@Sarah": { "state": "Blessé au bras", "status": "injured" } },
      "weatherState": "Pluie diluvienne",
      "timeOfDay": "Aube",
      "relationshipMap": { "@Sarah": { "@Alexandre": "Alliance", "@Marek": "Méfiance" } },
      "assetEvolution": { "Épée": "Brisée" },
      
      "visualDelta": {
        "changes": ["fumée sur la gauche", "voiture avancée"],
        "damages": ["traces d'impact sur le mur"],
        "positions": ["@Sarah plus proche de la caméra"],
        "cameraShift": "déplacement léger vers la droite",
        "emotionalTone": "tension accrue"
      },
      "worldStateSnapshot": {
        "location": "usine_abandonnée",
        "lighting": "néon bleu stable",
        "weather": "pluie constante",
        "activeProps": ["voiture brûlée", "porte cassée"],
        "lockedCharacters": {
          "@Sarah": { "injury": "main coupée", "clothing": "manteau rouge déchiré" }
        }
      },
      "visualBaseState": {
        "lighting": "néon bleu froid",
        "atmosphere": "brume industrielle",
        "persistentElements": ["pluie forte", "enseigne clignotante"]
      },
      "visualStateLock": {
        "mustPersist": ["écharpe rouge", "@Sarah blessure main"],
        "forbiddenChanges": ["pas de soleil"]
      },
      "frameAnchor": { "referenceSceneId": "scene-1", "similarityMode": "soft" },
      "animationPrompt": "Mouvement fluide et expressif...",
      "cameraAction": [{ "type": "zoom-in", "intensity": "high" }],
      "preset": "hook",
      "scenePurpose": { "function": "reveal" },
      "sceneDelta": { 
        "newInformation": "L'objet vibre au contact du sang", 
        "consequence": "@Mathieu lâche l'objet de terreur" 
      },
      "tensionState": { "level": 7, "type": "spike" },
      "pacing": 5,
      "transition": "fade",
      "continueFromPrevious": true
    }
  ]
}
`.trim()
}

// ─── Bridge Instructions ───────────────────────────────────────────────────────

export type CliffhangerType = 'revelation' | 'peril' | 'choice' | 'betrayal' | 'unknown'

const CLIFFHANGER_TYPE_INSTRUCTIONS: Record<CliffhangerType, string> = {
  revelation: `Le personnage vient d'apprendre une vérité qui change tout. L'épisode s'ouvre sur les CONSÉQUENCES émotionnelles immédiates. Le choc doit résonner.`,
  peril: `Un personnage est en danger immédiat. L'épisode DOIT s'ouvrir en plein milieu du danger (In Media Res). Laissez la tension monter au moins 2 scènes avant toute issue.`,
  choice: `Un personnage face à un choix impossible. Montrez le processus de décision dans ses contradictions — pas seulement la décision elle-même.`,
  betrayal: `Une trahison vient d'être révélée. L'épisode s'ouvre sur la réaction viscérale du personnage trahi. Laissez l'ambiguïté respirer.`,
  unknown: `L'épisode doit reconnecter avec la tension précédente de façon directe et immersive.`
}

export function buildCliffhangerBridgeInstruction(
  ch: { type: CliffhangerType; description: string; audienceQuestion?: string } | string | undefined,
  episodeNumber: number,
  lastScene?: any
): string {
  if (episodeNumber <= 1 || (!ch && !lastScene)) return ''

  let prompt = `\n\n${CINEMATOGRAPHIC_GUARDS}\n\n⚠️ PONT NARRATIF OBLIGATOIRE :`

  if (lastScene) {
    prompt += `\nL'épisode précédent s'est arrêté EXACTEMENT sur : "${lastScene.summary || lastScene.imagePrompt}"`
    if (lastScene.locationId) prompt += `\nLieu de reprise OBLIGATOIRE : "${lastScene.locationId}".`
    if (lastScene.persistentDecorTokens?.length > 0) {
      prompt += `\nAmbiance à maintenir : ${lastScene.persistentDecorTokens.join(', ')}`
    }
    prompt += `\n🆘 ANTI-SAUT TEMPOREL : Reprenez au MÊME ENDROIT, à la MÊME SECONDE.`
    prompt += `\n- HÉRITAGE TECHNIQUE [S1] : locationId: "${lastScene.locationId}", charactersInScene: [${(lastScene.charactersInScene || []).join(', ')}]`
    prompt += `\n- ECHO DU DERNIER SOUFFLE : "${lastScene.narration}". La première phrase de S1 DOIT répondre directement.`
    prompt += `\n- RÉACTION VISCÉRALE : Le personnage actuel doit être dans le MÊME état émotionnel.`
  }

  if (ch) {
    if (typeof ch === 'string') {
      prompt += `\nCliffhanger à résoudre : "${ch}"`
    } else {
      prompt += `\n[Type: ${(ch.type || 'unknown').toUpperCase()}] : "${ch.description}"`
      if (ch.audienceQuestion) prompt += `\nQuestion du public : "${ch.audienceQuestion}"`
      prompt += `\nInstruction de reprise : ${CLIFFHANGER_TYPE_INSTRUCTIONS[ch.type] || CLIFFHANGER_TYPE_INSTRUCTIONS.unknown}`
    }
  }

  return prompt
}

// ─── TikTok Viral Constants ───────────────────────────────────────────────────

export const TIKTOK_VIRAL_NARRATIVE_RULES = `
🔥 RÈGLES TIKTOK VIRAL (OBLIGATOIRES) :
1. HOOK IMMÉDIAT (< 2s) : La première phrase DOIT être un choc, un mystère ou une action intense.
2. MYSTÈRE > LOGIQUE : Ne perdez pas de temps à expliquer. Privilégiez l'intrigue et l'étrangeté (WTF moments) sur la cohérence parfaite.
3. ÉCONOMIE RADICALE : Pas de remplissage. Chaque mot doit servir la rétention. Phrases "punchy".
4. MICRO-CLIFFHANGERS : Finissez chaque petit segment sur une tension insoutenable.
5. BOUCLE PARFAITE : La fin doit rendre le début cyclique (Loop addictif).

🚫 ERREURS À ÉVITER ABSOLUMENT :
• TROP NARRATIF : TikTok n'est pas un film. Évitez les introductions lentes et les dialogues contemplatifs.
• TROP LOGIQUE : Si l'explication ralentit le rythme, supprimez-la. Laissez le public spéculer en commentaire.
• TROP LONG : Si une seconde n'apporte pas un nouveau stimulus, elle est de trop.
`

export const TIKTOK_VIRAL_SCENE_INSTRUCTIONS = [
  "RYTHME ACCÉLÉRÉ : Chaque scène DOIT faire progresser l'intrigue brutalement.",
  'PATTERN INTERRUPT : Glissez un élément visuel ou narratif inattendu toutes les 2 scènes.',
  "GROS PLANS OBLIGATOIRES : Priorité aux CLOSEUP pour maximiser l'impact sur mobile.",
  'LOOP DESIGN : La dernière scène doit recontextualiser la première (Chute ou Twist).',
  'TENSION MAXIMALE : Une scène sans tension est une scène à supprimer.',
  '🧬 NARRATIVE ANCHORING (V4) : Pour chaque scène, vous DEVEZ remplir :',
  "  - 'visualBaseState' : Définissez la vérité stable (éclairage, météo, objets persistants).",
  "  - 'visualDelta' : Décrivez l'évolution dynamique (mouvements, dégâts, changements précis).",
  "  - 'visualStateLock' : Listez ce qui NE DOIT ABSOLUMENT PAS CHANGER (vêtements, blessures spécifiques, accessoires). Soyez autoritaire : 'NE CHANGE PAS'."
]

export const GOLDEN_TIKTOK_RULES = `
📱 RÈGLES D'OR TIKTOK :
• RÉTENTION : Le script doit être conçu pour que l'utilisateur ne puisse pas zapper après 3 secondes.
• BOUCLE : "La boucle est bouclée" — préparez une fin qui rend le début encore plus intrigant au deuxième visionnage.
• COMMENT BAIT : Glissez un détail intrigant ou une question implicite qui pousse à commenter.
• VISUEL MOBILE : Décrivez des scènes lisibles, avec des visages expressifs et des actions claires.
`
