export function getConsolidatedOutputFormat(
  targetWordCountTotal: number,
  effectiveWps: number,
  effectiveDuration: number
): string {
  return `{
      "topic": "string",
      "audience": "string",
      "emotionalArc": ["string"],
      "titles": ["string"],
      "fullNarration": "string — ⚠️ CRITICAL: Exact concatenation of all scene narration fields joined by a single space. Write scenes first, then copy verbatim. DO NOT write independently. Must produce ~${effectiveDuration}s of spoken audio.",
      "totalWordCount": "number (self-reported total. Must be within ±10% of ${targetWordCountTotal} words / ~${effectiveDuration}s spoken. ⛔ Counts below ${Math.round(targetWordCountTotal * 0.85)} = auto-rejected)",
      "theme": "string",
      "backgroundMusic": "string",
      "scenes": [
        {
          "sceneNumber": 1,
          "id": "string",
          "preset": "hook | reveal | mirror | bridge | conclusion",
          "pacing": "fast | medium | slow",
          "breathingPoints": ["string (e.g. 'after sentence 2', 'before the consequence')"],
          "narration": "string — write this scene fully before moving to the next",
          "wordCount": "number — word count of this narration field",
          "estimatedDuration": "number (words ÷ ${effectiveWps.toFixed(1)} — spoken seconds for this scene)",
          "summary": "string",
          "cameraAction": "string (breathing | zoom-in | zoom-out | pan-right | pan-left | ken-burns-static | zoom-in-pan-right | dutch-tilt | snap-zoom | shake | zoom-in-pan-down)",
          "imagePrompt": "string (Detailed visual prompt)",
          "animationPrompt": "string"
        }
      ]
    }`
}
