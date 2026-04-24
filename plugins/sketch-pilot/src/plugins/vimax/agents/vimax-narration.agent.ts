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
  private getSystem(
    mode: 'series' | 'episode',
    wordCount?: string,
    context: SeriesContext = {},
    previousScenes: SceneMemory[] = [],
    sceneNumber?: number,
    totalScenes?: number,
    intentReminder = ''
  ): string {
    const defaultWordCount = mode === 'series' ? '300-500 mots' : '40-70 mots'
    const finalWordCount = wordCount || defaultWordCount
    const lengthGuide = `[CONTRÔLE DE DURÉE] : Ta narration doit idéalement faire environ ${finalWordCount}.`

    const granularity =
      mode === 'series' ? 'arc narratif majeur (un épisode complet).' : 'beat de niveau scène (une scène unique).'

    const memoryBlock = mode === 'episode' ? this.getSceneMemoryBlock(previousScenes) : ''
    const tensionProgression =
      mode === 'episode' && totalScenes && sceneNumber
        ? `
[COURBE DE TENSION OBLIGATOIRE]
- Scène ${sceneNumber}/${totalScenes}
- Tension attendue : ${Math.round((sceneNumber / totalScenes) * 10)}/10
- La tension DOIT augmenter progressivement vers la scène finale.
`.trim()
        : ''

    return `
Tu es un scénariste de sagas cinématographiques à haute tension.
Génère une NARRATION BRUTE et percutante pour l'événement fourni.

- RÈGLE D'OR : Écris pour l'ÉCRAN, pas pour un livre.
- Narration VISCÉRALE, BRUTE, IMMÉDIATE.
- Utilise des verbes d'action forts. Évite les adjectifs poétiques ou abstraits.
- Concentre-toi sur ce qui se PASSE physiquement et ce qu'on RESSENT viscéralement.
- Interdiction de faire de la "belle prose". On veut du rythme et de l'impact.

${intentReminder}

[GRANULARITÉ]
${granularity}

${this.getBibleContext(context)}

${memoryBlock}

${tensionProgression}

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

  private getBibleContext(context: SeriesContext): string {
    const b = context.seriesBible
    if (!b || typeof b === 'string') return ''
    return `
[BIBLE DE LA SÉRIE - SPEC]
- GENRE : ${b.genre}
- TON : ${b.tone}
- STYLE VISUEL : ${b.visualStyle}
- LOIS DE L'UNIVERS : ${b.universeLaws?.join(', ') || 'Standard'}
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
      this.getSystem('series', undefined, context),
      'application/json'
    )

    const parsed = this.parseJSONSafe<{ narration: string }>(raw, { narration: event.description })
    return parsed.narration
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
    intentReminder = ''
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
      intentReminder
    )
    const raw = await this.generate(prompt, system, 'application/json')
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
  }
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
