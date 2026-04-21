import type { VimaxPlugin } from '../core/vimax-plugin.interface'
import type { VimaxAgent } from '../pipeline/vimax.agent'
import type { VimaxRunOptions, VimaxScene } from '../types'

/**
 * SeriesContinuityPlugin
 * ----------------------
 * Guardian of spatial and visual identity.
 * Handles location anchoring, persistent decor, and character visual persistence.
 */
export class SeriesContinuityPlugin implements VimaxPlugin {
  id = 'series-continuity'

  onInitialize(agent: VimaxAgent): void {
    console.info(`[VimaxPlugin] ${this.id} initialized.`)
  }

  async onBeforeEpisode(agent: VimaxAgent, event: any, index: number, options: VimaxRunOptions): Promise<void> {
    const context = options.seriesContext
    if (!context) return

    // 1. Inject Registries into the prompt context
    // This helps the Narration agent know which locations/characters exist.
    if (context.locationRegistry) {
      const locations = Object.entries(context.locationRegistry)
        .map(([rawId, loc]) => `- ${rawId}: ${(loc as any).atmosphere || (loc as any).description || ''}`)
        .join('\n')

      agent.narration.addDirective(`
        📍 LIEUX ÉTABLIS (Locations):
        Utilisez PRIORITAIREMENT ces lieux s'ils sont pertinents pour la scène :
        ${locations}
      `)
    }

    if (context.characterRegistry) {
      const characters = Object.entries(context.characterRegistry)
        .map(([rawName, char]) => `- ${rawName}: ${(char as any).description || ''}`)
        .join('\n')

      agent.narration.addDirective(`
        🎭 PERSONNAGES CONNUS (Registry):
        Respectez scrupuleusement la description physique de ces personnages :
        ${characters}
      `)
    }
  }

  async onBeforeScene(agent: VimaxAgent, event: any, sceneNumber: number, options: VimaxRunOptions): Promise<void> {
    const context = options.seriesContext
    if (!context) return

    // 1. Spatial Anchoring
    // If it's the first scene, we might inherit from the last episode's final scene.
    if (sceneNumber === 1 && (context as any).lastEpisodeFinalScene) {
      const last = (context as any).lastEpisodeFinalScene
      agent.screenwriter.addDirective(`
        🔗 CONTINUITÉ DE DÉCOR (Scene 1):
        Héritage immédiat de l'épisode précédent. 
        Lieu : "${last.locationId}". 
        Détails visuels persistants : ${(last.persistentDecorTokens || []).join(', ')}.
        Lumière/Ambiance : ${(last.emotionalTokens || []).join(', ')}.
      `)
    }
  }

  async onAfterScene(agent: VimaxAgent, scene: VimaxScene): Promise<void> {
    console.info(`[VimaxPlugin] ${this.id} analyzed scene ${scene.sceneNumber} in ${scene.locationId}.`)
  }
}
