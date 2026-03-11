import { MIN_SCENE_DURATION, type CompleteVideoScript, type EnrichedScene } from '../types/video-script.types'

/**
 * Represents validation results for a script
 */
export interface ScriptValidationResult {
  isValid: boolean
  score: number // 0-20
  totalIssues: number
  criticalIssues: string[]
  warnings: string[]
  metrics: {
    narrativeCoherence: number // 0-5
    timingAccuracy: number // 0-5
    visualConsistency: number // 0-5
    sceneBalance: number // 0-5
  }
  recommendations: string[]
}

/**
 * Script validator with comprehensive scoring (0-20)
 */
export class ScriptValidator {
  /**
   * Validates a complete video script and returns detailed scoring
   */
  public validate(script: CompleteVideoScript): ScriptValidationResult {
    const result: ScriptValidationResult = {
      isValid: true,
      score: 20,
      totalIssues: 0,
      criticalIssues: [],
      warnings: [],
      metrics: {
        narrativeCoherence: 0,
        timingAccuracy: 0,
        visualConsistency: 0,
        sceneBalance: 0
      },
      recommendations: []
    }

    // Check 1: Duration compliance (CRITICAL)
    const durationIssues = this.checkDurationCompliance(script)
    result.metrics.timingAccuracy = 5 - durationIssues.length
    result.criticalIssues.push(...durationIssues)

    // Check 2: Scene integrity
    const sceneIssues = this.checkSceneIntegrity(script.scenes)
    result.warnings.push(...sceneIssues.warnings)
    result.criticalIssues.push(...sceneIssues.critical)

    // Check 3: Narrative coherence
    const narrativeScore = this.checkNarrativeCoherence(script.scenes)
    result.metrics.narrativeCoherence = narrativeScore
    if (narrativeScore < 3) {
      result.criticalIssues.push('Narrative coherence is low - scenes may feel disconnected')
    }

    // Check 4: Visual consistency
    const visualScore = this.checkVisualConsistency(script.scenes)
    result.metrics.visualConsistency = visualScore
    if (visualScore < 2) {
      result.warnings.push('Visual elements lack consistency across scenes')
    }

    // Check 5: Scene balance
    const balanceScore = this.checkSceneBalance(script.scenes)
    result.metrics.sceneBalance = balanceScore
    if (balanceScore < 2) {
      result.warnings.push('Scene durations are unbalanced')
    }

    // Calculate total score from metrics (0-20)
    const avgMetrics =
      (result.metrics.narrativeCoherence +
        result.metrics.timingAccuracy +
        result.metrics.visualConsistency +
        result.metrics.sceneBalance) /
      4
    result.score = Math.round(avgMetrics * 4) // Scale 0-5 to 0-20

    // Count issues
    result.totalIssues = result.criticalIssues.length + result.warnings.length

    // Generate recommendations
    result.recommendations = this.generateRecommendations(result)

    // Set validity
    result.isValid = result.criticalIssues.length === 0

    return result
  }

  /**
   * Check if total duration matches specified range (CRITICAL)
   */
  private checkDurationCompliance(script: CompleteVideoScript): string[] {
    const issues: string[] = []
    const epsilon = 0.5 // Allow 0.5s tolerance

    // Check if totalDuration is defined and reasonable
    if (!Number.isFinite(script.totalDuration)) {
      issues.push('Total duration is not a valid number')
      return issues
    }

    // Verify sum of scene durations matches totalDuration
    const sceneDurationSum = script.scenes.reduce((acc, scene) => {
      if (scene.timeRange?.end) {
        return Math.max(acc, scene.timeRange.end)
      }
      return acc
    }, 0)

    const diff = Math.abs(sceneDurationSum - script.totalDuration)
    if (diff > epsilon) {
      issues.push(
        `Total duration mismatch: script says ${script.totalDuration.toFixed(1)}s but scenes sum to ${sceneDurationSum.toFixed(1)}s`
      )
    }

    // Check that all scenes have valid timeRanges
    script.scenes.forEach((scene, idx) => {
      if (!scene.timeRange || !Number.isFinite(scene.timeRange.start) || !Number.isFinite(scene.timeRange.end)) {
        issues.push(`Scene ${idx + 1} (${scene.id}) has invalid timeRange`)
      } else if (scene.timeRange.start >= scene.timeRange.end) {
        issues.push(`Scene ${idx + 1} (${scene.id}) has inverted timeRange`)
      }
    })

    return issues
  }

  /**
   * Check scene integrity (narration, expressions, props, etc)
   */
  private checkSceneIntegrity(scenes: EnrichedScene[]): { critical: string[]; warnings: string[] } {
    const critical: string[] = []
    const warnings: string[] = []

    scenes.forEach((scene, idx) => {
      const sceneLabel = `Scene ${idx + 1} (${scene.id})`

      // Check narration exists and is reasonable
      if (!scene.narration || scene.narration.trim().length < 5) {
        critical.push(`${sceneLabel}: Missing or too short narration`)
      }

      // Check for minimum scene duration
      const duration = (scene.timeRange?.end || 0) - (scene.timeRange?.start || 0)
      if (duration < MIN_SCENE_DURATION) {
        warnings.push(`${sceneLabel}: Duration ${duration.toFixed(1)}s is below minimum ${MIN_SCENE_DURATION}s`)
      }

      // Check for redundant props
      if (scene.props && scene.props.length > 3) {
        warnings.push(`${sceneLabel}: More than 3 props (${scene.props.length}) - may clutter visuals`)
      }

      // Check for missing expression
      if (!scene.expression) {
        warnings.push(`${sceneLabel}: Missing character expression`)
      }

      // Check for invalid actions
      if (!scene.actions || scene.actions.length === 0) {
        warnings.push(`${sceneLabel}: No character actions defined`)
      }
    })

    return { critical, warnings }
  }

  /**
   * Rate narrative coherence (0-5)
   * Checks for: topic continuity, semantic flow, transition smoothness
   */
  private checkNarrativeCoherence(scenes: EnrichedScene[]): number {
    if (scenes.length === 0) return 0

    let score = 5
    let issues = 0

    // Check for abrupt topic shifts
    for (let i = 1; i < scenes.length; i++) {
      const prev = scenes[i - 1].narration || ''
      const curr = scenes[i].narration || ''

      const prevWords = new Set(prev.toLowerCase().split(/\s+/))
      const currWords = curr.toLowerCase().split(/\s+/)

      // Calculate word overlap (simple semantic similarity)
      const overlap = currWords.filter((w) => prevWords.has(w)).length
      const overlapRatio = overlap / Math.max(currWords.length, 1)

      // If overlap is less than 20%, there might be a continuity issue
      if (overlapRatio < 0.15 && prev.length > 10 && curr.length > 10) {
        issues++
      }
    }

    // Penalty based on transitions
    score -= Math.min(issues * 0.5, 2)

    // Check for narrative arc (should have intro, middle, conclusion)
    const hasIntro = scenes.length > 0 && (scenes[0].narration || '').length > 10
    const hasConclusion = scenes.length > 0 && (scenes.at(-1).narration || '').length > 10

    if (!hasIntro) score -= 1
    if (!hasConclusion && scenes.length > 2) score -= 0.5

    // Check for reasonable pacing (not all scenes too short)
    const avgWords = scenes.reduce((acc, s) => acc + (s.narration || '').split(/\s+/).length, 0) / scenes.length
    if (avgWords < 3) score -= 1 // Very sparse

    return Math.max(0, Math.round(score * 10) / 10)
  }

  /**
   * Rate visual consistency (0-5)
   * Checks for: character consistency, prop reuse, expression variety
   */
  private checkVisualConsistency(scenes: EnrichedScene[]): number {
    if (scenes.length === 0) return 0

    let score = 5

    // Check character variant consistency
    const variants = new Set(scenes.map((s) => s.characterVariant))
    if (variants.size > 2) {
      score -= 1 // Too many character variants
    }

    // Check props continuity (should reuse some)
    const allProps = new Set<string>()
    let propReuse = 0
    for (const scene of scenes) {
      if (scene.props) {
        for (const prop of scene.props) {
          if (allProps.has(prop)) {
            propReuse++
          }
          allProps.add(prop)
        }
      }
    }

    if (allProps.size > 0 && propReuse === 0) {
      score -= 1 // No prop reuse across scenes
    }

    // Check expression variety
    const expressions = new Set(scenes.map((s) => s.expression?.toLowerCase()).filter(Boolean))
    if (expressions.size < 2 && scenes.length > 3) {
      score -= 0.5 // Too little expression variety
    }

    return Math.max(0, Math.round(score * 10) / 10)
  }

  /**
   * Rate scene balance (0-5)
   * Checks for: even pacing, no scene too long or short
   */
  private checkSceneBalance(scenes: EnrichedScene[]): number {
    if (scenes.length === 0) return 0

    const durations = scenes.map((s) => (s.timeRange?.end || 0) - (s.timeRange?.start || 0))
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length

    let score = 5

    // Check for scenes that deviate too much from average
    const outliers = durations.filter((d) => Math.abs(d - avgDuration) > avgDuration * 0.5)
    if (outliers.length > scenes.length * 0.3) {
      score -= 2 // Many outliers
    } else if (outliers.length > scenes.length * 0.15) {
      score -= 1 // Some outliers
    }

    // Check for dead scenes (too short)
    const tooShort = durations.filter((d) => d < MIN_SCENE_DURATION * 1.5)
    if (tooShort.length > 0) {
      score -= Math.min(tooShort.length * 0.3, 1)
    }

    return Math.max(0, Math.round(score * 10) / 10)
  }

  /**
   * Generate specific recommendations based on validation results
   */
  private generateRecommendations(result: ScriptValidationResult): string[] {
    const recs: string[] = []

    if (result.metrics.narrativeCoherence < 3) {
      recs.push('🔗 Improve transitions between scenes - add connecting phrases')
    }

    if (result.metrics.timingAccuracy < 3) {
      recs.push('⏱️  Ensure all scene durations align with narration word count')
    }

    if (result.metrics.visualConsistency < 3) {
      recs.push('🎨 Improve visual consistency - use consistent character variants and props')
    }

    if (result.metrics.sceneBalance < 3) {
      recs.push('⚖️  Balance scene durations - avoid extreme variations')
    }

    if (result.totalIssues > 5) {
      recs.push('🔄 Consider regenerating the script with refined prompts')
    }

    return recs
  }

  /**
   * Generate a human-readable report
   */
  public generateReport(script: CompleteVideoScript): string {
    const result = this.validate(script)

    const lines: string[] = [
      `\n╔════════════════════════════════════════════════════════════╗`,
      `║          📊 SCRIPT VALIDATION REPORT                        ║`,
      `╚════════════════════════════════════════════════════════════╝`,
      ``,
      `📌 Title: ${script.titles[0]}`,
      `⏱️  Duration: ${script.totalDuration.toFixed(1)}s | 🎬 Scenes: ${script.sceneCount}`,
      `${result.isValid ? '✅ VALID' : '❌ INVALID'}  | Score: ${result.score}/20`,
      ``,
      `📈 Metrics:`,
      `  • Narrative Coherence:  ${this.renderScore(result.metrics.narrativeCoherence)}/5`,
      `  • Timing Accuracy:      ${this.renderScore(result.metrics.timingAccuracy)}/5`,
      `  • Visual Consistency:   ${this.renderScore(result.metrics.visualConsistency)}/5`,
      `  • Scene Balance:        ${this.renderScore(result.metrics.sceneBalance)}/5`,
      ``
    ]

    if (result.criticalIssues.length > 0) {
      lines.push(`⚠️  CRITICAL ISSUES (${result.criticalIssues.length}):`)
      result.criticalIssues.forEach((issue) => lines.push(`   • ${issue}`))
      lines.push(``)
    }

    if (result.warnings.length > 0) {
      lines.push(`⚡ Warnings (${result.warnings.length}):`)
      result.warnings.slice(0, 5).forEach((warning) => lines.push(`   • ${warning}`))
      if (result.warnings.length > 5) {
        lines.push(`   ... and ${result.warnings.length - 5} more`)
      }
      lines.push(``)
    }

    if (result.recommendations.length > 0) {
      lines.push(`💡 Recommendations:`)
      result.recommendations.forEach((rec) => lines.push(`   ${rec}`))
      lines.push(``)
    }

    lines.push(`────────────────────────────────────────────────────────────`)

    return lines.join('\n')
  }

  /**
   * Render a score as a bar chart
   */
  private renderScore(score: number): string {
    const filled = Math.round(score)
    const empty = 5 - filled
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`
  }
}
