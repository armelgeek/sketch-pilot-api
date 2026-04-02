import * as Constants from '../constants/prompt-constants'

export function buildRetryFeedback(
  validationError: string,
  attempt: number,
  scenes: Array<{ preset?: string; narration?: string; wordCount?: number; sceneNumber?: number }> | undefined,
  targetWords: number,
  actualWords: number,
  wps: number
): string {
  const targetDuration = Math.round(targetWords / wps)
  const actualDuration = Math.round(actualWords / wps)
  const deficit = targetWords - actualWords
  const missingSeconds = Math.max(0, targetDuration - actualDuration)

  const failingSceneNumbers: number[] = []
  const sceneMatches = Array.from(validationError.matchAll(/Scene\s+(\d+)/gi))
  for (const match of sceneMatches) {
    const n = parseInt(match[1], 10)
    if (!failingSceneNumbers.includes(n)) failingSceneNumbers.push(n)
  }

  const sceneDiagnoses: string[] = []

  if (failingSceneNumbers.length > 0 && scenes) {
    for (const sceneNum of failingSceneNumbers) {
      const scene = scenes.find((s) => (s.sceneNumber ?? 0) === sceneNum) ?? scenes[sceneNum - 1]
      const preset = scene?.preset ?? 'mirror'
      const currentWords = scene?.wordCount ?? scene?.narration?.trim().split(/\s+/).filter(Boolean).length ?? 0
      const currentDuration = Math.round(currentWords / wps)
      const minWords = (Constants.PRESET_MIN_WORDS as any)[preset] || 15
      const minSentences = (Constants.PRESET_MIN_SENTENCES as any)[preset] || 1
      const targetSceneDuration = Math.round(minWords / wps)

      sceneDiagnoses.push(
        `  • Scene ${sceneNum} (preset: ${String(preset)}):` +
          `\n      Current: ~${currentWords} words (~${currentDuration}s spoken)` +
          `\n      Required: ≥${minWords} words (~${targetSceneDuration}s) / ≥${minSentences} sentences` +
          `\n      Deficit: ~${Math.max(0, targetSceneDuration - currentDuration)} seconds of missing narration`
      )
    }
  } else if (validationError) {
    sceneDiagnoses.push(`  Raw validation error: ${validationError}`)
  }

  const overallLong = actualWords > targetWords * 1.12

  const mandatoryRules = [
    `1. ${
      overallLong
        ? `TRIM every scene — merge content or remove filler.`
        : `Expand failing scenes — go deeper into the core idea. More specific. More human.`
    }`,
    `2. Every "reveal" scene needs: observation → explanation → one absurd-specific image → consequence → bridge.`,
    `3. Every "mirror" scene needs: name the feeling → normalize it → open one door.`,
    `4. Every "hook" scene needs: drop them in mid-thought → twist the knife → closing sentence that moves forward → leave unresolved.`,
    `5. Each content beat = ${overallLong ? 'exactly 1' : 'minimum 1'} full sentence. A one-word beat is invalid.`,
    `6. "..." counts as punctuation, NOT as a word. Do NOT pad with dots.`,
    `7. ${
      overallLong
        ? 'DENSE & PUNCHY: fewer words, more precision. Cut adverbs. Cut filler.'
        : 'DO NOT reproduce the same short narrations. Genuinely expand the ideas.'
    }`,
    `8. After writing each scene, estimate its spoken duration (~${wps.toFixed(1)} words/second) — it must match the target.`,
    `9. THIRD-PERSON DRIFT: Max 1 consecutive "they/their/he/she" sentence — return to "you" immediately after.`,
    `10. PAUSE DENSITY: Every scene needs ≥2 '...' markers.`,
    `11. HOOK CLOSING: Last sentence of hook must move the viewer forward — a promise, a question, or a pivot. A dead-end closing is invalid.`,
    `12. ORPHAN SENTENCE: No scene ends on <5 words unless preceded by '...'.`
  ]

  if (validationError.includes('NARRATIVE INCONSISTENCY')) {
    mandatoryRules.push(
      `⚠️ ALIGNMENT: Your 'fullNarration' and the sum of 'scenes' MUST be identical text. No discrepancies allowed.`
    )
  }

  mandatoryRules.push(
    `⚠️ VERBATIM ALIGNMENT (NARRATIVE CONSISTENCY):
    1. Write ALL scene "narration" fields first.
    2. Set "fullNarration" = EXACT copy of all narrations joined by a single space.
    3. No paraphrasing, no rephrasing, no "summary" in fullNarration.
    4. Any drift > 2% between the sum of scenes and fullNarration = AUTO-REJECTION.`
  )

  mandatoryRules.push(`
DATA CHECK: Review every statistic and percentage in your script.
If you are not certain it is a real established figure, replace it with approximate language now.
  `)

  return `
╔══════════════════════════════════════════════════════════════════════╗
║  🚨 ATTEMPT ${attempt} FAILED — MANDATORY CORRECTIONS BEFORE REGENERATING  ║
╚══════════════════════════════════════════════════════════════════════╝

SPOKEN DURATION: Your script runs ~${actualDuration}s. It must run ~${targetDuration}s.
${
  missingSeconds > 0
    ? `❌ You are missing ~${missingSeconds} seconds of spoken narration (≈${deficit} words).`
    : actualWords > targetWords * 1.15
      ? `❌ Your script is ~${actualDuration - targetDuration}s TOO LONG (≈${actualWords - targetWords} extra words).`
      : `✅ Total duration is acceptable, but structural rules were violated (see below).`
}

FAILING SCENES:
${sceneDiagnoses.join('\n\n')}

MANDATORY RULES FOR THIS RETRY:
${mandatoryRules.join('\n')}

  EXPANSION TECHNIQUE (when scenes are too short):
    - Go deeper into one specific moment: "Imagine the feeling of..."
    - Add the consequence that nobody talks about
    - Give the one image so specific it borders on absurd
    - Name the thing they do at 2am that they've never told anyone

  TRIMMING TECHNIQUES (when scenes are too long):
    - Remove adverbs. Remove qualifiers. Remove any sentence that repeats the previous one.
    - If two sentences say the same thing, keep the more specific one.

  Regenerate the COMPLETE script with ALL scenes. Do not truncate.
`.trim()
}
