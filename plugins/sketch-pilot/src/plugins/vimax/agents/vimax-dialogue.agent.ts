import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { CharacterVoiceHistory, DialogueLine, SeriesContext } from '../types'

/**
 * VimaxDialogueAgent (Pass 2.5)
 * Extrait ou génère des lignes de dialogue concises pour une scène.
 */
export class VimaxDialogueAgent extends VimaxBaseAgent {
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

[CONTEXTE]
${JSON.stringify(context, null, 2)}

${voiceBlock}

[DIRECTIVES]
1. CONCISION EXTRÊME : Maximum une ou deux lignes par scène.
2. STYLE : Pas de bavardage. Uniquement des répliques qui font avancer l'intrigue ou révèlent un trait de caractère.
3. MÉMOIRE ÉMOTIONNELLE : Les répliques DOIVENT respecter le passé émotionnel récent. Si @Banane a dit "Je te fais confiance" à la scène 2, il ne peut pas dire "Je savais que tu me trahirais" sans transition logique. Les contradictions non motivées sont interdites.
4. SUBTEXTE & VARIÉTÉ : Évite les clichés héroïques. Favorise le sous-entendu, le silence, ou les répliques viscérales et courtes ("Regardez-moi", "On tient", "Pas maintenant").
5. IDENTIFIANTS : Utilise impérativement le format @PascalCase.
6. TONE : Adapte le dialogue au ton de la série défini dans la Bible.
6. TIMING : Estime à quel moment de la scène le dialogue intervient (relativeStart: 0.0 à 1.0) et sa DURÉE RELATIVE (duration: 0.0 à 1.0).
   IMPORTANT : La somme relativeStart + duration NE DOIT PAS dépasser 1.0. 
   Ex: si relativeStart = 0.8, duration doit être <= 0.2.
7. FORMAT : Renvoie UNIQUEMENT un objet JSON valide.

Renvoie ce format :
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

  /**
   * Génère le dialogue pour une scène.
   */
  async generateDialogue(
    sceneNarration: string,
    eventDescription: string,
    context: SeriesContext = {},
    voiceHistories: CharacterVoiceHistory[] = [] // Hardening 2.0
  ): Promise<DialogueLine[]> {
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
    const parsed = this.parseJSONSafe<{ dialogue: DialogueLine[] }>(raw, { dialogue: [] })

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
