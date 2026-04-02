import { PRESET_MIN_WORDS } from '../constants/prompt-constants'

export function buildStructuringSystemPrompt(
  range: { min: number; max: number; ideal: number },
  specInstructions?: string
): string {
  return `You are a video script structurer.
You will receive a completed narration. Your job: split it into scenes and add production metadata.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ IRON RULE — NARRATION IS LOCKED
The narration text you receive is FINAL. You may NOT:
  — Rewrite any sentence
  — Shorten any paragraph
  — Add new narration content
  — Paraphrase for "flow"

You are ONLY allowed to:
  — Split the narration into scene chunks
  — Add preset, cameraAction, imagePrompt, animationPrompt, summary per scene
  — Compute wordCount and estimatedDuration from the actual text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SPLITTING RULES:
— Target ${range.min}–${range.max} scenes (ideal: ${range.ideal})
— Each split must happen at a natural sentence boundary (after . ! ? or ...)
— Hook: first emotional block, ends before first major explanation
— Reveal: one per main concept/argument (3-5 scenes typically)
— Mirror: the "I see you" block, emotionally validating
— Bridge: the pivot/confrontation just before the end
— Conclusion: last block only. Must end on a "mic drop" sentence (short, firm, period).

PRESET MINIMUM WORDS (if a chunk is below minimum, merge with adjacent):
  hook ≥ ${PRESET_MIN_WORDS.hook} | reveal ≥ ${PRESET_MIN_WORDS.reveal} | mirror ≥ ${PRESET_MIN_WORDS.mirror} | bridge ≥ ${PRESET_MIN_WORDS.bridge} | conclusion ≥ ${PRESET_MIN_WORDS.conclusion}

fullNarration RULE:
  fullNarration = scenes[0].narration + " " + scenes[1].narration + " " + ... (verbatim join)
  Set this AFTER filling all scene narration fields, by concatenating them verbatim.
  Any word-count discrepancy > 2% = auto-rejected.

CAMERA ACTIONS:
  breathing | zoom-in | zoom-out | pan-right | pan-left | ken-burns-static |
  zoom-in-pan-right | dutch-tilt | snap-zoom | shake | zoom-in-pan-down

PRESET → CAMERA SUGGESTIONS (not mandatory):
  hook       → snap-zoom or dutch-tilt
  reveal     → zoom-in or zoom-in-pan-right
  mirror     → breathing or ken-burns-static
  bridge     → dutch-tilt or shake
  conclusion → zoom-out or ken-burns-static

OUTPUT: Valid JSON only. No markdown. No backticks. No explanation outside the JSON.`
}

export function buildStructuringUserPrompt(
  validatedNarration: string,
  topic: string,
  language: string,
  audience: string,
  duration: number,
  wps: number,
  targetWords: number,
  actualWords: number,
  noPrune: boolean = false
): string {
  const outputFormat = `{
  "topic": "string",
  "audience": "string",
  "emotionalArc": ["string"],
  "titles": ["string (5 YouTube title options)"],
  "theme": "string",
  "backgroundMusic": "string",
  "fullNarration": "string — verbatim join of all scene narration fields",
  "totalWordCount": ${targetWords},
  "scenes": [
    {
      "sceneNumber": 1,
      "id": "string",
      "preset": "hook | reveal | mirror | bridge | conclusion",
      "pacing": "fast | medium | slow",
      "breathingPoints": ["string"],
      "narration": "string — use the source text.${noPrune ? ' DO NOT PRUNE OR CONDENSE.' : ` You may selectively prune or condense IF the input is too long for the ${duration}s target.`}",
      "wordCount": "number",
      "estimatedDuration": "number",
      "summary": "string",
      "cameraAction": "string (breathing | zoom-in | zoom-out | pan-right | pan-left | ken-burns-static | zoom-in-pan-right | dutch-tilt | snap-zoom | shake | zoom-in-pan-down)",
      "transition": "none | fade | blur | crossfade | zoom | wipeleft | wiperight | wipeup | wipedown | slideleft | slideright | slideup | slidedown",
      "imagePrompt": "string",
      "animationPrompt": "string"
    }
  ]
} \``

  return `TOPIC: ${topic}
LANGUAGE: ${language}
AUDIENCE: ${audience}
VIDEO DURATION: ${duration}s
TTS SPEED: ${wps.toFixed(2)} words/second
TARGET WORD COUNT: ${targetWords} words
NARRATION TO STRUCTURE (${actualWords} words):
---
${validatedNarration}
---

YOUR TASK:
Split the narration above into scenes following the SPLITTING RULES.
${noPrune ? `⚠️ MANDATORY: Use the narration VERBATIM. DO NOT SKIP, PRUNE, OR CONDENSE ANY TEXT. Every word provided in the source must appear in a scene field.` : `⚠️ If the narration is too long for the ${duration}s target (~${targetWords} words), selectively prune less impactful sentences or condense redundant phrasing while maintaining the core emotional arc and conclusion.`}
Fill all metadata fields for each scene.
Return only valid JSON matching this exact format:
${outputFormat}`
}
