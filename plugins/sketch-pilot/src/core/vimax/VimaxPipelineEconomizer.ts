export enum VimaxEconomizerMode {
  CINEMATIC = 'cinematic', // Full 15-agent pipeline (Maximum Quality)
  PROFESSIONAL = 'professional', // 8-10 agents (Balanced Cost/Quality)
  DRAFT = 'draft' // 3-5 agents (Budget Mode / Fast Prototyping)
}

/**
 * VimaxPipelineEconomizer
 * Logic to consolidate agent calls and skip redundant passes to save tokens/cost.
 */
export class VimaxPipelineEconomizer {
  constructor(public mode: VimaxEconomizerMode = VimaxEconomizerMode.DRAFT) {}

  public getRequiredAgents(): string[] {
    switch (this.mode) {
      case VimaxEconomizerMode.DRAFT:
        return ['sagaPlanner', 'eventExtractor', 'sceneExtractor', 'screenwriter']
      case VimaxEconomizerMode.PROFESSIONAL:
        return [
          'sagaPlanner',
          'eventExtractor',
          'sceneExtractor',
          'screenwriter',
          'storyboardArtist',
          'decomposer',
          'memory'
        ]
      case VimaxEconomizerMode.CINEMATIC:
      default:
        return ['all']
    }
  }

  public shouldSkipAudit(): boolean {
    return this.mode === VimaxEconomizerMode.DRAFT
  }

  public shouldSkipEnhancement(): boolean {
    return this.mode === VimaxEconomizerMode.DRAFT || this.mode === VimaxEconomizerMode.PROFESSIONAL
  }

  public shouldConsolidateNarrative(): boolean {
    return this.mode === VimaxEconomizerMode.DRAFT
  }
}
