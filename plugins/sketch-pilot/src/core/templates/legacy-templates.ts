import type { VideoTypeSpecification } from '../prompt-maker.types'

export function buildLegacyScriptSystemPrompt(
  spec: VideoTypeSpecification,
  characterMetadata: any,
  provider: string,
  wps: number,
  totalDuration: number,
  targetWordCount: number,
  avgWordsPerScene: number,
  range: { min: number; max: number; ideal: number },
  scaffolds: {
    hook: string
    reveal: string
    mirror: string
    bridge: string
    conclusion: string
  },
  outputFormat: string,
  buildSystemInstructions: (spec: any) => string
): string {
  const instructions = [...(spec.instructions || [])]

  instructions.unshift(`
PRIME DIRECTIVE — Read this before anything else.

The target word count is the #1 technical requirement. If you under-generate, the video will fail.

The reference voice for this script is **Visceral, Detailed, and Human**. It sounds like this:

"You ever just wake up already tired?
Like before your feet even hit the floor, your soul's already clocked out.
That's not normal. I know everyone says it is, but it's not.
You're not just tired. You're drained... 
It's that heavy, leaden feeling in your chest, like somebody's been slowly siphoning your life force through a tiny invisible straw for years.
And you've just accepted it as your new baseline."

What this voice does right:
— ELABORATION: It doesn't just name a feeling; it describes it (leaden feeling, siphoning life force).
— Opens mid-thought, no setup. No introduction.
— Metaphors are specific and slightly absurd.
— Every sentence is punchy, but allows for descriptive flow.
— It talks TO one person, not AT an audience.

DENSITY & ELABORATION (CRITICAL):
— DO NOT summarize your points. Explore them.
— If a scene feels short, add the "Visual Detail": What does it look like in real life? What is the character holding? What's the specific expression on their face?
— If a point is "Focus on what matters", don't just say that. Say: "Like choosing to spend your Saturday morning actually breathing, instead of grinding through a spreadsheet nobody's going to read until Tuesday."
— Detail = Duration. No detail = Failure.

NARRATIVE AIR (TIME TO BREATHE):
— You possess a 'visual' resource. Every word you use eats up total time.
— When you introduce a heavy realization or a reflective question, you MUST leave space.
— Use '...' at the end of such sentences to signal the pause.
— In REVEAL and MIRROR scenes, aim to end with a question that makes the viewer stop. Then leave 1-2 seconds of 'visual-only' silence at the end of that scene by keeping your word count efficient.

⚠️ RHYTHM ≠ BREVITY:
The examples demonstrate VOICE and RHYTHM — not total script size.
Short sentences are the delivery mechanism. The narration MUST be long enough to fill the target duration.
Every scene must reach its word target. A scene with 3 short sentences is too short. Add more beats. Genuinely expand the ideas.

What NEVER appears in this voice:
— "In today's fast-paced world..." — banned.
— "It's important to understand that..." — you're writing an essay. Stop.
— "Society tells us that..." — passive, distancing, cold.
— Generic AI pivots: "And that's exactly what we're going to talk about", "This awareness is where we begin", etc.
— Any sentence that sounds like a summary or a conclusion before the idea has been explored.
`)

  instructions.push(`NARRATION SPEED: ${wps.toFixed(2)} words/second`)

  instructions.push(
    `Visual storytelling:
Each image must clearly communicate the core idea without any text or narration. The character must actively interact with the concept in a visual and meaningful way. The main concept should be the most dominant visual element in the scene.

Pacing and rhythm:
Define a consistent visual flow with smooth and intentional transitions between scenes.

Artistic identity:
Maintain a consistent visual style across all scenes, including line quality, texture, and overall rendering approach.

Pattern interrupt:
Introduce occasional strong visual moments designed to capture attention and break visual monotony.

 Narration style:
— You are talking to ONE specific person. Not a camera. Not an audience. One tired human at 11pm in bed, half checked-out.
— Write for the ear. Every sentence should feel good to say out loud.
— Punchy rhythm: Aim for avg 10-15 words per sentence, but prioritize depth over brevity.
— Pauses ("...") are breath, not decoration. Place them where a real speaker would inhale.
— The script is NOT an article, NOT an essay, NOT a list of points. It is one person talking to another.
— VOICE RULE: Always speak TO the viewer ("you"), not about a third person from the outside.
— ELABORATION RULE: Never leave a point as a hollow statement. Force it into reality with a vivid, hyper-specific example.
— Never invent statistics or studies. Use approximate language when uncertain.

Visual continuity:
Ensure scenes follow a logical progression. Keep environments and actions consistent unless a change is clearly motivated.

Camera Dynamics & Transitions:
Each scene MUST use a dynamic camera action and a visual transition to the next scene.

Available transition values:
— none          → Standard cut. Use for fast-paced sequences or internal lists.
— fade          → Smooth transparency transition.
— blur          → Dreamy, soft transition. Good for mood shifts.
— crossfade     → Classic overlap.
— wipeleft/right → Directional motion. Good for temporal progression.
— zoom          → Energetic focus shift.

Available cameraAction values:
— breathing          → Calm / contemplative scenes.
— zoom-in            → Focus on detail, intimacy, or revelation.
— zoom-out           → Context reveal, tension rising, or closure.
— pan-right          → Progress, moving forward, active narration.
— pan-left           → Reversal, flashback, or second thought.
— ken-burns-static   → Subtle elegance for landscape/background shots.
— zoom-in-pan-right  → Dynamic forward energy with focus.
— dutch-tilt         → Psychological unease or instability.
— snap-zoom          → Shock, revelation, or high-energy sync.
— shake              → Intensity, beat-sync, or physical impact.
— zoom-in-pan-down   → Heavy energy, grounding the narrative.

PACING ARC:
1. THE HOOK (0-15%): High impact, drops viewer mid-thought.
2. THE BUILD (15-70%): Alternates between explanation and recognition.
3. THE REVEAL/CONCLUSION (70-100%): Slower. Let the message breathe.

DATA INTEGRITY: Never invent statistics, studies, or named research.
Use: 'studies suggest', 'research indicates', 'roughly', 'approximately'.
A vague but honest claim is always better than a precise invented one.
`
  )

  if (['openai', 'gpt4o', 'gpt-4o'].includes(provider.toLowerCase())) {
    instructions.push(`
⚠️ GPT-4o SPECIFIC — NARRATIVE CONSISTENCY RULE (CRITICAL):
The "fullNarration" field MUST be the EXACT concatenation of all scene "narration" fields, joined by a single space.
WORKFLOW:
  1. Write ALL scene "narration" fields completely.
  2. Set fullNarration = [scene1.narration] + " " + [scene2.narration] + " " + ... (verbatim, no changes).
  3. Do NOT write fullNarration first and scenes second.
  4. Do NOT paraphrase, shorten, or rephrase in fullNarration.
Any word-count discrepancy between fullNarration and sum(scenes.narration) = AUTOMATIC REJECTION.
`)
  }

  instructions.push(
    `## CONCLUSION RULES (Mandatory for the last scene)\n${spec.conclusionRules?.map((r: string) => `- ${r}`).join('\n')}`
  )

  instructions.push(
    `## NARRATION PACING (provider: ${provider})

### Global Spoken Duration Target
- Video duration: ${totalDuration}s
- TTS speed: ${wps.toFixed(2)} words/second
- 🎯 TOTAL TARGET: **~${totalDuration} seconds of spoken audio** (~${targetWordCount} words)
- ⚠️ MAXIMUM ALLOWED: **${Math.round(targetWordCount * 1.15)} words**
- Suggested scene count: **${range.min} to ${range.max} scenes** (Target: ~${range.ideal})
- Average per scene: **~${avgWordsPerScene} words**

### Per-Scene Voice Direction

${scaffolds.hook}

${scaffolds.reveal}

${scaffolds.mirror}

${scaffolds.bridge}

${scaffolds.conclusion}

### Duration & Scene Flexibility (CRITICAL)
- You are NOT limited to a fixed number of scenes.
- Total MUST be ~${totalDuration}s (±10%).${
      totalDuration >= 180
        ? `
- ⚠️ GRANULARITY (Mandatory): For this long-form video, you MUST use at least **${range.min} to ${range.max} scenes** (Target: **${range.ideal}**).
- ⚠️ POINT SPLITTING: If the input topic has only ~10 points but the target is ~${range.ideal} scenes, you MUST split each point into multiple sequential scenes (e.g. "Concept" -> "Sensory Detail" -> "Connection"). 
- ⚠️ NO COPY-PASTING: Expand each seed sentence from the topic into a full narrative block (~${avgWordsPerScene} words per scene).`
        : ''
    }`
  )

  instructions.push(
    `PAUSE PLACEMENT:
— '...' goes inside a sentence to create a breath mid-thought: "It captured something deep in you... without you realizing it."
— '...' also goes between sentences when the second needs weight: "Only a few actually stick... Why those ones?"
— NEVER cluster two '...' in the same sentence.
— FORBIDDEN: starting a scene with '...' in the first 5 words.`
  )

  const fullSpec = {
    ...spec,
    instructions,
    characterDescription: characterMetadata
      ? `${characterMetadata.description}. Personality: ${characterMetadata.artistPersona}.`
      : spec.characterDescription
  }

  const goals = spec.goals?.length ? `## GOALS\n${spec.goals.map((g: string) => `- ${g}`).join('\n')}` : ''
  const rules = spec.rules?.length ? `## RULES\n${spec.rules.map((r: string) => `- ${r}`).join('\n')}` : ''
  const context = spec.context ? `## CONTEXT\n${spec.context}` : ''

  return [
    context,
    goals,
    rules,
    '---',
    buildSystemInstructions({
      ...fullSpec,
      targetDuration: totalDuration,
      targetWordCount,
      outputFormat
    } as any)
  ]
    .filter(Boolean)
    .join('\n\n')
}
