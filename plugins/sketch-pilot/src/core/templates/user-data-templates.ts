export function buildHardConstraint(
  targetWordCount: number,
  targetDuration: number,
  effectiveWps: number,
  range: { min: number; max: number; ideal: number },
  presetMinWords: { hook: number; reveal: number; mirror: number; bridge: number; conclusion: number }
): string {
  return [
    `⛔ HARD CONSTRAINT — WORD COUNT (violating this = automatic rejection on any attempt):`,
    `   Total narration across ALL scenes: **~${targetWordCount} words** (~${targetDuration}s at ${effectiveWps.toFixed(1)} w/s).`,
    `   • Scene count: **flexible from ${range.min} to ${range.max} scenes** (Target: ~${range.ideal}).`,
    `   • ⚠️ GRANULARITY: For this ${targetDuration}s video, you MUST use at least **${range.min} to ${range.max} scenes** (Target: **${range.ideal}**).`,
    `   • ⚠️ POINT SPLITTING: Split each point of the input topic into multiple scenes. DO NOT do a 1:1 mapping.`,
    `   • Preset minimums (per scene): hook ≥ ${presetMinWords.hook} | reveal ≥ ${presetMinWords.reveal} | mirror ≥ ${presetMinWords.mirror} | bridge ≥ ${presetMinWords.bridge} | conclusion ≥ ${presetMinWords.conclusion} words.`,
    `   • ⚠️ BRIDGE: Use a 'bridge' scene just before the end to pivot and build final tension.`,
    `   • ⚠️ FINAL SCENE: The last scene MUST use the **conclusion** preset for a definitive resolution.`,
    `   • Any scene under its preset minimum = auto-rejected.`,
    `   • After writing each scene: count words, divide by ${effectiveWps.toFixed(1)} = spoken seconds.`,
    `   • Check your running total before moving to the next scene.`,
    `   • You are free to use as many scenes as required (within the ${range.min}-${range.max} range) — but total words MUST reach ${targetWordCount}.`,
    ``
  ].join('\n')
}
