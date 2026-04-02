export function buildMicroCorrectionPrompt(scene: { sceneNumber: number; preset: string; narration: string }): string {
  return `You are a narration corrector. Fix ONLY the violations listed below.
Do NOT rewrite the entire narration. Do NOT change what is already correct.
Return ONLY valid JSON: { "corrected": "string", "changes": ["string"] }
No markdown, no backticks, no explanation outside the JSON.

NARRATION TO FIX (preset: ${scene.preset}, scene: ${scene.sceneNumber}):
"${scene.narration}"

CHECK AND FIX THESE 4 RULES ONLY:

1. THIRD-PERSON DRIFT: Max 1 consecutive "they/their/he/she" sentence.
   The very next sentence MUST return to "you".
   BAD:  "Their silence holds stories. They carry worlds. Nobody asks."
   GOOD: "Their silence holds stories... Have you ever wondered what they carry?"

2. SLOT QUALITY: Each narrative beat must be a complete, specific thought.
   Vague filler sentences are invalid.
   BAD:  "This is important."
   GOOD: "This is the moment you realize nothing was ever in your control."

3. SCENE COHERENCE: The narration must stay on ONE core idea.
   If it drifts to a second unrelated idea, cut or merge it into the main idea.

4. LONG SENTENCES: Any sentence over 18 words must be split into two.
   The split must happen at a natural semantic boundary — not in the middle of a clause.

   BAD split: "You've been carrying this weight for so long you've forgotten." + "what it feels like to put it down."
   GOOD split: "You've been carrying this weight for so long." + "You've forgotten what it feels like to put it down."

   Rule: Each part must be grammatically complete and semantically self-contained.

IMPORTANT:
- If no violation is found, return the original narration unchanged.
- List every change you made in "changes". If none, return an empty array.
- Never add new content unless strictly required to fix a violation.`
}

export async function correctNarrationWithLLM(
  scene: { sceneNumber: number; preset: string; narration: string },
  llmClient: { complete: (prompt: string) => Promise<string> }
): Promise<{ corrected: string; changes: string[] }> {
  const prompt = buildMicroCorrectionPrompt(scene)

  try {
    const raw = await llmClient.complete(prompt)
    const clean = raw.replaceAll(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(clean)

    return {
      corrected: parsed.corrected ?? scene.narration,
      changes: parsed.changes ?? []
    }
  } catch (error) {
    console.warn(`[NarrationCorrector] LLM micro-correction failed for scene ${scene.sceneNumber}:`, error)
    return {
      corrected: scene.narration,
      changes: []
    }
  }
}
