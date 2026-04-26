import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { AudienceProfile, SagaIntent, SceneMemory, SpectatorCognition } from '../types'

export interface SpectatorState {
  saturationLevel: number // 0-100 (Saturation émotionnelle)
  fatigueLevel: number // 0-100 (Fatigue cognitive)
  boredomLevel: number // 0-100 (Manque de stimulation)
  attentionRemaining: number // secondes estimées avant drop-off
}

export interface RespirationDirective {
  paceAdjustment: 'accelerate' | 'decelerate' | 'maintain'
  tensionTarget: 'spike' | 'release' | 'plateau'
  ellipticalHint?: string // ex: "Passer directement à l'action"
  rationale: string
}

/**
 * VimaxSpectatorAgent (V5.0 - Narrative Engine)
 * L'agent qui "ressent" pour l'audience et modélise sa cognition.
 */
export class VimaxSpectatorAgent extends VimaxBaseAgent {
  public id = 'spectator'

  constructor(llm: any) {
    super(llm)
    this.setPersonality({
      temperature: 0.4,
      rolePersona:
        "Tu es un psychologue cognitif expert en attention et en émotion spectateur. Tu maîtrises la théorie de l'esprit et l'anticipation narrative."
    })
  }

  /**
   * Analyse l'impact psychologique et cognitif cumulé.
   */
  async analyzeSpectatorImpact(
    sceneMemories: SceneMemory[],
    audience?: AudienceProfile,
    intent?: SagaIntent | string
  ): Promise<{ state: SpectatorState; directive: RespirationDirective; cognition: SpectatorCognition }> {
    const genre = typeof intent !== 'string' ? intent?.genre || 'any' : 'any'

    const prompt = `
[MISSION : MODÉLISATION PSYCHOLOGIQUE DU SPECTATEUR]
Analyse l'impact cumulé des scènes précédentes sur le spectateur cible.

[AUDIENCE PROFILE]
${JSON.stringify(audience || {}, null, 2)}

[CONTRAT DE GENRE]
Genre dominant: ${genre}

[SÉQUENCE DE SCÈNES (MÉMOIRE)]
${sceneMemories.map((m, i) => `S${i + 1}: Tension ${m.tensionLevel}/10 | Res: ${m.resolutionStatus} | Context: ${m.sceneContext} | POV: ${m.povCharacter}`).join('\n')}

[OBJECTIF : THÉORIE DU LECTEUR]
1. Évalue la SATURATION et la FATIGUE NARRATIVE.
2. Identifie ce que le spectateur a DÉJÀ INFÉRÉ (Theory of Mind).
3. Identifie ce qu'il ANTICIPE stratégiquement.
4. Propose des opportunités de SURPRISE (déjouer les anticipations).
5. Mesure la PHYSIQUE DE L'ATTENTION (risque de décrochage).

[Format JSON]
{
  "state": {
    "saturationLevel": 0-100,
    "fatigueLevel": 0-100,
    "boredomLevel": 0-100,
    "attentionRemaining": secondes
  },
  "cognition": {
    "inferredKnowledge": ["..."],
    "anticipations": ["..."],
    "surpriseOpportunities": ["..."]
  },
  "directive": {
    "paceAdjustment": "accelerate | decelerate | maintain",
    "tensionTarget": "spike | release | plateau",
    "ellipticalHint": "ex: 'Saut temporel stratégique'",
    "rationale": "Analyse psychologique profonde."
  }
}
`.trim()

    const result = await this.generateStructured<{
      state: SpectatorState
      directive: RespirationDirective
      cognition: SpectatorCognition
    }>(
      prompt,
      "Tu es le Modèle de Conscience Spectateur de Vimax. Ton but est de manipuler l'attention pour une immersion totale.",
      {
        state: { saturationLevel: 50, fatigueLevel: 50, boredomLevel: 20, attentionRemaining: 60 },
        cognition: { inferredKnowledge: [], anticipations: [], surpriseOpportunities: [] },
        directive: { paceAdjustment: 'maintain', tensionTarget: 'plateau', rationale: 'Fallback default' }
      }
    )

    return result.data
  }
}
