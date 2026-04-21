import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { VisualAtmosphere } from '../types'

/**
 * VimaxAtmosphereExtractor
 * Extrait les métadonnées visuelles et d'ambiance d'un script global.
 */
export class VimaxAtmosphereExtractor extends VimaxBaseAgent {
  public id = 'atmosphere-extractor'

  async extractAtmosphere(
    script: string
  ): Promise<{ atmosphere: VisualAtmosphere; visualEvolution: Record<string, string> }> {
    return { atmosphere: {}, visualEvolution: {} }
  }
}
