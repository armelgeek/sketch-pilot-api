export interface Anchor {
  id: string
  url: string
  type: 'base' | 'progressive' | 'coupled'
}

export interface CoherenceState {
  baseAnchor?: Anchor
  lastGeneratedAnchor?: Anchor
  chainCount: number
  maxChainLength: number
  reanchorThreshold: number
}

/**
 * AnchorEngine implements the "Coherence System" described in the visual guide.
 * It manages "mini-chains" and "re-anchoring" to ensure sufficient visual coherence
 * while preventing cumulative drift in image generation.
 */
export class AnchorEngine {
  private state: CoherenceState

  constructor(options: { maxChainLength?: number; reanchorThreshold?: number } = {}) {
    this.state = {
      chainCount: 0,
      maxChainLength: options.maxChainLength || 6,
      reanchorThreshold: options.reanchorThreshold || 4
    }
  }

  /**
   * Sets the stable base anchor. This image will be used as a primary structural reference.
   * Promotion of a "Human Choice" variant often sets it as the new Base Anchor.
   */
  public registerBaseAnchor(url: string, id: string = 'base-anchor'): void {
    if (!url) {
      console.error('[AnchorEngine] ❌ Error: Cannot register base anchor without a valid URL.')
      return
    }
    console.log(`[AnchorEngine] ⚓ Registering NEW Base Anchor: ${id}`)
    this.state.baseAnchor = { id, url, type: 'base' }
    this.state.chainCount = 0
    this.state.lastGeneratedAnchor = undefined
  }

  /**
   * Dynamically updates the configuration limits.
   */
  public setConfig(options: { maxChainLength?: number; reanchorThreshold?: number }): void {
    if (options.maxChainLength !== undefined) {
      if (options.maxChainLength < 1) {
        console.error('[AnchorEngine] ❌ Error: maxChainLength must be at least 1')
        return
      }
      console.log(`[AnchorEngine] ⚙️  Updating maxChainLength: ${options.maxChainLength}`)
      this.state.maxChainLength = options.maxChainLength
    }
    if (options.reanchorThreshold !== undefined) {
      if (options.reanchorThreshold < 1) {
        console.error('[AnchorEngine] ❌ Error: reanchorThreshold must be at least 1')
        return
      }
      console.log(`[AnchorEngine] ⚙️  Updating reanchorThreshold: ${options.reanchorThreshold}`)
      this.state.reanchorThreshold = options.reanchorThreshold
    }
  }

  /**
   * Returns the current chain "pressure" as a percentage (0-100).
   */
  public getChainPressure(): number {
    return Math.min(100, (this.state.chainCount / this.state.maxChainLength) * 100)
  }

  /**
   * Resolves the set of reference images to use for the next scene generation.
   * Following the "Visual Chaining" rules:
   * 1. Always use BASE_ANCHOR for global structure.
   * 2. Use PREVIOUS_SCENE for progressive chaining.
   * 3. Trigger RE-ANCHOR coupling every N steps (resetting the chain).
   */
  public getNextAnchors(): { url: string; name: string }[] {
    const anchors: { url: string; name: string }[] = []

    if (!this.state.baseAnchor) {
      console.error('[AnchorEngine] ⚠️  Warning: getNextAnchors() called without a base anchor.')
      return []
    }

    // Rule: Always anchor to the stable base
    anchors.push({ url: this.state.baseAnchor.url, name: 'BASE_ANCHOR' })

    if (this.state.lastGeneratedAnchor) {
      const isReanchorStep = this.state.chainCount > 0 && this.state.chainCount % this.state.reanchorThreshold === 0

      if (isReanchorStep) {
        // Re-anchor coupling: Base + latest result
        console.log(`[AnchorEngine] 🔄 RE-ANCHOR: Coupling Base with Scene ${this.state.lastGeneratedAnchor.id}`)
        anchors.push({ url: this.state.lastGeneratedAnchor.url, name: 'REANCHOR_COUPLING' })
      } else {
        // Normal progressive chain: Previous -> Next
        anchors.push({ url: this.state.lastGeneratedAnchor.url, name: 'PREVIOUS_SCENE' })
      }
    }

    return anchors
  }

  /**
   * Records the result of a generation to update the progressive chain.
   */
  public registerGenerationResult(url: string, sceneId: string): void {
    if (!this.state.baseAnchor) {
      console.error('[AnchorEngine] ❌ Error: Cannot register generation result without a base anchor.')
      return
    }

    if (!url) {
      console.error(`[AnchorEngine] ❌ Error: Invalid URL for scene ${sceneId}`)
      return
    }

    this.state.lastGeneratedAnchor = { id: sceneId, url, type: 'progressive' }
    this.state.chainCount++

    // Prevent extreme drift by resetting chain if it exceeds maxChainLength
    if (this.state.chainCount >= this.state.maxChainLength) {
      console.log(
        `[AnchorEngine] ⚠️ Chain length limit reached (${this.state.maxChainLength}). Resetting chain to Base.`
      )
      this.state.chainCount = 0
      this.state.lastGeneratedAnchor = undefined
    }
  }

  /**
   * Force a chain reset (manual re-anchor).
   */
  public resetChain(): void {
    if (this.state.chainCount === 0 && !this.state.lastGeneratedAnchor) {
      console.warn('[AnchorEngine] ⚠️  resetChain() called on already empty chain.')
      return
    }
    console.log(`[AnchorEngine] 🧹 Manual chain reset (Chain count was: ${this.state.chainCount}).`)
    this.state.chainCount = 0
    this.state.lastGeneratedAnchor = undefined
  }

  /**
   * Promotes a "best" variant to become the new Base Anchor for the next mini-chains.
   * This is the "Human Selection" control layer.
   */
  public promoteToBase(url: string, sceneId: string): void {
    if (!url) {
      console.error('[AnchorEngine] ❌ Error: Cannot promote to base without a valid URL.')
      return
    }
    console.log(`[AnchorEngine] 🏆 Promoting ${sceneId} to BASE ANCHOR.`)
    this.registerBaseAnchor(url, sceneId)
  }

  /**
   * Returns true if the current state would trigger a re-anchor coupling.
   */
  public isReanchorStep(): boolean {
    return this.state.chainCount > 0 && this.state.chainCount % this.state.reanchorThreshold === 0
  }

  public getState(): CoherenceState {
    return { ...this.state }
  }
}
