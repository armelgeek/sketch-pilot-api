import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { CharacterVoiceHistory, SeriesContext } from '../types'

/**
 * VimaxDialogueAgent (Pass 2.5)
 * Extrait ou génère des lignes de dialogue concises pour une scène.
 */
export class VimaxDialogueAgent extends VimaxBaseAgent {
  public id = 'dialogue'

  constructor(llm: any) {
    super(llm)
    this.setPersonality({
      temperature: 0.9,
      rolePersona:
        "Tu es un expert en dialogues vivants, spontanés et imprévisibles. Évite les clichés et les phrases trop formelles. Cherche le sous-texte et l'émotion brute."
    })
  }

  private getSystem(context: SeriesContext, voiceHistories: CharacterVoiceHistory[] = []): string {
    const voiceBlock =
      voiceHistories.length > 0
        ? `
[HISTORIQUE DES VOIX & ÉTATS ÉMOTIONNELS]
${voiceHistories.map((v) => `- ${v.identifier} : Ton "${v.voiceSignature}" | État actuel : ${v.currentEmotionalState} | Dernières répliques : ${v.lastLines.join(' / ')}`).join('\n')}

[DIRECTIVE COHÉRENCE]
Chaque personnage DOIT conserver sa voix unique et son état émotionnel. Les nouvelles répliques doivent être la suite logique des précédentes.
`.trim()
        : ''

    return `
[RÔLE]
Tu es un expert en dialogues cinématographiques percutants.
Ta mission est d'extraire ou de générer des lignes de dialogue pour une scène.

${this.getGlobalScriptBlock(context)}

${this.getEpisodePlanBlock(context)}

${voiceBlock}

[FORMAT]
Renvoie UNIQUEMENT un objet JSON valide :
{
  "dialogue": [
    { 
      "character": "@Nom", 
      "text": "Le texte du dialogue",
      "acting": "Direction de jeu (ex: Excité, en larmes)",
      "relativeStart": 0.3,
      "duration": 0.2
    }
  ]
}
`.trim()
  }

  private getGlobalScriptBlock(context: SeriesContext): string {
    if (!context.globalScript) return ''
    const truncated = context.globalScript.slice(0, 1500)
    return `
[SCRIPT GLOBAL DE LA SAGA — RÉFÉRENCE DIALOGUES]
${truncated}${context.globalScript.length > 1500 ? '\n[...]' : ''}
`.trim()
  }

  private getEpisodePlanBlock(context: SeriesContext): string {
    const plan = context.plannedEpisodeContext
    if (!plan) return ''
    return `
[PLAN DE L'ÉPISODE PRÉVU]
- TITRE : ${plan.title || 'Inconnu'}
- HOOK : ${plan.hook || 'Inconnu'}
`.trim()
  }

  /**
   * Génère le dialogue pour une scène.
   */
  async generateDialogue(
    sceneNarration: string,
    eventDescription: string,
    context: SeriesContext = {},
    voiceHistories: CharacterVoiceHistory[] = [] // Hardening 2.0
  ): Promise<any[]> {
    const prompt = `
<NARRATION_DE_LA_SCÈNE>
${sceneNarration}
</NARRATION_DE_LA_SCÈNE>

<PLAN_ORIGINAL_DU_SEGMENT>
${eventDescription}
</PLAN_ORIGINAL_DU_SEGMENT>

Génère les lignes de dialogue les plus percutantes possibles pour cette scène en respectant la continuité des voix.
CONTRÔLE TIMING : Assure-toi que relativeStart + duration <= 1.0.
`.trim()

    const raw = await this.generate(prompt, this.getSystem(context, voiceHistories), 'application/json')
    const parsed = this.parseJSONSafe<{ dialogue: any[] }>(raw, { dialogue: [] })

    // Normalisation post-génération pour la cohérence et la sécurité
    return parsed.dialogue.map((line) => {
      const char = this.normalizeIdentifier(line.character)
      const start = Math.max(0, Math.min(1, line.relativeStart || 0))
      let duration = Math.max(0, Math.min(1, line.duration || 0.2))

      // Clamp pour éviter le débordement
      if (start + duration > 1) {
        duration = 1 - start
      }

      return {
        ...line,
        character: char,
        relativeStart: start,
        duration
      }
    })
  }
}
