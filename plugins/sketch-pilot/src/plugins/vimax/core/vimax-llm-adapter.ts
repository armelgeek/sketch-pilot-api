import type { LLMService as GlobalLLMService } from '../../../services/llm'
import type { LLMService } from './llm.interface'

/**
 * Adaptateur pour utiliser le service LLM global du projet
 * avec l'interface attendue par les agents Vimax.
 */
export class VimaxLLMAdapter implements LLMService {
  constructor(private readonly globalLLM: GlobalLLMService) {}

  /**
   * Génère du contenu en utilisant le service LLM global.
   * Mappe l'interface Vimax vers l'interface globale.
   */
  async generateContent(
    prompt: string,
    systemInstruction?: string,
    responseMimeType?: 'text/plain' | 'application/json',
    images?: { data: string; mimeType: string }[]
  ): Promise<string> {
    return this.globalLLM.generateContent(prompt, systemInstruction, responseMimeType, images)
  }
}
