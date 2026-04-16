/**
 * series-registry.utils.ts
 *
 * Registry helpers extracted from SeriesVideoGenerator.
 * Fixes:
 *   - findKeyInRegistry: word overlap is now strict (both words ≥ 4 chars, no false positives on short words)
 *   - ContinuityDebtManager: auto-purge of resolved debts
 */

// ─── ID Normalization ─────────────────────────────────────────────────────────

/**
 * Produces a stable @handle from any character/location/asset name.
 * "@Frère Aloysius" → "@frerealoysius"
 * "Victor Leclerc" → "@victorleclerc"
 */
export function normalizeId(id: string): string {
  if (!id) return ''
  const clean = id
    .toLowerCase()
    .trim()
    .replace(/^@/, '')
    .replaceAll(/[\s\-_]+/g, ' ')

  return `@${clean.replaceAll(' ', '')}`
}

// ─── Registry Lookup ──────────────────────────────────────────────────────────

/**
 * Find a value in a registry using normalized ID matching.
 */
export function findInRegistry<T>(registry: Record<string, T>, targetId: string): T | undefined {
  const key = findKeyInRegistry(registry, targetId)
  return key ? registry[key] : undefined
}

/**
 * Find a key in a registry using a multi-strategy matching approach.
 *
 * Strategy order (most → least strict):
 *   1. Direct key match
 *   2. Normalized handle match (@slug === @slug)
 *   3. Slug match (whitespace removed)
 *   4. Word overlap — STRICT: requires words of ≥ 4 chars to avoid false positives
 *   5. fullName field match
 *
 * IMPORTANT: Strategy 4 was the source of bugs. Short words like "le", "la", "de"
 * would match across unrelated entries. The 4-char minimum prevents this.
 */
export function findKeyInRegistry<T>(registry: Record<string, T>, targetId: string): string | undefined {
  if (!targetId) return undefined

  // 1. Direct match
  if (registry[targetId]) return targetId

  const normalizedTarget = normalizeId(targetId)
  const targetSlug = normalizedTarget.replace('@', '')

  for (const [key, value] of Object.entries(registry)) {
    const normalizedKey = normalizeId(key)
    const keySlug = normalizedKey.replace('@', '')

    // 2. Full normalized handle match
    if (normalizedKey === normalizedTarget) return key

    // 3. Slug match (handles compound names like "VictorLeclerc")
    if (keySlug === targetSlug) return key

    // 4. Word overlap — STRICT version
    // Only match words of >= 4 characters to avoid false positives on articles/prepositions
    const keyWords = key
      .toLowerCase()
      .replaceAll(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length >= 4)

    const targetWords = targetId
      .toLowerCase()
      .replace(/^@/, '')
      .replaceAll(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4)

    // Require at least one significant word to match exactly (not just substring)
    const hasExactWordOverlap =
      keyWords.length > 0 &&
      targetWords.length > 0 &&
      (targetWords.some((tw) => keyWords.includes(tw)) || keyWords.some((kw) => targetWords.includes(kw)))

    if (hasExactWordOverlap) return key

    // 5. fullName field match (for objects with a fullName property)
    const valAny = value as any
    if (valAny?.fullName) {
      const normalizedFullName = normalizeId(valAny.fullName)
      if (normalizedFullName === normalizedTarget) return key
    }
  }

  return undefined
}

// ─── Evolution Merge ──────────────────────────────────────────────────────────

export interface EvolutionState {
  state: string
  status?: string
  referenceSceneId?: string
  referenceEpisode?: number
}

export function mergeEvolution(
  base: Record<string, string | EvolutionState>,
  updates: Record<string, string | EvolutionState>,
  episodeNumber?: number
): Record<string, EvolutionState> {
  const merged: Record<string, EvolutionState> = {}

  for (const [key, val] of Object.entries(base || {})) {
    merged[normalizeId(key)] = typeof val === 'string' ? { state: val } : val
  }

  for (const [key, val] of Object.entries(updates || {})) {
    const normalizedKey = normalizeId(key)
    if (typeof val === 'string') {
      merged[normalizedKey] = { state: val, referenceEpisode: episodeNumber }
    } else {
      merged[normalizedKey] = { ...val, referenceEpisode: episodeNumber || val.referenceEpisode }
    }
  }

  return merged
}

// ─── Continuity Debt Manager ──────────────────────────────────────────────────

export interface ContinuityDebt {
  id: string
  description: string
  createdAtEpisode: number
  /** If provided, the debt auto-expires after this episode */
  expiresAtEpisode?: number
  resolved?: boolean
  resolvedAtEpisode?: number
}

/**
 * Manages continuity debts with automatic purging.
 *
 * Fixes the original bug where debts accumulated indefinitely.
 * Resolution flow:
 *   - Debts expire automatically after `expiresAtEpisode`
 *   - Debts can be resolved explicitly via `resolveDebt()`
 *   - `getActiveDebts()` only returns unresolved, non-expired debts
 *   - `toForcedCorrectionBlock()` generates the prompt injection for the next episode
 */
export class ContinuityDebtManager {
  private debts: Map<string, ContinuityDebt> = new Map()
  private episodeNumber: number

  constructor(episodeNumber: number, existingDebts: ContinuityDebt[] = []) {
    this.episodeNumber = episodeNumber
    for (const debt of existingDebts) {
      this.debts.set(debt.id, debt)
    }
  }

  /** Add a new debt from a continuity analysis field */
  addFromAnalysis(type: string, description: string, expiresAfterEpisodes = 2): void {
    const id = `${type}-ep${this.episodeNumber}-${Date.now()}`
    this.debts.set(id, {
      id,
      description: `${type}: ${description}`,
      createdAtEpisode: this.episodeNumber,
      expiresAtEpisode: this.episodeNumber + expiresAfterEpisodes,
      resolved: false
    })
  }

  /** Add multiple debts from a string array (legacy format) */
  addBulk(descriptions: string[], expiresAfterEpisodes = 2): void {
    for (const desc of descriptions) {
      if (desc.trim()) this.addFromAnalysis('debt', desc, expiresAfterEpisodes)
    }
  }

  /** Mark a debt as resolved */
  resolveDebt(id: string): void {
    const debt = this.debts.get(id)
    if (debt) {
      debt.resolved = true
      debt.resolvedAtEpisode = this.episodeNumber
    }
  }

  /** Resolve all debts that contain a given keyword (fuzzy match for auto-resolution) */
  resolveByKeyword(keyword: string): number {
    let count = 0
    for (const debt of this.debts.values()) {
      if (!debt.resolved && debt.description.toLowerCase().includes(keyword.toLowerCase())) {
        debt.resolved = true
        debt.resolvedAtEpisode = this.episodeNumber
        count++
      }
    }
    return count
  }

  /** Get debts that are still active (not resolved, not expired) */
  getActiveDebts(): ContinuityDebt[] {
    return Array.from(this.debts.values()).filter(
      (d) => !d.resolved && (!d.expiresAtEpisode || this.episodeNumber <= d.expiresAtEpisode)
    )
  }

  /** Get all debts for serialization (including resolved/expired for audit) */
  getAllDebts(): ContinuityDebt[] {
    return Array.from(this.debts.values())
  }

  /** Get only the descriptions of active debts (for backward compat with existing string[] fields) */
  getActiveDescriptions(): string[] {
    return this.getActiveDebts().map((d) => d.description)
  }

  /** Generate the forcedCorrection prompt block for the next episode */
  toForcedCorrectionBlock(): string | undefined {
    const active = this.getActiveDebts()
    if (active.length === 0) return undefined
    return `🚨 MISSION DE SOUDURE CORRECTIVE : ${active.map((d) => d.description).join(' ; ')}`
  }

  /**
   * Parse legacy string array of debts into ContinuityDebt objects.
   * Used when migrating from the old flat string[] format.
   */
  static fromLegacyStrings(strings: string[], episodeNumber: number): ContinuityDebtManager {
    const manager = new ContinuityDebtManager(episodeNumber)
    for (const s of strings) {
      manager.addFromAnalysis('legacy', s, 2)
    }
    return manager
  }

  /**
   * Process a continuityAnalysis object from LLM output and add all detected debts.
   */
  ingestContinuityAnalysis(analysis: Record<string, any>): void {
    if (!analysis) return

    const { defects, soudureBrute, assetFantome, logicGap, threatVagueness, pacingIssue, promesseNonTenue, filsMuets } =
      analysis

    if (defects) this.addBulk(defects, 2)
    if (soudureBrute) this.addFromAnalysis('Soudure Brute', soudureBrute, 1)
    if (assetFantome) this.addFromAnalysis('Asset Fantôme', assetFantome, 2)
    if (logicGap) this.addFromAnalysis('Faille Logique', logicGap, 2)
    if (threatVagueness) this.addFromAnalysis('Menace Floue', threatVagueness, 3)
    if (pacingIssue) this.addFromAnalysis('Problème Rythme', pacingIssue, 2)
    if (promesseNonTenue) this.addFromAnalysis('Promesse Non Tenue', promesseNonTenue, 1)
    if (filsMuets)
      this.addBulk(
        filsMuets.map((f: string) => `Fil oublié: ${f}`),
        3
      )
  }
}
