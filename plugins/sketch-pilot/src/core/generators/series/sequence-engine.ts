import type { SceneData } from './series-script.schema'

/**
 * SequenceEngine v17.5
 * Manages continuous cinematic flow and forced continuity across scenes.
 */
export class SequenceEngine {
  /**
   * Performs a strict audit on a list of scenes to ensure sequence coherence.
   */
  public static auditSequences(scenes: SceneData[]): { isValid: boolean; issues: string[] } {
    const issues: string[] = []
    const sequences = new Map<string, SceneData[]>()

    // Group scenes by sequenceId
    for (const scene of scenes) {
      if (scene.sequenceId) {
        if (!sequences.has(scene.sequenceId)) {
          sequences.set(scene.sequenceId, [])
        }
        sequences.get(scene.sequenceId)!.push(scene)
      }
    }

    // Validate each sequence
    for (const [seqId, seqScenes] of sequences.entries()) {
      // 1. Check progress continuity
      let lastProgress = 0
      for (const scene of seqScenes) {
        if (scene.sequenceProgress === undefined) {
          issues.push(`Scene ${scene.id} in sequence ${seqId} is missing sequenceProgress.`)
          continue
        }

        if (scene.sequenceProgress <= lastProgress) {
          issues.push(
            `Scene ${scene.id} in sequence ${seqId} has non-increasing progress (${scene.sequenceProgress} follows ${lastProgress}).`
          )
        }
        lastProgress = scene.sequenceProgress
      }

      // 2. Forced Continuity: Same location, same characters
      const firstScene = seqScenes[0]
      for (let i = 1; i < seqScenes.length; i++) {
        const scene = seqScenes[i]

        if (scene.locationId !== firstScene.locationId) {
          issues.push(`Sequence ${seqId} breaking location: ${scene.locationId} vs ${firstScene.locationId}.`)
        }

        const firstChars = new Set(firstScene.charactersInScene || [])
        const currentChars = new Set(scene.charactersInScene || [])

        if (firstChars.size !== currentChars.size || ![...firstChars].every((c) => currentChars.has(c))) {
          issues.push(`Sequence ${seqId} character drift detected between scenes ${firstScene.id} and ${scene.id}.`)
        }
      }

      // 3. Progression Rule Check (Setup -> Tension -> Interaction -> Emotion)
      const maxProgress = Math.max(...seqScenes.map((s) => s.sequenceProgress || 0))
      if (maxProgress > 4) {
        issues.push(`Sequence ${seqId} exceeds standard 4-step progression limit (Current: ${maxProgress}).`)
      }

      // 4. Director: Cinematic Audit (v17.6)
      issues.push(...SequenceEngine.auditCinematicProgression(seqId, seqScenes))

      // 5. Director: Micro-Delta Audit (v17.6)
      issues.push(...SequenceEngine.auditMicroDeltas(seqId, seqScenes))

      // 6. Visual DNA: Anchoring Audit (v17.7)
      issues.push(...SequenceEngine.auditVisualDNA(seqId, seqScenes))
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }

  /**
   * Director: Checks if shot types follow the 1->4 progression logic.
   */
  private static auditCinematicProgression(seqId: string, scenes: SceneData[]): string[] {
    const issues: string[] = []
    for (const scene of scenes) {
      const progress = scene.sequenceProgress || 0
      const shot = scene.shotType?.toUpperCase() || ''

      if (progress === 1 && (shot === 'CLOSEUP' || shot === 'EXTREME_CLOSEUP')) {
        issues.push(
          `Sequence ${seqId} (Setup): Shot "${shot}" is too tight for a setup phase (Scene ${scene.id}). Prefer WIDE/MEDIUM.`
        )
      }

      if (progress === 4 && (shot === 'WIDE' || shot === 'ESTABLISHING')) {
        issues.push(
          `Sequence ${seqId} (Emotion): Shot "${shot}" is too loose for an emotional climax (Scene ${scene.id}). Prefer CLOSEUP.`
        )
      }
    }
    return issues
  }

  /**
   * Director: Checks if deltas are correctly distributed.
   */
  private static auditMicroDeltas(seqId: string, scenes: SceneData[]): string[] {
    const issues: string[] = []
    const lastScene = scenes.at(-1)
    if (!lastScene) return issues

    for (let i = 0; i < scenes.length - 1; i++) {
      const scene = scenes[i]
      const delta =
        typeof scene.sceneDelta === 'string' ? scene.sceneDelta : (scene.sceneDelta as any)?.newInformation || ''

      if (delta.length > 200) {
        issues.push(
          `Sequence ${seqId} (Micro-Delta): Scene ${scene.id} contains a large delta. Intermediate scenes should only have micro-evolutions.`
        )
      }
    }

    if (!lastScene.sceneDelta) {
      issues.push(`Sequence ${seqId}: Final scene ${lastScene.id} is missing its primary narrative delta.`)
    }

    return issues
  }

  /**
   * Visual DNA: Checks if static anchors are maintained.
   */
  private static auditVisualDNA(seqId: string, scenes: SceneData[]): string[] {
    const issues: string[] = []
    if (scenes.length < 2) return issues

    const firstScene = scenes[0]
    const anchors = this.extractPotentialAnchors(firstScene.imagePrompt)

    if (anchors.length === 0) return issues

    for (let i = 1; i < scenes.length; i++) {
      const scene = scenes[i]
      const prompt = scene.imagePrompt.toLowerCase()
      const matches = anchors.filter((a) => prompt.includes(a.toLowerCase()))

      if (matches.length === 0 && scene.shotType !== 'CLOSEUP' && scene.shotType !== 'EXTREME_CLOSEUP') {
        issues.push(
          `Sequence ${seqId} (Visual DNA): Scene ${scene.id} lost all visual anchors from the reference. Include elements like: ${anchors.join(', ')}.`
        )
      }
    }

    return issues
  }

  private static extractPotentialAnchors(prompt: string): string[] {
    const commonAnchors = ['pillar', 'statue', 'hieroglyph', 'altar', 'torch', 'fire', 'wall', 'temple', 'throne']
    return commonAnchors.filter((a) => prompt.toLowerCase().includes(a))
  }

  /**
   * Generates a correction prompt if sequences are broken.
   */
  public static generateCorrectionPrompt(issues: string[]): string {
    return `🚨 RÉPARATION DE SÉQUENCE REQUISE :\n${issues.map((i) => `- ${i}`).join('\n')}\n\nRappel : Une séquence (sequenceId identique) DOIT garder le même lieu et les mêmes personnages, avec un sequenceProgress croissant (1->4).`
  }
}
