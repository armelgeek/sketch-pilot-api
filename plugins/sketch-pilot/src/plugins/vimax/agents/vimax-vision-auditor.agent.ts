import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { LLMService } from '../core/llm.interface'

export interface VisionAuditReport {
  isValid: boolean
  issues: string[]
  visualDNA: {
    lighting: string
    composition: string
    styleAdherence: number
  }
  details?: {
    expectation_vs_reality: string
    identity_check: string
    style_consistency: string
  }
  suggestedCorrection?: string
}

/**
 * VimaxVisionAuditor
 * Agent multimodal capable d'"inspecter" le rendu visuel final.
 */
export class VimaxVisionAuditor extends VimaxBaseAgent {
  public id = 'vision-auditor'
  constructor(llm: LLMService) {
    super(llm)
  }

  /**
   * Audit d'une image générée par rapport à sa narration.
   */
  async auditImage(imageUrl: string, narration: string, expectedCharacters: string[]): Promise<VisionAuditReport> {
    const prompt = `
[MISSION : AUDIT DE CONTINUITÉ ET CONSISTENCE VISUELLE]
Tu es un superviseur VFX et expert en continuité. Ta mission est d'inspecter l'image générée et de la comparer à la narration attendue.

[NARRATION ATTENDUE]
${narration}

[PERSONNAGES ATTENDUS]
${expectedCharacters.join(', ')}

[DIRECTIVES D'ANALYSE]
1. Attentes vs Réalité : Détaille précisément ce qui manque ou ce qui diffère par rapport au texte.
2. Identité : Vérifie si chaque personnage @Nom est présent et conforme à son profil.
3. Composition : Le cadrage (Angle, Type de plan) est-il cohérent ?
4. Style : Détecte tout drift (ex: passage à un style photo alors qu'on veut du storyboard).

[FORMAT DE RÉPONSE JSON OBLIGATOIRE]
{
  "isValid": boolean,
  "issues": ["liste des problèmes précis détectés"],
  "visualDNA": {
    "lighting": "description courte (ex: Cinématique sombre, Naturel)",
    "composition": "description courte (ex: Gros plan, Plan américain, Contre-plongée)",
    "styleAdherence": number (score 0-100)
  },
  "details": {
    "expectation_vs_reality": "Analyse détaillée des différences entre la narration et l'image",
    "identity_check": "Vérification précise des personnages",
    "style_consistency": "Analyse de l'adhérence stylistique"
  },
  "suggestedCorrection": "Action concrète pour corriger le drift (ex: Ajouter une directive de style dans le profil du personnage)"
}
`.trim()

    const result = await this.generateStructured<VisionAuditReport>(
      `[IMAGE_URL]\n${imageUrl}\n\n${prompt}`,
      this.getSystemPrompt(),
      {
        isValid: false,
        issues: [],
        visualDNA: { lighting: '', composition: '', styleAdherence: 0 },
        details: { expectation_vs_reality: '', identity_check: '', style_consistency: '' },
        suggestedCorrection: ''
      }
    )

    return result.data
  }

  /**
   * Évalue qualitativement un épisode entier (Screenplay + Narration).
   */
  async scoreEpisode(episode: any): Promise<{ score: number; issues: string[]; rationale: string }> {
    const prompt = `
[MISSION : ÉVALUATEUR DE QUALITÉ CINÉMATOGRAPHIQUE]
Analyse cet épisode généré par Vimax et attribue une note de 0 à 100.

[INPUT]
- Narration : ${episode.narration}
- Scénario (Screenplay) : ${JSON.stringify(episode.response)}

[CRITÈRES D'ÉVALUATION]
1. Rythme (0-25) : La narration est-elle punchy ? Les coupures de scènes sont-elles logiques ?
2. Continuité (0-25) : Les personnages (@Nom) et objets sont-ils persistants ?
3. Richesse Visuelle (0-25) : Les prompts d'images sont-ils évocateurs et précis ?
4. Respect des Consignes (0-25) : La durée et le ton sont-ils respectés ?

[FORMAT]
Réponds uniquement en JSON :
{
  "score": 85,
  "rationale": "Pourquoi ce score ?",
  "issues": ["Problème de rythme en scène 2", "Vêtement de @Banane changeant"]
}
`.trim()

    const result = await this.generateStructured<{ score: number; issues: string[]; rationale: string }>(
      prompt,
      'Tu es un critique de cinéma et superviseur de script extrêmement rigoureux.',
      { score: 50, issues: ["Erreur lors de l'audit"], rationale: 'Fallback' }
    )

    return result.data
  }

  protected getSystemPrompt(): string {
    return "Tu es l'œil de Vimax. Ton but est de détecter toute rupture de continuité visuelle ou de style entre le texte et l'image."
  }
}
