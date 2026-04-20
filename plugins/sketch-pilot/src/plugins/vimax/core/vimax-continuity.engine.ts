import type {
  CharacterState,
  CharacterVoiceHistory,
  EpisodeBridge,
  LocationState,
  PlotContract,
  SagaIntent
} from '../types'

/**
 * TensionCurveManager
 * Gère la progression de l'intensité dramatique.
 */
export class TensionCurveManager {
  buildCurve(sceneCount: number, intentInput: SagaIntent | string): number[] {
    if (sceneCount <= 1) return [10]
    const intent = typeof intentInput === 'string' ? intentInput : intentInput.tone || 'narrative'
    switch (intent) {
      case 'dramatic':
        return Array.from({ length: sceneCount }, (_, i) => Math.round(2 + 8 * (i / (sceneCount - 1)) ** 1.5))
      case 'viral':
        return [8, 4, 5, 7, 10].slice(0, sceneCount)
      case 'motion':
        return Array.from({ length: sceneCount }, (_, i) => Math.min(10, 6 + Math.round(i * (4 / sceneCount))))
      default:
        return Array.from({ length: sceneCount }, (_, i) => Math.round(1 + 9 * (i / (sceneCount - 1))))
    }
  }

  formatForPrompt(sceneNumber: number, totalScenes: number, tensionCurve: number[]): string {
    return `
[COURBE DE TENSION OBLIGATOIRE]
- Scène ${sceneNumber}/${totalScenes}
- Tension attendue : ${tensionCurve[sceneNumber - 1]}/10
- La tension DOIT augmenter progressivement vers la scène finale.
`.trim()
  }
}

/**
 * CharacterStateTracker
 * Suit l'évolution physique et émotionnelle des acteurs.
 */
export class CharacterStateTracker {
  private states = new Map<string, CharacterState>()

  update(newStates: CharacterState[]) {
    for (const s of newStates) {
      this.states.set(s.identifier, s)
    }
  }

  getCurrentStates(): CharacterState[] {
    return Array.from(this.states.values())
  }

  formatForPrompt(): string {
    if (this.states.size === 0) return 'Tous les personnages sont en état nominal.'
    return Array.from(this.states.values())
      .map((s) => `- ${s.identifier} : ${s.physicalState} | Émotion : ${s.emotionalState}`)
      .join('\n')
  }
}

/**
 * LocationTracker
 * Suit les modifications physiques des environnements.
 */
export class LocationTracker {
  private states = new Map<string, LocationState>()

  update(newStates: LocationState[]) {
    for (const s of newStates) {
      this.states.set(s.locationId || 'unknown', s)
    }
  }

  getCurrentStates(): LocationState[] {
    return Array.from(this.states.values())
  }

  formatForPrompt(): string {
    if (this.states.size === 0) return 'Environnement intact.'
    return Array.from(this.states.values())
      .map(
        (s) =>
          `- ${s.locationId} : ${s.currentState}${s.modifications.length > 0 ? ` (Dégâts: ${s.modifications.join(', ')})` : ''}`
      )
      .join('\n')
  }
}

/**
 * SceneRoleRegistry
 * Garantit l'unicité des rôles dramatiques par épisode.
 */
export class SceneRoleRegistry {
  private used = new Set<string>()

  register(role: string) {
    this.used.add(role)
  }

  getUsedRoles(): string[] {
    return Array.from(this.used)
  }

  formatForPrompt(): string {
    if (this.used.size === 0) return 'Aucun rôle encore utilisé.'
    return `Rôles déjà utilisés (NE PAS RÉPÉTER) : ${Array.from(this.used).join(', ')}`
  }
}

/**
 * PlotContractValidator
 * Gère le cycle de vie des promesses narratives.
 */
export class PlotContractValidator {
  private contract: PlotContract = { openPromises: [], closedPromises: [], unresolvedThreads: [], promises: [] }

  update(newContract: PlotContract) {
    this.contract = newContract
  }

  getContract(): PlotContract {
    return this.contract
  }

  formatForPrompt(): string {
    if (this.contract.openPromises.length === 0) return 'Toutes les promesses narratives sont résolues.'
    return `[PROMESSES À RÉSOUDRE]\n${this.contract.openPromises.map((p) => `- ${p.description} (Introduit à : ${p.introducedAtScene})`).join('\n')}`
  }
}

/**
 * DialogueContinuityGuard
 * Gère la mémoire des voix pour la cohérence des dialogues.
 */
export class DialogueContinuityGuard {
  private histories = new Map<string, CharacterVoiceHistory>()

  update(lines: { character: string; text: string; acting?: string }[]) {
    for (const line of lines) {
      let history = this.histories.get(line.character)
      if (!history) {
        history = {
          identifier: line.character,
          lastLines: [],
          currentEmotionalState: line.acting || 'neutre',
          voiceSignature: 'standard',
          episodeId: 'current',
          sceneNumber: 0,
          line: line.text,
          acting: line.acting || 'neutre'
        }
        this.histories.set(line.character, history)
      }
      history.lastLines.push(line.text)
      if (history.lastLines.length > 3) history.lastLines.shift()
      if (line.acting) history.currentEmotionalState = line.acting
    }
  }

  getVoiceHistories(): CharacterVoiceHistory[] {
    return Array.from(this.histories.values())
  }

  formatForPrompt(): string {
    if (this.histories.size === 0) return ''
    return `[HISTORIQUE DES VOIX]\n${Array.from(this.histories.values())
      .map((v) => `- ${v.identifier} : Ton "${v.voiceSignature}" | État : ${v.currentEmotionalState}`)
      .join('\n')}`
  }
}

/**
 * VimaxContinuityEngine
 * Façade principale pour la gestion de la continuité ("POO au max").
 */
export class VimaxContinuityEngine {
  public tension = new TensionCurveManager()
  public characters = new CharacterStateTracker()
  public locations = new LocationTracker()
  public roles = new SceneRoleRegistry()
  public plots = new PlotContractValidator()
  public voices = new DialogueContinuityGuard()

  public bridge: EpisodeBridge | null = null

  setBridge(bridge: EpisodeBridge) {
    this.bridge = bridge
  }

  formatFullContinuityBlock(): string {
    return `
[ÉTATS ACTUELS (COHÉRENCE DURE)]
${this.characters.formatForPrompt()}
${this.locations.formatForPrompt()}

[CADRE NARRATIF]
${this.roles.formatForPrompt()}
${this.plots.formatForPrompt()}
`.trim()
  }
}
