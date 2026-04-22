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
  onBeforePlanSaga?: (agent: any, idea: string, options: any) => Promise<void>
  onAfterPlanSaga?: (agent: any, plan: any) => Promise<void>

  onBeforeEpisode?: (agent: any, event: any, index: number, options: any) => Promise<void>
  onAfterEpisode?: (agent: any, episode: any, plan?: any) => Promise<void>

  onBeforeScene?: (agent: any, event: any, sceneNumber: number, options: any) => Promise<void>
  onAfterScene?: (agent: any, scene: any) => Promise<void>
}
