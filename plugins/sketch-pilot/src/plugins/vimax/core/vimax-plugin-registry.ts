import type { VimaxHookName, VimaxPlugin } from './vimax-plugin.interface'

export class VimaxPluginRegistry {
  private plugins: VimaxPlugin[] = []

  public register(plugin: VimaxPlugin) {
    if (this.plugins.some((p) => p.id === plugin.id)) {
      console.warn(`[VimaxPluginRegistry] Plugin with ID "${plugin.id}" already registered. Overwriting.`)
      this.plugins = this.plugins.filter((p) => p.id !== plugin.id)
    }
    this.plugins.push(plugin)
  }

  public getPlugins(): VimaxPlugin[] {
    return [...this.plugins]
  }

  public getPlugin<T extends VimaxPlugin>(id: string): T | undefined {
    return this.plugins.find((p) => p.id === id) as T | undefined
  }

  public async triggerHook(hook: VimaxHookName, ...args: any[]) {
    for (const plugin of this.plugins) {
      const hookFn = (plugin as any)[hook]
      if (typeof hookFn === 'function') {
        try {
          await hookFn.apply(plugin, args)
        } catch (error) {
          console.error(`[VimaxPluginRegistry] Error in plugin "${plugin.id}" hook "${hook}":`, error)
        }
      }
    }
  }
}
