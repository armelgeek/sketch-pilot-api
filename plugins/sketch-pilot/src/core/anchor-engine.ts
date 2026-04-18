// AnchorEngineV2.ts

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface Anchor {
  id: string
  url: string
  type: 'base' | 'progressive' | 'coupled'
}

export type AnchorMode = 'STRUCTURE_ONLY' | 'STRUCTURE_PLUS_EVOLUTION'

export type MutationLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'

export type SceneIntent = 'STATIC' | 'ACTION' | 'REVEAL' | 'TRANSITION' | 'EMOTIONAL_BEAT'

export type CameraFraming =
  | 'WIDE'
  | 'MEDIUM'
  | 'CLOSE_UP'
  | 'EXTREME_CLOSE_UP'
  | 'DYNAMIC_ANGLE'
  | 'POV'
  | 'OVER_THE_SHOULDER'
  | 'LOW_ANGLE'
  | 'HIGH_ANGLE'
  | 'BIRD_EYE'

// ─────────────────────────────────────────────────────────────
// STATES
// ─────────────────────────────────────────────────────────────

export interface DynamicState {
  // CURRENT STATE (dominant)
  currentPosition?: string
  currentAction?: string
  emotionalTone?: string

  // VISUAL CONTROL
  cameraShift?: string
  framing?: CameraFraming
  sceneIntent?: SceneIntent
  mutationLevel?: MutationLevel
  framingContinuity?: boolean // If true, framing MUST be preserved from previous

  // HISTORY (weakly influential)
  changes?: string[]
  damages?: string[]
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

// ─────────────────────────────────────────────────────────────
// ENGINE
// ─────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────

  public setMode(mode: AnchorMode): void {
    this.state.mode = mode
  }

  public registerBaseAnchor(url: string, id: string = 'base-anchor'): void {
    if (!url) return

    this.state.baseAnchor = { id, url, type: 'base' }
    this.state.chainCount = 0
    this.state.lastGeneratedAnchor = undefined

    this.state.worldState = {
      stableAnchor: url,
      dynamicState: {}
    }
  }

  public registerNamedAnchor(name: string, url: string, id: string = name): void {
    if (!url) return
    this.namedAnchors.set(name, { id, url, type: 'coupled' })
  }

  public hasNamedAnchor(name: string): boolean {
    return this.namedAnchors.has(name)
  }

  private getNamedAnchors() {
    return Array.from(this.namedAnchors.entries()).map(([name, a]) => ({
      url: a.url,
      name: `IDENTITY:${name}`
    }))
  }

  public getChainPressure(): number {
    return Math.min(100, (this.state.chainCount / this.state.maxChainLength) * 100)
  }

  // ─────────────────────────────────────────
  // 🔥 CORE FIX: SMART ANCHOR SELECTION
  // ─────────────────────────────────────────

  public getNextAnchors(): { url: string; name: string }[] {
    const anchors: { url: string; name: string }[] = []
    const pressure = this.getChainPressure()
    const ds = this.state.worldState?.dynamicState

    if (!this.state.baseAnchor) return []

    // 1. BASE ANCHOR (Adaptive weight)
    // We always keep the base anchor as a reference to prevent total visual drift,
    // but we label it as 'STYLE_REFERENCE' at high pressure to allow for compositional creativity.
    const baseWeight = ds?.mutationLevel === 'HIGH' ? 50 : 85
    if (pressure < baseWeight) {
      anchors.push({ url: this.state.baseAnchor.url, name: 'BASE_ANCHOR_STRICT' })
    } else {
      anchors.push({ url: this.state.baseAnchor.url, name: 'BASE_STYLE_REFERENCE' })
    }

    // 2. IDENTITIES (Always coupled)
    this.getNamedAnchors().forEach((a) => anchors.push(a))

    // 3. PROGRESSIVE CONTINUITY
    const last = this.state.lastGeneratedAnchor

    if (last) {
      if (this.isReanchorStep()) {
        anchors.push({ url: last.url, name: 'REANCHOR_COUPLING' })
      } else if (ds?.sceneIntent === 'REVEAL') {
        // For REVEAL, we use a weak coupling to avoid sticking too much to previous frame
        anchors.push({ url: last.url, name: 'PREVIOUS_WEAK' })
      } else if (pressure < 30) {
        anchors.push({ url: last.url, name: 'PREVIOUS_STRONG' })
      } else if (pressure < 70) {
        anchors.push({ url: last.url, name: 'PREVIOUS_MEDIUM' })
      } else {
        anchors.push({ url: last.url, name: 'PREVIOUS_WEAK' })
      }
    }

    return anchors
  }

  // ─────────────────────────────────────────
  // 🧠 STATE UPDATE (NO MORE MICRO CHANGE BUG)
  // ─────────────────────────────────────────

  public registerDelta(delta: DynamicState, base?: BaseState, lock?: StateLock): void {
    if (!this.state.worldState) return

    const prev = this.state.worldState.dynamicState

    this.state.worldState.dynamicState = {
      ...prev,

      // overwrite = vérité actuelle
      currentPosition: delta.currentPosition ?? prev.currentPosition,
      currentAction: delta.currentAction ?? prev.currentAction,
      emotionalTone: delta.emotionalTone ?? prev.emotionalTone,
      cameraShift: delta.cameraShift ?? prev.cameraShift,
      framing: delta.framing ?? prev.framing,
      sceneIntent: delta.sceneIntent ?? prev.sceneIntent,
      mutationLevel: delta.mutationLevel ?? prev.mutationLevel,
      framingContinuity: delta.framingContinuity ?? prev.framingContinuity,

      // historique limité (Semantic DNA)
      changes: [...new Set([...(prev.changes || []), ...(delta.changes || [])])].slice(-3),
      damages: [...new Set([...(prev.damages || []), ...(delta.damages || [])])].slice(-3)
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
        ...lock
      }
    }
  }

  // ─────────────────────────────────────────
  // 🎬 CINEMATIC PROMPT ENGINE
  // ─────────────────────────────────────────

  public getEvolutionHints(): string {
    if (!this.state.worldState || this.state.mode === 'STRUCTURE_ONLY') return ''

    const { dynamicState: ds, baseState: bs, stateLock: sl } = this.state.worldState

    const hints: string[] = []

    hints.push('--- 🎬 CINEMATIC ANCHOR ENGINE V3 ---')
    hints.push('PRIORITY HIERARCHY:')
    hints.push('1. [CRITICAL] STATE LOCKS & INVARIANTS')
    hints.push('2. [DOMINANT] CURRENT SCENE REALITY')
    hints.push('3. [BASE] GLOBAL ENVIRONMENT')
    hints.push('4. [CONTEXT] SEMANTIC HISTORY')

    // ─── 1. LOCKS ───────────────────────────────────────────
    if (sl?.mustPersist?.length || sl?.forbiddenChanges?.length) {
      hints.push('\n🔒 LOCKS (DO NOT DEVIATE):')
      sl.mustPersist?.forEach((p) => hints.push(`✅ PERSIST: ${p}`))
      sl.forbiddenChanges?.forEach((f) => hints.push(`🚫 FORBIDDEN: ${f}`))
    }

    // ─── 2. DOMINANT CURRENT STATE ──────────────────────────
    hints.push('\n👁️ CURRENT DOMINANT REALITY:')
    if (ds.currentPosition) hints.push(`📍 POSITION: ${ds.currentPosition}`)
    if (ds.currentAction) hints.push(`🏃 ACTION: ${ds.currentAction}`)
    if (ds.emotionalTone) hints.push(`🎭 TONE: ${ds.emotionalTone}`)

    // ─── 3. MUTATION & FRAMING ──────────────────────────────
    hints.push('\n🎥 CINEMATOGRAPHY:')
    if (ds.framing) {
      const framingInfo = ds.framingContinuity ? `(KEEP SCALE: ${ds.framing})` : `(SET SCALE: ${ds.framing})`
      hints.push(`📐 FRAMING: ${ds.framing} ${framingInfo}`)
    }
    if (ds.cameraShift) hints.push(`🎥 CAMERA MOTION: ${ds.cameraShift}`)

    // Mutation specific directives
    switch (ds.mutationLevel) {
      case 'HIGH':
        hints.push('⚡ MUTATION [HIGH]: Radical change allowed. Break previous composition. New angle/perspective.')
        break
      case 'MEDIUM':
        hints.push('🔄 MUTATION [MEDIUM]: Noticeable evolution. Move subjects, change lighting details.')
        break
      case 'LOW':
        hints.push(
          '⚖️ MUTATION [LOW]: High consistency required. Maintain background assets, textures, lighting and overall composition. Anti-drift active.'
        )
        break
      case 'NONE':
        hints.push(
          '🔒 MUTATION [NONE]: Absolute visual freeze. Background and secondary elements MUST remain identical to references. No morphing allowed.'
        )
        break
    }

    // ─── 4. BASE STATE ────────────────────────────────────
    hints.push('\n🌍 AMBIENT CONTEXT:')
    if (bs?.lighting) hints.push(`💡 LIGHTING: ${bs.lighting}`)
    if (bs?.atmosphere) hints.push(`🌫️ ATMOSPHERE: ${bs.atmosphere}`)
    if (bs?.persistentElements?.length) {
      hints.push(`🗿 ENVIRONMENT: ${bs.persistentElements.join(', ')}`)
    }

    // ─── 5. SEMANTIC HISTORY (Anti-Drift) ─────────────────
    if (ds.changes?.length || ds.damages?.length) {
      hints.push('\n📜 RECENT EVOLUTIONS (DO NOT REPEAT):')
      ds.changes?.forEach((c) => hints.push(`- Change: ${c}`))
      ds.damages?.forEach((d) => hints.push(`- Damage/Impact: ${d}`))
    }

    return `\n${hints.join('\n')}\n--- END ENGINE SIGNAL ---`
  }

  // ─────────────────────────────────────────
  // 🎞️ AUTO SHOT PLANNER (OPTIONAL)
  // ─────────────────────────────────────────

  public suggestNextShot(): Partial<DynamicState> {
    const pressure = this.getChainPressure()
    const cycle = Math.floor(this.state.chainCount % 4)

    // Cinematic Cycle: Wide -> Medium -> Close -> Dynamic/Extreme
    switch (cycle) {
      case 0:
        return { framing: 'WIDE', mutationLevel: 'MEDIUM', sceneIntent: 'STATIC' }
      case 1:
        return { framing: 'MEDIUM', mutationLevel: 'LOW', sceneIntent: 'ACTION' }
      case 2:
        return { framing: 'CLOSE_UP', mutationLevel: 'LOW', sceneIntent: 'EMOTIONAL_BEAT' }
      case 3:
      default:
        return {
          framing: pressure > 60 ? 'EXTREME_CLOSE_UP' : 'DYNAMIC_ANGLE',
          mutationLevel: 'HIGH',
          sceneIntent: 'REVEAL'
        }
    }
  }

  // ─────────────────────────────────────────

  public registerGenerationResult(url: string, sceneId: string): void {
    if (!this.state.baseAnchor || !url) return

    this.state.lastGeneratedAnchor = { id: sceneId, url, type: 'progressive' }
    this.state.chainCount++

    if (this.state.chainCount >= this.state.maxChainLength) {
      this.resetChain()
    }
  }

  public resetChain(): void {
    this.state.chainCount = 0
    this.state.lastGeneratedAnchor = undefined
    this.compressState()
  }

  private compressState() {
    const ds = this.state.worldState?.dynamicState
    if (!ds) return

    ds.changes = ds.changes?.slice(-2)
    ds.damages = ds.damages?.slice(-2)
  }

  public promoteToBase(url: string, sceneId: string): void {
    this.registerBaseAnchor(url, sceneId)
  }

  public isReanchorStep(): boolean {
    return this.state.chainCount > 0 && this.state.chainCount % this.state.reanchorThreshold === 0
  }

  public getState(): CoherenceState {
    return { ...this.state }
  }
}
