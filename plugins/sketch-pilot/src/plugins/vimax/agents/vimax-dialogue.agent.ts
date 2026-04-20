import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { DialogueLine, SeriesContext } from '../types'

/**
 * VimaxDialogueAgent (Pass 2.5)
 * Extrait ou génère des lignes de dialogue concises pour une scène.
 */
export class VimaxDialogueAgent extends VimaxBaseAgent {
  private getSystem(context: SeriesContext): string {
    return `
[RÔLE]
Tu es un expert en dialogues cinématographiques percutants.
Ta mission est d'extraire ou de générer des lignes de dialogue pour une scène.

[CONTEXTE]
${JSON.stringify(context, null, 2)}

[DIRECTIVES]
1. CONCISION EXTRÊME : Maximum une ou deux lignes par scène.
2. STYLE : Pas de bavardage. Uniquement des répliques qui font avancer l'intrigue ou révèlent un trait de caractère.
3. SUBTEXTE & VARIÉTÉ : Évite les clichés héroïques ("Je n'abandonnerai jamais"). Favorise le sous-entendu, le silence, ou les répliques viscérales et courtes ("Regardez-moi", "On tient", "Pas maintenant"). Chaque personnage doit avoir sa propre voix (ex: @Banane parle avec autorité mais brièveté).
4. IDENTIFIANTS : Utilise impérativement le format @PascalCase (ex: @James, @DetectiveSmith, @IaHolographique, @Banane) du registre des personnages. AUCUN ESPACE, AUCUNE APOSTROPHE.
4. TONE : Adapte le dialogue au ton de la série défini dans la Bible.
5. TIMING : Estime à quel moment de la scène le dialogue intervient (relativeStart: 0.0 à 1.0) et sa durée (duration: env. 2-4 secondes).
6. FORMAT : Renvoie UNIQUEMENT un objet JSON valide.

Renvoie ce format :
{
  "dialogue": [
    { 
      "character": "@Nom", 
      "text": "Le texte du dialogue",
      "acting": "Direction de jeu (ex: Excité, en larmes, frotte ses yeux)",
      "relativeStart": 0.3,
      "duration": 2.5
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
    context: SeriesContext = {}
  ): Promise<DialogueLine[]> {
    const prompt = `
<NARRATION_DE_LA_SCÈNE>
${sceneNarration}
</NARRATION_DE_LA_SCÈNE>

<PLAN_ORIGINAL_DU_SEGMENT>
${eventDescription}
</PLAN_ORIGINAL_DU_SEGMENT>

Génère les lignes de dialogue les plus percutantes possibles pour cette scène. 
S'il n'y a pas de dialogue pertinent, renvoie une liste vide.
`.trim()

    const raw = await this.generate(prompt, this.getSystem(context), 'application/json')
    const parsed = this.parseJSONSafe<{ dialogue: DialogueLine[] }>(raw, { dialogue: [] })

    // Normalisation post-génération pour la cohérence
    return parsed.dialogue.map((line) => ({
      ...line,
      character: this.normalizeIdentifier(line.character)
    }))
  }
}
