export type VimaxHookName =
  | 'onInitialize'
  | 'onBeforePlanSaga'
  | 'onAfterPlanSaga'
  | 'onBeforeEpisode'
  | 'onAfterEpisode'
  | 'onBeforeScene'
  | 'onAfterScene'

export interface VimaxPlugin {
  id: string

  onInitialize?: (agent: any) => void | Promise<void>

  // Lifecycle Hooks
  onBeforePlanSaga?: (idea: string, options: any) => Promise<void>
  onAfterPlanSaga?: (plan: any) => Promise<void>

  onBeforeEpisode?: (event: any, index: number, context: any) => Promise<void>
  onAfterEpisode?: (episode: any) => Promise<void>

  onBeforeScene?: (event: any, sceneNumber: number) => Promise<void>
  onAfterScene?: (scene: any) => Promise<void>
}
