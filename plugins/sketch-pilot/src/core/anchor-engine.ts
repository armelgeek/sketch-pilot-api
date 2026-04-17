export interface Anchor {
  id: string
  url: string
  type: 'base' | 'progressive' | 'coupled'
}

export type AnchorMode = 'STRUCTURE_ONLY' | 'STRUCTURE_PLUS_EVOLUTION'

export interface DynamicState {
  positions?: string[]
  changes?: string[]
  damages?: string[]
  cameraShift?: string
  emotionalTone?: string
}

export interface BaseState {
  lighting?: string
  atmosphere?: string
  persistentElements?: string[]
}

export interface StateLock {
  mustPersist?: string[]
  forbiddenChanges?: string[]
}

export interface WorldState {
  stableAnchor: string
  dynamicState: DynamicState
  baseState?: BaseState
  stateLock?: StateLock
}

export interface CoherenceState {
  baseAnchor?: Anchor
  lastGeneratedAnchor?: Anchor
  chainCount: number
  maxChainLength: number
  reanchorThreshold: number
  mode: AnchorMode
  worldState?: WorldState
}

/**
 * AnchorEngine implements the "Coherence System" described in the visual guide.
 * It manages "mini-chains" and "re-anchoring" to ensure sufficient visual coherence
 * while preventing cumulative drift in image generation.
 */
export class AnchorEngine {
  private state: CoherenceState
  private namedAnchors: Map<string, Anchor> = new Map()

  constructor(options: { maxChainLength?: number; reanchorThreshold?: number } = {}) {
    this.state = {
      chainCount: 0,
      maxChainLength: options.maxChainLength || 6,
      reanchorThreshold: options.reanchorThreshold || 4,
      mode: 'STRUCTURE_PLUS_EVOLUTION'
    }
  }

  public setMode(mode: AnchorMode): void {
    console.log(`[AnchorEngine] 🧩 Switching mode to: ${mode}`)
    this.state.mode = mode
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
    this.state.worldState = {
      stableAnchor: url,
      dynamicState: {}
    }
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
   * Registers a named anchor (e.g. for a character or specific location part).
   * These anchors persist across chain resets until overwritten.
   */
  public registerNamedAnchor(name: string, url: string, id: string = 'named'): void {
    if (!url) return
    console.log(`[AnchorEngine] 🏷️  Registering NAMED Anchor [${name}]: ${id}`)
    this.namedAnchors.set(name, { id, url, type: 'coupled' })
  }

  public getNamedAnchors(): { url: string; name: string }[] {
    return Array.from(this.namedAnchors.entries()).map(([name, anchor]) => ({
      url: anchor.url,
      name: `IDENTITY:${name}`
    }))
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

    // Rule 2: Named identity anchors (Characters/Assets)
    this.getNamedAnchors().forEach((a) => anchors.push(a))

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
   * Registers a narrative "Delta" to evolve the dynamic state.
   */
  public registerDelta(delta: DynamicState, base?: BaseState, lock?: StateLock): void {
    if (!this.state.worldState) return

    console.log('[AnchorEngine] ⚡ Registering Delta + V4 States:', { delta, base, lock })
    this.state.worldState.dynamicState = {
      ...this.state.worldState.dynamicState,
      ...delta,
      positions: [...new Set([...(this.state.worldState.dynamicState.positions || []), ...(delta.positions || [])])],
      changes: [...new Set([...(this.state.worldState.dynamicState.changes || []), ...(delta.changes || [])])],
      damages: [...new Set([...(this.state.worldState.dynamicState.damages || []), ...(delta.damages || [])])]
    }

    if (base) {
      this.state.worldState.baseState = {
        ...this.state.worldState.baseState,
        ...base,
        persistentElements: [
          ...new Set([
            ...(this.state.worldState.baseState?.persistentElements || []),
            ...(base.persistentElements || [])
          ])
        ]
      }
    }

    if (lock) {
      this.state.worldState.stateLock = {
        ...this.state.worldState.stateLock,
        ...lock,
        mustPersist: [
          ...new Set([...(this.state.worldState.stateLock?.mustPersist || []), ...(lock.mustPersist || [])])
        ],
        forbiddenChanges: [
          ...new Set([...(this.state.worldState.stateLock?.forbiddenChanges || []), ...(lock.forbiddenChanges || [])])
        ]
      }
    }
  }

  /**
   * Generates technical hints for the image generator based on current WorldState.
   */
  public getEvolutionHints(): string {
    if (!this.state.worldState || this.state.mode === 'STRUCTURE_ONLY') return ''

    const ws = this.state.worldState
    const ds = ws.dynamicState
    const bs = ws.baseState
    const sl = ws.stateLock
    const hints: string[] = []

    // 1. Base State (Stable Truth)
    if (bs?.lighting) hints.push(`LIGHTING: ${bs.lighting}`)
    if (bs?.atmosphere) hints.push(`ATMOSPHERE: ${bs.atmosphere}`)
    if (bs?.persistentElements?.length) hints.push(`STABLE TRUTH: ${bs.persistentElements.join(', ')}`)

    // 2. Dynamic Delta (Evolution)
    if (ds.changes?.length) hints.push(`EVOLUTION: ${ds.changes.join(', ')}`)
    if (ds.damages?.length) hints.push(`DAMAGES: ${ds.damages.join(', ')}`)
    if (ds.positions?.length) hints.push(`POSITIONS: ${ds.positions.join(', ')}`)
    if (ds.cameraShift) hints.push(`CAMERA: ${ds.cameraShift}`)
    if (ds.emotionalTone) hints.push(`TONE: ${ds.emotionalTone}`)

    // 3. State Lock (Anti-Hallucination)
    if (sl?.mustPersist?.length || sl?.forbiddenChanges?.length) {
      hints.push('\n🔒 CONTINUITY LOCKS (CRITICAL) :')
      if (sl?.mustPersist?.length) {
        sl.mustPersist.forEach((p) => hints.push(`- NE CHANGE PAS : ${p}`))
      }
      if (sl?.forbiddenChanges?.length) {
        sl.forbiddenChanges.forEach((f) => hints.push(`- INTERDICTION DE : ${f}`))
      }
    }

    return hints.length > 0
      ? `\n\n--- 🛡️ VISUAL COHERENCE SYSTEM (V4) ---\n${hints.join('\n')}\nRule: Follow LOCKS strictly. Prioritize TRUTH over mutation.`
      : ''
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
