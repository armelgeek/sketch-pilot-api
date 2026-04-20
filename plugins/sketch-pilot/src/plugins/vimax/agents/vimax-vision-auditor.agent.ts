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

    // Note: On assume que l'implémentation de LLMService supporte les URLs d'images pour le multimodal
    const result = await this.generateStructured<VisionAuditReport>(
      `${prompt}\n\n[IMAGE_URL]\n${imageUrl}`,
      this.getSystemPrompt(),
      { isValid: false, issues: [], visualDNA: { lighting: '', composition: '', styleAdherence: 0 } }
    )

    return result.data
  }

  protected getSystemPrompt(): string {
    return "Tu es l'œil de Vimax. Ton but est de détecter toute rupture de continuité visuelle ou de style entre le texte et l'image."
  }
}
