import type { VimaxPlugin } from '../core/vimax-plugin.interface'
import type { VimaxAgent } from '../pipeline/vimax.agent'
import type { VimaxEpisode, VimaxRunOptions } from '../types'

/**
 * SeriesNarrativePlugin
 * --------------------
 * High-fidelity narrative orchestrator for episodic sagas.
 * Handles cliffhanger bridges, unresolved threads, and global arc pacing.
 */
export class SeriesNarrativePlugin implements VimaxPlugin {
  id = 'series-narrative'

  onInitialize(agent: VimaxAgent): void {
    console.info(`[VimaxPlugin] ${this.id} initialized.`)
  }

  async onBeforeEpisode(agent: VimaxAgent, event: any, index: number, options: VimaxRunOptions): Promise<void> {
    const context = options.seriesContext
    if (!context) return

    // 1. Inject Previous Episode Bridge
    if (context.lastEpisodeBridge) {
      const bridge = context.lastEpisodeBridge
      agent.narration.addDirective(`
        🚨 PONT NARRATIF (Bridge): 
        L'épisode précédent s'est arrêté sur ce cliffhanger : "${bridge.unresolvedCliffhanger}".
        Assure une transition fluide ou une résolution de cette tension.
        Objets actifs en main : ${bridge.activeObjects.join(', ') || 'Aucun'}.
      `)
    }

    // 2. Inject Unresolved Threads (Plot Contracts)
    const threads = (context as any).unresolvedThreads || []
    if (threads.length > 0) {
      agent.narration.addDirective(`
        📜 CONTRATS DE L'INTRIGUE (Plot Contracts):
        Les fils suivants sont toujours ouverts et doivent être nourris :
        ${threads.map((t: string) => `- ${t}`).join('\n')}
      `)
    }

    // 3. Global Tension & Pacing
    if (context.tensionCurve) {
      const currentPos = (context as any).episodeNumber || 1
      const targetTension = context.tensionCurve[currentPos - 1] || 5
      agent.narration.addDirective(`
        📈 COURBE DE TENSION : 
        Cible de tension pour cet épisode : ${targetTension}/10. 
        Ajustez le rythme et la violence des rebondissements en conséquence.
      `)
    }
  }

  async onAfterEpisode(agent: VimaxAgent, episode: VimaxEpisode): Promise<void> {
    // This hook can be used to analyze the output and update the series bible if needed.
    // However, the actual persistence is usually handled by the VideoWorker or the Generator.
    console.info(`[VimaxPlugin] ${this.id} post-processing episode ${episode.episodeNumber}.`)
  }
}
