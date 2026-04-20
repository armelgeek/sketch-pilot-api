export const VIMAX_VERSION = '1.0.0'

// ─── Core ────────────────────────────────────
export type { LLMService } from './core/llm.interface'
export { VimaxBaseAgent } from './core/vimax-base.agent'

// ─── Agents ──────────────────────────────────
export { VimaxSagaPlanner } from './agents/vimax-saga-planner.agent'
export { VimaxScriptEnhancer } from './agents/vimax-script-enhancer.agent'
export { VimaxEventExtractor } from './agents/vimax-event-extractor.agent'
export { VimaxCharacterExtractor } from './agents/vimax-character-extractor.agent'
export { VimaxNarrationAgent } from './agents/vimax-narration.agent'
export { VimaxSagaCompressor } from './agents/vimax-saga-compressor.agent'
export { VimaxScreenwriter } from './agents/vimax-screenwriter.agent'

// ─── Pipeline ────────────────────────────────
export { VimaxAgent } from './pipeline/vimax.agent'

// ─── Types ───────────────────────────────────
export * from './types'
