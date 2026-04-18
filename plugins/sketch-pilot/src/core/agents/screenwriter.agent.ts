import type { LLMService } from '../../services/llm'
import type { VideoGenerationOptions } from '../../types/video-script.types'
import type { VideoGenerator } from '../generators/video-generator.abstract'

export class ScreenwriterAgent {
  constructor(
    private readonly llmService: LLMService,
    private readonly promptManager: VideoGenerator
  ) {}

  /**
   * Plans the global arc for a series (Pass 0).
   */
  async planSeriesArc(topic: string, context: any): Promise<any> {
    if ((this.promptManager as any).generateSeriesArc) {
      return await (this.promptManager as any).generateSeriesArc(topic, this.llmService)
    }
    return null
  }

  /**
   * Plans the structural layout of a single episode (Pass 1).
   */
  async planEpisode(seriesArc: any, context: any): Promise<any> {
    if ((this.promptManager as any).generateEpisodePlan) {
      return await (this.promptManager as any).generateEpisodePlan(seriesArc, this.llmService)
    }
    return null
  }

  /**
   * Generates the raw narrative content (Pass 2).
   */
  async writeNarration(topic: string, options: VideoGenerationOptions, context: any): Promise<string> {
    const prompts = (this.promptManager as any).buildTwoPassPrompts(topic, options)
    const response = await this.llmService.generateContent(prompts.pass1.user, prompts.pass1.system, 'application/json')
    return response
  }
}
