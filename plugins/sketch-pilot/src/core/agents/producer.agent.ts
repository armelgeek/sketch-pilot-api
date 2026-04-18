import * as fs from 'node:fs'
import { SeriesHallucinationSentinel } from '../generators/series/series-sentinel'
import type { ImageService } from '../../services/image'
import type { SeriesContext } from '../generators/series-video-generator'

export class ProducerAgent {
  constructor(
    private readonly imageService: ImageService,
    private readonly context?: SeriesContext
  ) {}

  /**
   * Audits a script for narrative and visual continuity hallucinations.
   */
  async auditHallucinations(script: any): Promise<{ isValid: boolean; feedback?: string }> {
    if (!this.context) return { isValid: true }

    const report = SeriesHallucinationSentinel.audit(script, this.context)
    if (!report.isValid) {
      return {
        isValid: false,
        feedback: SeriesHallucinationSentinel.generateCorrectionPrompt(report)
      }
    }
    return { isValid: true }
  }

  /**
   * Performs a Vision Audit on a generated frame to extract visual DNA or check consistency.
   */
  async performVisionAudit(imagePath: string, locId: string): Promise<string | null> {
    if (!fs.existsSync(imagePath)) return null
    if (!this.imageService.analyzeImage) return null

    const visionPrompt = `Describe the stable visual elements of this location for a storyboard generator. Focus on decor, architectural style, key colors, lighting, and layout. Avoid mentioning characters or temporary actions. Keep it concise (max 3 sentences).`

    try {
      const dna = await this.imageService.analyzeImage(imagePath, visionPrompt)
      return dna
    } catch (error) {
      console.error(`[ProducerAgent] Vision audit failed for ${locId}:`, error)
      return null
    }
  }

  /**
   * Manages the visual registry updates (Promotion logic).
   */
  async updateRegistry(locId: string, visualDNA: string): Promise<void> {
    if (!this.context || !this.context.locationRegistry) return

    const loc = this.context.locationRegistry[locId]
    if (loc) {
      loc.visualDNA = visualDNA
      // Trigger registry sync if necessary
      if ((this.context as any).syncRegistriesFromVision) {
        await (this.context as any).syncRegistriesFromVision({
          locations: { [locId]: visualDNA }
        })
      }
    }
  }
}
