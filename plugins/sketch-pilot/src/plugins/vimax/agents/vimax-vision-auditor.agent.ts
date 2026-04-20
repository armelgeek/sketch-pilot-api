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
}

/**
 * VimaxVisionAuditor
 * Agent multimodal capable d'"inspecter" le rendu visuel final.
 */
export class VimaxVisionAuditor extends VimaxBaseAgent {
  constructor(llm: LLMService) {
    super(llm)
  }

  /**
   * Audit d'une image générée par rapport à sa narration.
   */
  async auditImage(imageUrl: string, narration: string, expectedCharacters: string[]): Promise<VisionAuditReport> {
    const prompt = `
[MISSION : AUDIT DE CONSISTENCE VISUELLE]
Tu es un superviseur VFX et continuité. Compare l'image générée avec la narration suivante.

[NARRATION]
${narration}

[PERSONNAGES ATTENDUS]
${expectedCharacters.join(', ')}

[INSTRUCTIONS]
1. Identité : Les personnages sont-ils identifiables et conformes ?
2. Composition : Le cadrage respecte-t-il les intentions cinématographiques ?
3. Style : Y a-t-il un drift artistique (ex: passage au réalisme alors qu'on veut de l'animation) ?

Réponds en JSON uniquement.
`.trim()

    const result = await this.generateStructured<VisionAuditReport>(
      `${prompt}\n\n[IMAGE_URL]\n${imageUrl}`,
      this.getSystemPrompt(),
      { isValid: false, issues: [], visualDNA: { lighting: '', composition: '', styleAdherence: 0 } }
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
