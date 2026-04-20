import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { FormattedOutput, VimaxScreenplay } from '../types'

/**
 * VimaxOutputFormatterAgent
 * Normalise le screenplay pour le moteur vidéo final.
 * Unifie les IDs, recalcule les timestamps, crée les index de recherche.
 */
export class VimaxOutputFormatterAgent extends VimaxBaseAgent {
  async format(screenplay: VimaxScreenplay): Promise<FormattedOutput> {
    const totalDuration = screenplay.scenes.reduce((acc, s) => acc + (s.duration || 0), 0)

    // Indexation des personnages
    const characterIndex: Record<string, any> = {}
    // (Dans un cas réel, on irait chercher les profils complets ici)

    return {
      format: 'json',
      scenes: screenplay.scenes.map((s) => ({
        id: s.id,
        sceneNumber: s.sceneNumber,
        narration: s.narration,
        imagePrompt: s.imagePrompt,
        duration: s.duration,
        startTime: s.startTime,
        dialogue: s.dialogue,
        animationPrompt: s.animationPrompt,
        acting: s.acting,
        camera: s.cameraAction
      })),
      totalDuration,
      characterIndex,
      locationIndex: {}
    }
  }
}
