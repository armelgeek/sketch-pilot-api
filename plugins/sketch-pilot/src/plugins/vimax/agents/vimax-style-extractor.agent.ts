import { VimaxBaseAgent } from '../core/vimax-base.agent'
import { VimaxVisionUtils } from '../utils/vision-utils'
import type { LLMService } from '../core/llm.interface'
import type { StyleLock } from '../types'

/**
 * VimaxStyleExtractor
 * Agent multimodal capable d'extraire un StyleLock (ADN visuel)
 * à partir d'une image de référence.
 */
export class VimaxStyleExtractor extends VimaxBaseAgent {
  public id = 'style-extractor'

  constructor(llm: LLMService) {
    super(llm)
  }

  /**
   * Analyse une image de référence pour en extraire les constantes stylistiques.
   */
  async extractStyle(referenceImageUrl: string): Promise<StyleLock> {
    const prompt = `
[MISSION : EXTRACTION D'ADN VISUEL]
Analyse l'image de référence fournie et extrais un "StyleLock" JSON pour guider un générateur d'images IA.

[DIRECTIVES]
1. STYLE VISUEL : Donne un nom technique précis à l'esthétique (ex: "Whiteboard Sketch", "Noir & Blanc minimaliste", "Aquarelle pastel").
2. PALETTE : Liste les couleurs dominantes.
3. TERMES OBLIGATOIRES : Mots-clés indispensables pour reproduire ce support (ex: "lignes noires", "croquis main", "fond blanc uni").
4. TERMES INTERDITS : Mots-clés à bannir pour éviter tout drift vers le réalisme (ex: "photoréalisme", "ombrage 3D", "dégradés", "textures complexes").

[FORMAT JSON OBLIGATOIRE]
{
  "visualStyle": "chaîne de caractères",
  "colorPalette": ["couleur1", "couleur2"],
  "mandatoryTerms": ["terme1", "terme2", "terme3"],
  "forbiddenTerms": ["terme1", "terme2", "terme3"]
}
`.trim()

    let images: { data: string; mimeType: string }[] | undefined = undefined
    try {
      const img = await VimaxVisionUtils.imageUrlToBase64(referenceImageUrl)
      images = [img]
    } catch {
      console.warn(
        `[VimaxStyleExtractor] Impossible de charger l'image ${referenceImageUrl}, passage en mode texte seul.`
      )
    }

    const result = await this.generateStructured<StyleLock>(
      `[STYLE_EXTRACTION_PROMPT]\n${prompt}`,
      'Tu es un Directeur Artistique expert en analyse de styles visuels et en ingénierie de prompts.',
      {
        visualStyle: 'Standard',
        colorPalette: [],
        mandatoryTerms: [],
        forbiddenTerms: []
      },
      images
    )

    return result.data
  }
}
