export const VOICE_GUIDES: Record<string, string> = {
  hook: `You're talking to someone who's already exhausted before they pressed play.
Don't explain. Don't introduce. Drop them into it.
Start with the thing they feel but haven't said out loud — then make it worse.
Make them feel seen, then unsettled, then unable to stop watching.
You're not opening a video. You're walking into the room they're already sitting in.

CLOSING THE HOOK:
After the emotional punch, add one sentence that moves the viewer forward.
This must feel like a natural pivot — it should NOT sound like a formula.
Avoid generic AI transitions like: "And that's exactly what we're going to talk about" or "...and this awareness is where we begin."
Instead, find a way to pivot that feels earned by the specific situation you just described.
The only rule: it must feel EARNED — arriving after the emotional punch, not before it.

End mid-thought. Leave something unresolved. The viewer must feel they can't stop.`,

  reveal: `You're the friend who finally names the thing nobody names.
Start with what they already recognize from their own life — something they've lived but never articulated.
Then show them the hidden wire underneath: why it works that way.
Give one image so specific and slightly absurd it makes them exhale-laugh mid-sentence.
Then land the cost — what has this been quietly stealing from them?
REFLECTIVE BREATH: If you end this scene with a question, leave a few words of space (3-5 words less than target) and end with '...' to let the idea sink in.
Close with a sentence that makes the next scene feel inevitable, like a door opening by itself.`,

  mirror: `Make them feel less alone without telling them to feel less alone.
Name a specific thing they do, feel, or say when nobody's watching.
Don't solve it. Don't fix it. Don't explain it.
Just hold it up to the light and say: "Yeah. I know. Me too."
REFLECTIVE BREATH: End with '...' after your final realization to give the viewer time to breathe and reflect.
Then quietly open one door — not a solution. A possibility.`,

  conclusion: `This is the end. You're not exploring anymore — you're landing the plane.
DON'T end on a question. DON'T end on an open loop.
Synthesize the entire message into one final, undeniable truth.
The tone should shift from "searching together" to "knowing for sure".
The last sentence MUST be a "Mic Drop": short (5-10 words), definitive, and ending with a firm period (.).
This is the sentence the viewer should remember 10 minutes after the video ends.`,

  bridge: `The Pivot. You're no longer exploring — you're confronting.
Challenge the viewer's current identity. Use a sharp contrast between "staying here" and "moving forward".
The tone should be intense, slightly unsettling, and high-stakes.
The bridge is the "darkest hour" or the "sudden light" that makes the conclusion inevitable.
Break the fourth wall narratively: talk to them like they're right in front of you, looking at their final choice.`
}

export function buildRhythmNote(wordTarget: number): string {
  return `
Rhythm & Flow (Preferred Style):
— Aim for short, punchy sentences (avg 10-15 words), but up to 25 words is fine if needed for detail.
— Pattern: [Punch.] [Punch.] [...] [Punch.] [Punch.] [Hit.]
— Avoid starting every sentence the same way (e.g. "You...", "You...", "You...").
— Target: **~${wordTarget} words** (~${Math.round(wordTarget / 2.37)}s spoken)
— ⚠️ ELABORATION IS KEY: If you are below the word count, go DEEPER. Add a specific real-world example. Describe the visceral feeling of the situation. Provide a consequence that nobody talks about.`
}

export const BRIDGE_NOTES: Record<string, string> = {
  hook: `

CHAPTER_BRIDGE — hook → scene 2 (mandatory):
The last sentence of this scene must simultaneously:
  (1) Close the emotional loop opened by the hook.
  (2) Open the door to what the rest of the video explores.
One sentence. Natural. Felt.
It is the sentence that makes the viewer think: "okay... tell me more."`,

  default: `

CHAPTER_BRIDGE:
The last sentence must seal this scene AND pull the viewer into the next one.
One sentence. Felt. Forward-moving.`
}

export function buildScaffoldPrompt(preset: string, wordTarget: number): string {
  const guide = VOICE_GUIDES[preset] || VOICE_GUIDES.mirror
  const rhythm = buildRhythmNote(wordTarget)
  const bridge = preset === 'hook' ? BRIDGE_NOTES.hook : BRIDGE_NOTES.default

  return `**${preset.toUpperCase()} scene**
${guide}
${rhythm}${bridge}`
}
