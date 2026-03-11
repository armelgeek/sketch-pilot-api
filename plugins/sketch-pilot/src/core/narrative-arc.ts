/**
 * Narrative Arc System
 *
 * Defines specialized narrative structures for all 9 video types and 16 genres/niches.
 * Each arc is a sequence of scene roles with descriptions, purpose, and storytelling guidance.
 * The system scales arcs to fit the requested scene count.
 */

import type { VideoGenre, VideoType } from '../types/video-script.types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single scene role within a narrative arc
 */
export interface NarrativeSceneRole {
  /** Unique role identifier */
  role: string
  /** Display label shown in prompts */
  label: string
  /** What this scene must accomplish narratively */
  purpose: string
  /** Key storytelling techniques for this scene */
  techniques: string[]
  /** Suggested visual direction / energy */
  visualGuidance: string
  /** Whether this scene is required (cannot be compressed away) */
  required: boolean
}

/**
 * Complete narrative arc for a video type
 */
export interface NarrativeArc {
  videoType: VideoType
  name: string
  description: string
  /** Ordered scene roles — full arc at maximum scene count */
  scenes: NarrativeSceneRole[]
  /** Overall storytelling principle */
  storytellingPrinciple: string
  /** Hook strategy — how to grab attention in scene 1 */
  hookStrategy: string
  /** Closing strategy — how to end memorably */
  closingStrategy: string
}

/**
 * Genre-specific storytelling modifier
 */
export interface GenreStorytelling {
  videoGenre: VideoGenre
  toneDescription: string
  narrativeStyle: string
  audienceExpectation: string
  pacing: 'slow' | 'medium' | 'fast' | 'dynamic'
  emotionalRegister: string
  languageStyle: string
  mustInclude: string[]
  mustAvoid: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Narrative Arcs — one per video type
// ─────────────────────────────────────────────────────────────────────────────

export const NARRATIVE_ARCS: Record<VideoType, NarrativeArc> = {
  tutorial: {
    videoType: 'tutorial',
    name: 'Step-by-Step Tutorial Arc',
    description: 'A structured, pedagogical arc that takes the viewer from zero knowledge to confident execution.',
    storytellingPrinciple:
      'Every scene teaches exactly ONE concept or action. The viewer must feel capable, not overwhelmed.',
    hookStrategy: 'Show the end-result first — what the viewer will be able to do after watching.',
    closingStrategy: 'Recap the key steps with a clear call-to-action encouraging the viewer to try immediately.',
    scenes: [
      {
        role: 'hook_result',
        label: 'Hook — Show the End Result',
        purpose: 'Immediately demonstrate the final outcome so viewers know what they will achieve.',
        techniques: ['Reveal the result before explaining the process', 'Pose the question "Want to know how?"'],
        visualGuidance: 'Dramatic reveal — character displaying finished result with surprise or pride.',
        required: true
      },
      {
        role: 'overview',
        label: 'Overview — What You Will Learn',
        purpose: 'Set expectations. List the steps or topics coming up so the viewer knows the roadmap.',
        techniques: ['Numbered checklist visual', 'Preview each step briefly'],
        visualGuidance: 'Character pointing at a visible roadmap or numbered list on screen.',
        required: true
      },
      {
        role: 'step_1',
        label: 'Step 1 — Foundation / Setup',
        purpose: 'Teach the first concrete action. Validate why this step matters.',
        techniques: ['Show before/after of this step', 'Common mistake to avoid'],
        visualGuidance: 'Character demonstrating action with a prop or tool clearly visible.',
        required: true
      },
      {
        role: 'step_2',
        label: 'Step 2 — Core Action',
        purpose: 'Teach the central technique or most important step.',
        techniques: ['Visual metaphor to simplify complexity', 'Slow-motion emphasis on key movement'],
        visualGuidance: 'Close-up or zoom-in on the action. Character focused and purposeful.',
        required: false
      },
      {
        role: 'step_3',
        label: 'Step 3 — Refinement / Pro Tip',
        purpose: 'Add a nuance or expert insight that elevates the result from good to excellent.',
        techniques: ['Contrast beginner vs expert approach', '"This is what most people miss..."'],
        visualGuidance: 'Character in professor mode — pointing at a key detail or tip.',
        required: false
      },
      {
        role: 'recap_cta',
        label: 'Recap & Call to Action',
        purpose: 'Summarize the steps concisely and inspire the viewer to take action right now.',
        techniques: ['Quick visual recap (1–3 words per step)', 'Direct CTA: "Try it now", "Share if helpful"'],
        visualGuidance: 'Character energized, arms open or pointing at viewer. Checklist visible.',
        required: true
      }
    ]
  },

  story: {
    videoType: 'story',
    name: 'Cinematic Story Arc',
    description:
      'A narrative arc that builds emotional investment through character journey and meaningful resolution.',
    storytellingPrinciple:
      'Every great story needs a character who wants something, faces obstacles, and is changed by the journey.',
    hookStrategy: 'Start in the middle of a tension point — drop the viewer into a moment of suspense or curiosity.',
    closingStrategy:
      'End with a universal truth or emotional resonance that makes the story feel personally meaningful.',
    scenes: [
      {
        role: 'hook_in_medias_res',
        label: 'Hook — In Media Res (Start in Tension)',
        purpose: 'Drop the viewer into a high-stakes or emotionally charged moment to create immediate investment.',
        techniques: ['Start mid-action, not from the beginning', 'Pose a compelling "what happens next?" question'],
        visualGuidance: 'Character in a dramatic pose — surprised, running, or facing a critical decision.',
        required: true
      },
      {
        role: 'setup_context',
        label: 'Setup — Characters & World',
        purpose: 'Introduce the protagonist, their desire, and the world they inhabit. Make the viewer care.',
        techniques: ["Show character's normal life before the disruption", 'Establish what is at stake'],
        visualGuidance: 'Character in their everyday environment. Relatable, ordinary scene.',
        required: true
      },
      {
        role: 'inciting_incident',
        label: 'Inciting Incident — The Problem Appears',
        purpose: 'The moment that disrupts the normal world and forces the character to act.',
        techniques: ['Visual contrast: before vs after the disruption', 'Show the emotional reaction clearly'],
        visualGuidance: 'Character reacting to a sudden change — shock, fear, determination.',
        required: true
      },
      {
        role: 'rising_action',
        label: 'Rising Action — Struggle & Attempts',
        purpose: 'The character tries to solve the problem and fails or partially succeeds. Build tension.',
        techniques: ['Show effort and failure before success', 'Use visual metaphors for internal conflict'],
        visualGuidance: 'Dynamic, kinetic scene — character in motion, struggling against opposition.',
        required: false
      },
      {
        role: 'climax',
        label: 'Climax — The Turning Point',
        purpose: 'The highest tension moment. Everything changes here.',
        techniques: ['Maximum emotional intensity', 'Contrast: the character before vs now'],
        visualGuidance: 'Full-frame dramatic action. Bold, high-energy visual composition.',
        required: true
      },
      {
        role: 'resolution_lesson',
        label: 'Resolution & Universal Lesson',
        purpose: 'Resolve the conflict and deliver the universal takeaway that makes the story worth telling.',
        techniques: ["Connect the story's lesson to the viewer's own life", 'End on an emotionally satisfying note'],
        visualGuidance: 'Character transformed — calm, empowered, or at peace. Clear symbolic visual.',
        required: true
      }
    ]
  },

  listicle: {
    videoType: 'listicle',
    name: 'Ranked List Arc',
    description: 'A punchy, scannable arc that delivers value through numbered items with mounting impact.',
    storytellingPrinciple: 'Each item must be more surprising or valuable than the last. Save the best for the end.',
    hookStrategy: 'Promise a specific, concrete benefit: "3 things X people never tell you about Y."',
    closingStrategy: 'Deliver the most unexpected or highest-value item last. End with a "bonus" or twist.',
    scenes: [
      {
        role: 'hook_promise',
        label: 'Hook — Promise & Number',
        purpose: 'State exactly what value the viewer will receive and create urgency to watch all items.',
        techniques: ['Lead with the number: "5 secrets..."', 'Tease the most surprising item without revealing it'],
        visualGuidance: 'Character pointing at a large number or list title. Excited, leaning forward.',
        required: true
      },
      {
        role: 'item_1',
        label: 'Item #1 — Opening Shot',
        purpose: 'First item should be relatable and universally applicable to lower resistance.',
        techniques: ['Use "most people don\'t know..." framing', 'Deliver immediately — no preamble'],
        visualGuidance: 'Bold "01" label visible. Character explaining with a relevant prop.',
        required: true
      },
      {
        role: 'item_2',
        label: 'Item #2 — Deepening Value',
        purpose: 'Build on item 1 with more specific or surprising information.',
        techniques: ['Add an unexpected angle or counterintuitive insight', 'Use a real-world comparison'],
        visualGuidance: 'Bold "02" label. Character demonstrating or reacting with increasing enthusiasm.',
        required: false
      },
      {
        role: 'item_3',
        label: 'Item #3 — Surprise or Pivot',
        purpose: 'Introduce a contrarian or unexpected item to break the pattern and re-engage attention.',
        techniques: ['Subvert expectation: "You\'d expect X but actually Y"', 'Use a shocking statistic or fact'],
        visualGuidance: 'Bold "03" label. Character visually surprised or emphatic. High visual density.',
        required: false
      },
      {
        role: 'item_final',
        label: 'Final Item — Best for Last',
        purpose: 'The most valuable, unexpected, or actionable item. Viewers who stayed are rewarded.',
        techniques: [
          'Frame as exclusive knowledge: "This last one is the game-changer"',
          'Include a memorable phrase or visual metaphor'
        ],
        visualGuidance: 'Bold final number. Maximum energy — character fully animated and expressive.',
        required: true
      },
      {
        role: 'summary_cta',
        label: 'Summary',
        purpose: 'Quick recap of the main points; optionally pose a reflective question to the viewer.',
        techniques: ['Single-word summary per item', 'Pose a reflective or rhetorical question'],
        visualGuidance: 'Character facing camera directly with a thoughtful expression. Clean, uncluttered scene.',
        required: true
      }
    ]
  },

  news: {
    videoType: 'news',
    name: 'News Bulletin Arc',
    description:
      'An inverted-pyramid news arc that leads with the most important information and adds context progressively.',
    storytellingPrinciple:
      'Answer "Who, What, When, Where, Why" as early as possible. Context is not optional — it is the value.',
    hookStrategy: 'Lead with the most newsworthy fact. Make the viewer feel they cannot afford to miss this.',
    closingStrategy: 'Contextualize the news within a bigger trend or implication. Leave the viewer thinking.',
    scenes: [
      {
        role: 'breaking_headline',
        label: 'Breaking Headline',
        purpose: 'Deliver the single most impactful fact immediately — the lede that grabs attention.',
        techniques: ['Active, present-tense framing: "X just happened"', 'Use contrast: before vs after'],
        visualGuidance: 'News-anchor composition. Bold headline text visible. Serious expression.',
        required: true
      },
      {
        role: 'context',
        label: 'Context — Why This Matters',
        purpose: 'Establish why this news is significant and who is affected.',
        techniques: ['Reference a relatable impact: "This affects YOU because..."', 'Use numbers/statistics'],
        visualGuidance: 'Character presenting context. Map, data, or relevant visual prop.',
        required: true
      },
      {
        role: 'key_facts',
        label: 'Key Facts & Details',
        purpose: 'Deliver the supporting facts that flesh out the story.',
        techniques: ['Bullet-point style delivery — one fact per visual beat', 'Quote or reference a source'],
        visualGuidance: 'Data visualization or list layout. Character in reporter mode.',
        required: true
      },
      {
        role: 'multiple_angles',
        label: 'Multiple Perspectives',
        purpose: "Present different stakeholders' views to build credibility and fairness.",
        techniques: ['Contrast two opposing viewpoints visually', 'Use dual-character layout for debate'],
        visualGuidance: 'Split-screen or dual character layout. Balanced, neutral expression.',
        required: false
      },
      {
        role: 'implications',
        label: 'Implications & Bigger Picture',
        purpose: 'Zoom out to show what this event means for the future or a larger trend.',
        techniques: ['Timeline visual (before → now → future)', '"What this means for..." framing'],
        visualGuidance: 'Character pointing at a timeline or trend arrow. Forward-looking posture.',
        required: false
      },
      {
        role: 'closing_take',
        label: 'Closing — Informed Takeaway',
        purpose: 'Leave the viewer with one memorable insight that crystallizes the story.',
        techniques: ['One-sentence summary', 'Call to stay informed / follow for updates'],
        visualGuidance: 'Character in direct eye-contact pose. Clean, authoritative composition.',
        required: true
      }
    ]
  },

  animation: {
    videoType: 'animation',
    name: 'Visual Journey Arc',
    description: 'A visually-driven arc where every scene delivers a distinct, impactful motion and transformation.',
    storytellingPrinciple:
      'Motion IS the message. Each scene should feel like a frame from a dynamic film — not a static diagram.',
    hookStrategy: 'Open with the most visually striking image or transformation — let motion speak before words.',
    closingStrategy: 'End with a visual echo of the opening, but transformed — showing how far the journey went.',
    scenes: [
      {
        role: 'visual_hook',
        label: 'Visual Hook — Striking First Frame',
        purpose: 'Immediately establish a visual identity so bold the viewer cannot look away.',
        techniques: [
          'Start with a large-scale visual metaphor',
          'Use scale contrast (tiny character vs enormous world)'
        ],
        visualGuidance: 'Full-frame impact. Maximum visual energy. Dramatic color contrast.',
        required: true
      },
      {
        role: 'world_build',
        label: 'World Building — Establish the Stage',
        purpose: 'Show the visual world this story takes place in. Set the tone and aesthetic.',
        techniques: ['Environment reveal via pan or zoom-out', 'Introduce visual motifs to repeat later'],
        visualGuidance: 'Wide composition — character small against a rich backdrop.',
        required: true
      },
      {
        role: 'conflict_visual',
        label: 'Visual Conflict — The Problem',
        purpose: 'Introduce tension through visual contrast or collision of elements.',
        techniques: ['Color shift to signal change (warm → cold, bright → dark)', 'Object collision or barrier visual'],
        visualGuidance: 'Dynamic, diagonal composition. High kinetic energy.',
        required: true
      },
      {
        role: 'journey',
        label: 'The Journey — Motion & Transformation',
        purpose: 'Show the character or concept in motion, changing through the experience.',
        techniques: ['Metamorphosis animation (character or object changing form)', 'Use path/roadmap visuals'],
        visualGuidance: 'Character in mid-transformation. Movement implied through pose and props.',
        required: false
      },
      {
        role: 'reveal_climax',
        label: 'Reveal — The Transformation Complete',
        purpose: 'The satisfying visual payoff — everything has changed.',
        techniques: ['Before/after split or morph', 'Zoom in on the key change'],
        visualGuidance: 'Dramatic reveal composition. Character and world transformed.',
        required: true
      },
      {
        role: 'visual_echo_end',
        label: 'Visual Echo — Closing Frame',
        purpose: 'Mirror the opening scene but transformed — completing the visual arc.',
        techniques: ['Repeat opening visual motif with a meaningful change', 'Final frame should feel like a poster'],
        visualGuidance: 'Calm, composed final frame. Character at rest after journey. Iconic image.',
        required: true
      }
    ]
  },

  review: {
    videoType: 'review',
    name: 'Evaluation Arc',
    description: 'A balanced, credible arc that takes the viewer through discovery, examination, and a verdict.',
    storytellingPrinciple:
      'Credibility comes from showing both strengths and weaknesses. The viewer trusts a reviewer who challenges what they review.',
    hookStrategy: 'Start with your final verdict or a bold statement to create polarization and interest.',
    closingStrategy: 'Deliver a clear, decisive recommendation with a reason — who should and should not use this.',
    scenes: [
      {
        role: 'hook_verdict',
        label: 'Hook — Bold Opening Verdict',
        purpose: "State your overall verdict upfront to hook viewers who want to know if it's worth their time.",
        techniques: [
          'Lead with opinion: "This is the best/worst X I\'ve tried"',
          'Pose the central question the review answers'
        ],
        visualGuidance: 'Character in confident reviewer stance. Subject/product visible prominently.',
        required: true
      },
      {
        role: 'subject_intro',
        label: 'What Is It — Subject Introduction',
        purpose: 'Explain what is being reviewed and why it matters to the viewer.',
        techniques: ['One-sentence pitch/summary', 'Show who this is for'],
        visualGuidance: 'Character beside or holding the subject. Clean, focused composition.',
        required: true
      },
      {
        role: 'key_features',
        label: 'Key Features — What It Does',
        purpose: 'Walk through the most important features or aspects objectively.',
        techniques: ['Feature-benefit framing: "It does X which means Y"', 'Use demo/visual props'],
        visualGuidance: 'Character demonstrating or pointing at features. Checklist or spec layout visible.',
        required: true
      },
      {
        role: 'pros',
        label: 'Pros — What Works Well',
        purpose: 'Highlight genuine strengths with specific evidence.',
        techniques: ['Show real-world use case', 'Use comparison: "Better than X because..."'],
        visualGuidance: 'Positive expression. Green checkmarks or thumbs-up visual elements.',
        required: true
      },
      {
        role: 'cons_balance',
        label: 'Cons & Caveats — What Does Not Work',
        purpose: 'Present genuine weaknesses to maintain credibility and help the right viewer decide.',
        techniques: ['Be specific, not vague: "It fails at X in Y scenario"', "Acknowledge who it won't suit"],
        visualGuidance: 'Balanced expression. Red cross or warning icon. Honest, direct body language.',
        required: false
      },
      {
        role: 'verdict_cta',
        label: 'Final Verdict & Recommendation',
        purpose: 'Clear summary: score, who should get it, who should skip it, and what to do next.',
        techniques: ['Rating or score visual', '"Buy if... Skip if..." framework'],
        visualGuidance: 'Character in decisive pose. Final verdict graphic visible. Direct eye contact.',
        required: true
      }
    ]
  },

  motivational: {
    videoType: 'motivational',
    name: 'Transformation Arc',
    description: 'An emotionally charged arc that moves the viewer from a pain point to empowered action.',
    storytellingPrinciple:
      "Connect to the viewer's pain before offering the solution. People don't take action from advice — they act from emotion.",
    hookStrategy: 'Name the exact pain or frustration the viewer feels — make them feel seen and understood.',
    closingStrategy: 'End with a specific, achievable action step combined with a belief-affirming statement.',
    scenes: [
      {
        role: 'pain_hook',
        label: 'Hook — Name the Pain',
        purpose: "Articulate the viewer's exact frustration or desire so they immediately feel understood.",
        techniques: [
          'Use second person: "You\'ve been told...", "Most people feel..."',
          'Name the specific emotion (stuck, overwhelmed, doubting)'
        ],
        visualGuidance: 'Character in a relatable struggle — head down, blocked, or looking at obstacle.',
        required: true
      },
      {
        role: 'context_why',
        label: 'Why It Happens — Root Cause',
        purpose: 'Explain WHY the pain exists — this establishes authority and reframes the problem.',
        techniques: [
          'Reframe the problem as a system or belief, not a personal failure',
          'Use a visual metaphor for the root cause'
        ],
        visualGuidance: 'Character looking at a broken system or misleading signpost. Thoughtful expression.',
        required: true
      },
      {
        role: 'turning_point',
        label: 'Turning Point — The Shift',
        purpose: 'Introduce the key insight or principle that changes everything.',
        techniques: ['The "What if I told you..." moment', 'Use contrast: common belief vs truth'],
        visualGuidance: 'Character having an epiphany — light-bulb moment, sudden upright posture.',
        required: true
      },
      {
        role: 'principle',
        label: 'The Principle — Core Truth',
        purpose: 'State the core principle or belief that underpins the solution in a memorable way.',
        techniques: ['One short, quotable sentence', 'Visual metaphor to make it unforgettable'],
        visualGuidance: 'Bold text emphasis. Character in empowered, grounded stance.',
        required: false
      },
      {
        role: 'action_step',
        label: 'Action Step — What To Do Now',
        purpose: 'Translate the insight into one specific, immediate action the viewer can take today.',
        techniques: [
          'Make it micro: "This week, just do X for 5 minutes"',
          'Show the first step only — reduce overwhelm'
        ],
        visualGuidance: 'Character in forward-motion pose — stepping or reaching. Energized expression.',
        required: true
      },
      {
        role: 'inspiring_close',
        label: 'Inspiring Close — Belief Affirmation',
        purpose: 'Leave the viewer feeling capable, worthy, and motivated to act.',
        techniques: ['Direct address: "You are capable of..."', 'Callback to the opening pain — show the contrast'],
        visualGuidance: 'Character standing tall, arms open or raised. Warm, triumphant composition.',
        required: true
      }
    ]
  },

  entertainment: {
    videoType: 'entertainment',
    name: 'Escalating Comedy/Entertainment Arc',
    description:
      'A high-energy arc that hooks through personality, builds through escalation, and rewards with a memorable payoff.',
    storytellingPrinciple:
      "The rhythm of entertainment is: setup → build → release. Reward the viewer's attention with a satisfying punchline or spectacle.",
    hookStrategy: 'Open with the most absurd, funny, or visually surprising element — no slow intro allowed.',
    closingStrategy: 'End on the highest note — the biggest laugh, most surprising reveal, or most shareable moment.',
    scenes: [
      {
        role: 'attention_grab',
        label: 'Attention Grab — No Context Needed',
        purpose:
          'The viewer has 1 second before they scroll. Open with the most ridiculous, funny, or wild thing first.',
        techniques: ['Start mid-chaos or at the peak of absurdity', 'No explanation — confusion creates curiosity'],
        visualGuidance: 'Chaotic, energetic composition. Character in the most exaggerated possible pose.',
        required: true
      },
      {
        role: 'setup',
        label: 'Setup — The Premise',
        purpose: 'Establish the scenario, character, or joke premise so the viewer knows the rules of this world.',
        techniques: ['Minimal setup — viewers have short attention spans', 'Introduce the "normal" before breaking it'],
        visualGuidance: 'Clear visual scene-setting. Character acting normal before everything goes wrong.',
        required: true
      },
      {
        role: 'build_escalation',
        label: 'Build — Escalating Chaos',
        purpose: 'Increase the absurdity or stakes progressively — each beat should be funnier than the last.',
        techniques: ['Rule of three for comedy escalation', 'Character reacting increasingly to escalating events'],
        visualGuidance: 'Growing visual chaos. Props multiplying, character increasingly frantic.',
        required: true
      },
      {
        role: 'peak_payoff',
        label: 'Peak — The Punchline or Spectacle',
        purpose: 'The maximum energy point — the biggest laugh, wildest visual, or most surprising reveal.',
        techniques: ["Subvert the setup's expected conclusion", 'Use visual exaggeration at maximum scale'],
        visualGuidance: 'Maximum energy — character at full expression, scene at full chaos or beauty.',
        required: true
      },
      {
        role: 'reaction_echo',
        label: "Reaction — Character's Response",
        purpose: 'Show the character experiencing the consequence of the chaos — relatable reaction.',
        techniques: ["Mirror the viewer's imagined reaction", 'Slow-down after peak for comic contrast'],
        visualGuidance: 'Character stunned, confused, or celebrating. The "aftermath" shot.',
        required: false
      },
      {
        role: 'memorable_end',
        label: 'Memorable Ending — The Shareable Moment',
        purpose: 'End on the highest or most memorable note — the one moment viewers will share or quote.',
        techniques: [
          'Callback to opening for satisfying circularity',
          'End with an unresolved absurdity or perfect punchline'
        ],
        visualGuidance: 'High-energy final frame. Character in iconic, shareable pose.',
        required: true
      }
    ]
  },

  faceless: {
    videoType: 'faceless',
    name: 'Faceless Narration Arc',
    description:
      'A narration-first arc where the visuals amplify the voiceover without relying on a visible presenter.',
    storytellingPrinciple:
      'The narration carries the story. Visuals must illustrate the words metaphorically — show the concept, not just the speaker.',
    hookStrategy: 'Open with a question or statement so intriguing the viewer must hear the answer.',
    closingStrategy:
      'End with a reveal or conclusion that reframes everything said before — a "now you see it" moment.',
    scenes: [
      {
        role: 'intrigue_hook',
        label: 'Hook — Intriguing Question or Statement',
        purpose: 'Pose a question, fact, or statement that is impossible to ignore.',
        techniques: [
          'Use counterintuitive fact: "Most people believe X but actually..."',
          '"What if I told you..." or direct curiosity gap'
        ],
        visualGuidance: 'Visually ambiguous or striking image. No character needed — concept drives the scene.',
        required: true
      },
      {
        role: 'problem_question',
        label: 'Problem — Define the Question',
        purpose: 'Articulate the central question or problem this video answers, making it feel personal and urgent.',
        techniques: [
          'Make it specific: not "success" but "why do 95% fail at X"',
          'Use statistics or surprising scale'
        ],
        visualGuidance: 'Visual metaphor for the problem. Clean, concept-driven composition.',
        required: true
      },
      {
        role: 'answer_preview',
        label: 'Answer Preview — Tease the Resolution',
        purpose: 'Hint at the answer to maintain curiosity while building toward full revelation.',
        techniques: [
          'Partial reveal: "It comes down to one thing..."',
          'Create curiosity gap: establish what they will learn'
        ],
        visualGuidance: 'Split or divided visual — known vs unknown. Tension in the composition.',
        required: false
      },
      {
        role: 'main_content',
        label: 'Main Content — The Core Information',
        purpose: 'Deliver the primary value of the video — the answer, story, or information promised.',
        techniques: ['Structure in 2–3 clear points', 'Use visual metaphors for abstract concepts'],
        visualGuidance: 'Concept-driven visuals — infographic, metaphor, or symbolic scene.',
        required: true
      },
      {
        role: 'deeper_insight',
        label: 'Deeper Insight — The "So What"',
        purpose: "Connect the information to a larger meaning or implication that the viewer didn't expect.",
        techniques: ['Zoom out: "What this really means is..."', 'Connect to a universal human experience'],
        visualGuidance: 'Expansive visual metaphor. Wide composition — small figure in large world.',
        required: false
      },
      {
        role: 'cta_close',
        label: 'Closing — CTA & Resonant Thought',
        purpose: 'End with a memorable statement and a clear next step.',
        techniques: ['One-sentence distillation of the entire video', 'Direct CTA: follow, share, try'],
        visualGuidance: 'Clean, minimal closing frame. Abstract or symbolic final image.',
        required: true
      }
    ]
  },
  explainer: {
    videoType: 'explainer',
    name: 'Problem-Solution Explainer Arc',
    description:
      'A classic explainer structure that starts with a relatable problem and builds toward a comprehensive solution.',
    storytellingPrinciple:
      'The viewer must feel the pain of the problem before the value of the solution. Every feature is a benefit.',
    hookStrategy: 'Start with a question that highlights a common frustration or inefficiency.',
    closingStrategy: 'Summary of the transformation from problem to solution, ending with a call to action.',
    scenes: [
      {
        role: 'problem_hook',
        label: 'Hook — The Relatable Problem',
        purpose: 'Identify a common pain point that the viewer experiences to create immediate resonance.',
        techniques: ['Ask a rhetorical question', 'Show the frustration of the status quo'],
        visualGuidance: 'Character struggling with a task or looking frustrated by a complex system.',
        required: true
      },
      {
        role: 'agitation',
        label: 'Agitation — Why It Matters',
        purpose: 'Dig deeper into the consequences of NOT solving the problem. Increase the stakes.',
        techniques: ['Highlight lost time, money, or energy', 'Compare current struggle to ideal state'],
        visualGuidance: 'A "before" visualization showing chaos, cost, or complexity.',
        required: true
      },
      {
        role: 'the_solution_intro',
        label: 'Introduction — The New Way',
        purpose: 'Reveal the product, service, or concept as the answer to the previously defined problem.',
        techniques: ['Dramatic reveal of the solution name/logo', 'Single sentence value proposition'],
        visualGuidance: 'The solution appearing like a hero, clearing away the chaos.',
        required: true
      },
      {
        role: 'how_it_works_1',
        label: 'Core Mechanism — Simplicity',
        purpose: 'Explain the most important feature or aspect that makes the solution work.',
        techniques: ['Break down complexity into one simple visual metaphor', 'Focus on ease of use'],
        visualGuidance: 'Character using the solution effortlessly. Simplified diagram or flowchart.',
        required: true
      },
      {
        role: 'benefits_proof',
        label: 'Benefits & Proof — Life After',
        purpose: 'Show the tangible results. How life is better now that the problem is gone.',
        techniques: ['Numbers or percentages of improvement', 'Show the character feeling relieved or empowered'],
        visualGuidance: 'The "after" visualization — calm, efficient, and successful.',
        required: false
      },
      {
        role: 'final_call_to_action',
        label: 'Conclusion — Take the Next Step',
        purpose: 'Clearly state what the viewer should do next to start their transformation.',
        techniques: ['Urgency: "Start today"', 'Clear visual signpost for the next action'],
        visualGuidance: 'Character pointing at a button or website link. Confident and inviting.',
        required: true
      }
    ]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Genre Storytelling Modifiers
// ─────────────────────────────────────────────────────────────────────────────

export const GENRE_STORYTELLING: Record<VideoGenre, GenreStorytelling> = {
  educational: {
    videoGenre: 'educational',
    toneDescription: 'Clear, structured, and intellectually engaging',
    narrativeStyle: 'Pedagogical — build understanding step by step. Concepts before facts. Mental models before data.',
    audienceExpectation: 'Viewers expect to leave smarter. They measure value by insight gained.',
    pacing: 'medium',
    emotionalRegister: 'Curiosity → understanding → satisfaction',
    languageStyle: 'Precise vocabulary, short sentences. Define jargon immediately when used.',
    mustInclude: [
      'Clear problem statement or learning objective early in the video',
      'At least one memorable analogy or metaphor to explain the core concept',
      'A structured progression (introduction → explanation → application)',
      'A concrete takeaway or principle the viewer can apply'
    ],
    mustAvoid: [
      'Unexplained jargon',
      'Information overload without synthesis',
      'Abstract conclusions with no real-world connection'
    ]
  },

  tech: {
    videoGenre: 'tech',
    toneDescription: 'Informed, forward-looking, and efficiency-oriented',
    narrativeStyle: 'Problem → Solution → Implication. Always show what a technology enables, not just what it does.',
    audienceExpectation: 'Viewers want to stay ahead of the curve. They value specificity and accuracy over hype.',
    pacing: 'fast',
    emotionalRegister: 'Curiosity → excitement → future vision',
    languageStyle: "Technical terms used correctly. Avoid buzzword inflation. Show, don't just tell.",
    mustInclude: [
      'A concrete use case or real-world application of the technology',
      'What makes this technology different from what came before',
      'At least one visual that shows the technology in action'
    ],
    mustAvoid: [
      'Unsubstantiated hype without evidence',
      'Generic "this will change everything" claims without specifics',
      'Ignoring limitations or trade-offs'
    ]
  },

  business: {
    videoGenre: 'business',
    toneDescription: 'Professional, results-oriented, and pragmatic',
    narrativeStyle:
      'Frame every insight in terms of outcomes: time saved, revenue increased, risk reduced, or competitive advantage gained.',
    audienceExpectation: 'Viewers want actionable strategies they can implement. Credibility comes from specificity.',
    pacing: 'medium',
    emotionalRegister: 'Recognition of challenge → strategic insight → confidence in solution',
    languageStyle: 'Business-appropriate. Metrics and numbers where possible. Concise, direct sentences.',
    mustInclude: [
      'A clear business problem or opportunity statement',
      'At least one specific strategy or framework with a memorable name',
      'Results or outcomes (real or hypothetical with clear framing)',
      'A practical next step the viewer can apply to their business'
    ],
    mustAvoid: [
      'Vague advice without actionable specifics',
      'Clichés without substantive content',
      "Personal stories that don't connect to business value"
    ]
  },

  finance: {
    videoGenre: 'finance',
    toneDescription: 'Trustworthy, data-driven, and empowering',
    narrativeStyle:
      'Numbers tell the story. Use concrete figures, percentages, and timelines to make abstract concepts tangible.',
    audienceExpectation:
      "Viewers want financial clarity and confidence. They're often anxious about money and need reassurance alongside information.",
    pacing: 'medium',
    emotionalRegister: 'Anxiety about money → clarity → empowerment to act',
    languageStyle:
      'Simple language for complex concepts. Define financial terms. Use relatable amounts ($100, not $1M).',
    mustInclude: [
      'At least one specific number, percentage, or timeline to make concepts concrete',
      'A clear explanation of cause and effect in financial terms',
      'Practical application: "Here\'s how you can do this with $X"',
      'Disclaimer or context about financial decisions being personal'
    ],
    mustAvoid: [
      'Specific investment recommendations without proper context',
      'Complex financial jargon without explanation',
      'Fear-mongering without constructive guidance'
    ]
  },

  health: {
    videoGenre: 'health',
    toneDescription: 'Empowering, evidence-informed, and accessible',
    narrativeStyle:
      'Connect health information to how the viewer will FEEL, not just what they should do. Physical benefits must be made emotionally tangible.',
    audienceExpectation:
      "Viewers want practical, believable health information that fits their real life. They're skeptical of miracle claims.",
    pacing: 'medium',
    emotionalRegister: 'Awareness of problem/desire → understanding → motivation to change',
    languageStyle:
      'Accessible scientific language. Avoid both medical jargon and pseudoscience. Use research references naturally.',
    mustInclude: [
      'A relatable physical or mental state the viewer can identify with',
      'A science-backed explanation (even simplified) for the recommendation',
      'A realistic, achievable starting point — not an extreme lifestyle change',
      'Encouragement and positive framing of small improvements'
    ],
    mustAvoid: [
      'Extreme or unqualified health claims',
      'Shame or guilt around health choices',
      'One-size-fits-all prescriptions without acknowledging individual variation'
    ]
  },

  travel: {
    videoGenre: 'travel',
    toneDescription: 'Adventurous, sensory-rich, and inspiring',
    narrativeStyle:
      'Transport the viewer there before teaching them anything. Sensory details — sight, sound, taste — come before facts.',
    audienceExpectation: 'Viewers want to be inspired and equipped. They want to dream AND plan.',
    pacing: 'dynamic',
    emotionalRegister: 'Wanderlust → curiosity → desire to experience → inspiration to book',
    languageStyle: 'Vivid, evocative language. Show through specific details, not generic adjectives.',
    mustInclude: [
      'A sensory, evocative description of the destination or experience early on',
      'At least one unexpected or local insight not found in mainstream guides',
      'Practical information: cost, best time, how to get there, what to avoid',
      'A visual or emotional reason to go NOW'
    ],
    mustAvoid: [
      'Generic beauty clichés without specific detail',
      'Pure logistics without emotional connection',
      'Advice that could apply to any destination'
    ]
  },

  food: {
    videoGenre: 'food',
    toneDescription: 'Sensory, passionate, and approachable',
    narrativeStyle:
      'Food content must make the viewer hungry. Descriptions should be visceral — color, texture, smell, sound.',
    audienceExpectation:
      'Viewers want to be inspired to cook, eat, or discover something new. They value authenticity and passion.',
    pacing: 'dynamic',
    emotionalRegister: 'Appetite/desire → discovery → satisfaction (vicarious)',
    languageStyle: 'Sensory vocabulary. Specific ingredients and techniques. Enthusiasm is expected.',
    mustInclude: [
      'A moment that makes the viewer hungry or curious within the first scene',
      'Specific ingredients, techniques, or flavor descriptions',
      'A cultural or personal connection to the food that adds meaning',
      'A moment of transformation — raw to cooked, simple to complex'
    ],
    mustAvoid: [
      'Dry recipe recitation without sensory context',
      'Generic descriptions like "delicious" or "amazing" without specifics',
      'Content that feels clinical or detached from the pleasure of food'
    ]
  },

  gaming: {
    videoGenre: 'gaming',
    toneDescription: 'Energetic, community-aware, and expertise-driven',
    narrativeStyle:
      "Gaming content respects the viewer's knowledge. Lead with strategy and insight, not explanations of basic concepts.",
    audienceExpectation:
      'Viewers are passionate and knowledgeable. They want to improve, discover, or be entertained by someone who understands the game.',
    pacing: 'fast',
    emotionalRegister: 'Excitement → insight → competitive motivation',
    languageStyle: 'Gaming vocabulary used naturally. Community-aware tone. Enthusiastic but not performative.',
    mustInclude: [
      'A specific, advanced insight or strategy not obvious to casual players',
      'Reference to the gaming community, meta, or current state of the game',
      'A visual representation of the strategy, tip, or moment',
      "A reason this matters for the viewer's gameplay"
    ],
    mustAvoid: [
      'Explaining basics to advanced audiences',
      'Generic gaming advice that applies to every game',
      'Ignoring the competitive or social dimension of gaming'
    ]
  },

  sports: {
    videoGenre: 'sports',
    toneDescription: 'Passionate, analytical, and celebratory',
    narrativeStyle:
      'Sports content lives in the moment. Ground every analysis in a specific game, player, or moment — then zoom out.',
    audienceExpectation: 'Viewers are fans first, analysts second. They want the emotional connection AND the insight.',
    pacing: 'fast',
    emotionalRegister: 'Excitement → analysis → deeper appreciation',
    languageStyle: 'Sports vocabulary. Strong action verbs. Short, punchy sentences for action beats.',
    mustInclude: [
      'A specific sports moment, achievement, or controversy as the anchor',
      'Analysis that reveals something the viewer may not have noticed',
      'The human story behind the athletic performance',
      "A connection to why this matters for the sport or athlete's legacy"
    ],
    mustAvoid: [
      'Generic sports platitudes without specific content',
      'Pure stats without human context',
      'Content that could describe any athlete or any game'
    ]
  },

  science: {
    videoGenre: 'science',
    toneDescription: 'Wonder-driven, precise, and accessible',
    narrativeStyle:
      'Start with the wonder — the counterintuitive fact or mind-bending question — then build the explanation that makes it make sense.',
    audienceExpectation:
      'Viewers want to feel smarter and more amazed by the world. They value accuracy but also want to be blown away.',
    pacing: 'medium',
    emotionalRegister: 'Wonder/surprise → curiosity → understanding → awe',
    languageStyle: 'Accurate but accessible. Use analogies liberally. State scale and magnitude clearly.',
    mustInclude: [
      'A counterintuitive fact or phenomenon that challenges common sense',
      'A clear, memorable analogy that makes the science tangible',
      'The "so what" — why this scientific fact matters for real life',
      'At least one number or measurement that communicates scale'
    ],
    mustAvoid: [
      'Oversimplification that sacrifices accuracy',
      'Unexplained jargon presented as self-evident',
      'Science divorced from its human or philosophical implications'
    ]
  },

  history: {
    videoGenre: 'history',
    toneDescription: 'Narrative-rich, contextual, and revealing',
    narrativeStyle:
      'Tell history as story — with characters, motivations, and consequences. Facts gain meaning through narrative context.',
    audienceExpectation: 'Viewers want to be transported. They want the drama of history, not a textbook summary.',
    pacing: 'medium',
    emotionalRegister: 'Curiosity → immersion → connection to present',
    languageStyle:
      'Vivid narrative prose. Historical specificity (dates, names, places used purposefully). Connect past to present.',
    mustInclude: [
      'A human protagonist or story driving the historical events',
      'Historical detail that creates atmosphere and believability',
      'The stakes — what would have happened if things went differently',
      'A connection to why this history is relevant today'
    ],
    mustAvoid: [
      'Dry chronological recitation of dates and events',
      'Historical figures without motivation or character',
      'History without connecting it to the present or universal human themes'
    ]
  },

  'self-improvement': {
    videoGenre: 'self-improvement',
    toneDescription: 'Growth-oriented, honest, and practically inspiring',
    narrativeStyle:
      "Acknowledge the struggle before offering the solution. Viewers trust content that doesn't pretend change is easy.",
    audienceExpectation:
      'Viewers want real, applicable improvement tools — not motivational fluff. They have high tolerance for directness.',
    pacing: 'medium',
    emotionalRegister: 'Recognition of personal struggle → hope → practical empowerment',
    languageStyle: 'Direct second person. Honest about difficulty. Specific and actionable, not generic.',
    mustInclude: [
      'Honest acknowledgment of why the change is difficult',
      'A specific, implementable action or habit (not a vague principle)',
      'A scientific or psychological basis for the recommendation',
      'A realistic timeline or expectation for results'
    ],
    mustAvoid: [
      'Toxic positivity that dismisses real struggles',
      'Unrealistic timelines or results',
      'Generic advice ("just believe in yourself") without specific methods'
    ]
  },

  mystery: {
    videoGenre: 'mystery',
    toneDescription: 'Suspenseful, methodical, and satisfyingly revealing',
    narrativeStyle: 'Withhold information strategically. The reveal should feel both surprising and inevitable.',
    audienceExpectation:
      'Viewers want to be intrigued, then satisfied. The pleasure is in the investigation AND the solution.',
    pacing: 'dynamic',
    emotionalRegister: 'Curiosity → suspense → tension → revelation → satisfaction',
    languageStyle: 'Careful word choice — hint at answers without giving them away. Use questions liberally.',
    mustInclude: [
      'A clear mystery or unanswered question established in scene 1',
      'At least one red herring or twist that subverts initial expectations',
      'Clues woven naturally into the narration',
      'A satisfying resolution that answers the central question'
    ],
    mustAvoid: [
      'Revealing the mystery too early',
      'Fake suspense without real payoff',
      'Loose ends or unresolved questions presented as satisfying conclusions'
    ]
  },

  lifestyle: {
    videoGenre: 'lifestyle',
    toneDescription: 'Aspirational yet relatable, warm, and personal',
    narrativeStyle: 'Blend aspiration with authenticity. Show the ideal but ground it in real, achievable moments.',
    audienceExpectation: 'Viewers want inspiration without alienation. They want to see themselves in the content.',
    pacing: 'medium',
    emotionalRegister: 'Aspiration → relatability → inspiration → desire to adopt',
    languageStyle: 'Warm, personal voice. Use "I" and "you" naturally. Describe aesthetics and feelings specifically.',
    mustInclude: [
      'A relatable life moment or feeling as the entry point',
      'Visual richness — specific aesthetic details that create atmosphere',
      'A practical takeaway that makes the aspiration achievable',
      'Authentic personal connection — why this matters, not just what it is'
    ],
    mustAvoid: [
      'Unrealistic perfection that alienates ordinary viewers',
      'Content that feels like advertising or performative aspiration',
      'Advice that requires significant money or resources without acknowledgment'
    ]
  },

  fun: {
    videoGenre: 'fun',
    toneDescription: 'Playful, light, and infectiously enjoyable',
    narrativeStyle:
      'Fun content prioritizes the experience over the message. The viewer should smile or laugh first, think second.',
    audienceExpectation:
      'Viewers want entertainment value. They measure success by how much they enjoyed it, not what they learned.',
    pacing: 'fast',
    emotionalRegister: 'Amusement → delight → joy → desire to share',
    languageStyle: 'Light, playful, witty. Short sentences. Wordplay and humor where natural.',
    mustInclude: [
      'At least one moment that will make the viewer smile or laugh',
      'High energy and visual variety throughout',
      'A surprising or unexpected twist on a familiar topic',
      'A shareable ending or memorable punchline'
    ],
    mustAvoid: [
      'Heavy or serious tone that kills the fun',
      'Overcomplicated content that requires effort to enjoy',
      'Content so niche it excludes most viewers'
    ]
  },

  general: {
    videoGenre: 'general',
    toneDescription: 'Balanced, accessible, and broadly appealing',
    narrativeStyle: 'General content must work for the widest possible audience. Clarity and relatability over depth.',
    audienceExpectation:
      'Viewers expect professional, well-structured content with clear value. No specific expertise required.',
    pacing: 'medium',
    emotionalRegister: 'Curiosity → engagement → satisfying conclusion',
    languageStyle: 'Plain, clear language. Avoid niche vocabulary. Universally relatable examples.',
    mustInclude: [
      'A universally relatable hook that appeals to broad demographics',
      'Clear structure that is easy to follow',
      'Balanced mix of information and entertainment',
      'A clear, positive conclusion'
    ],
    mustAvoid: [
      'Niche references that exclude large portions of the audience',
      'Overly complex or specialized content without explanation',
      'Content that assumes specific background knowledge'
    ]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Arc Scaling — adapt arc to requested scene count
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scale a narrative arc to a target scene count.
 * Required scenes are always included. Optional scenes are added/removed to fit.
 */
export function scaleNarrativeArc(arc: NarrativeArc, targetCount: number): NarrativeSceneRole[] {
  const required = arc.scenes.filter((s) => s.required)
  const optional = arc.scenes.filter((s) => !s.required)

  if (targetCount <= required.length) {
    // Use only required scenes, spread across targetCount
    return required.slice(0, targetCount)
  }

  const slotsForOptional = targetCount - required.length
  const selectedOptional = optional.slice(0, slotsForOptional)

  // Rebuild in original order
  const selectedRoles = new Set([...required.map((s) => s.role), ...selectedOptional.map((s) => s.role)])

  return arc.scenes.filter((s) => selectedRoles.has(s.role))
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a narrative arc section for the LLM system prompt.
 * Returns a string block to be embedded in the script generation prompt.
 */
export function buildNarrativeArcPrompt(
  videoType: VideoType,
  videoGenre: VideoGenre | undefined,
  sceneCount: number
): string {
  const arc = NARRATIVE_ARCS[videoType]
  const scaledScenes = scaleNarrativeArc(arc, sceneCount)
  const genre = videoGenre ? GENRE_STORYTELLING[videoGenre] : undefined

  const lines: string[] = []

  lines.push('----------------------------------------------------------------')
  lines.push(
    `NARRATIVE ARC — ${arc.name.toUpperCase()}`,
    '----------------------------------------------------------------',
    `Storytelling Principle: ${arc.storytellingPrinciple}`,
    `Hook Strategy: ${arc.hookStrategy}`,
    `Closing Strategy: ${arc.closingStrategy}`,
    '',
    `MANDATORY SCENE STRUCTURE (${sceneCount} scenes):`,
    'Each scene MUST fulfill its designated narrative role below:',
    ''
  )

  scaledScenes.forEach((scene, index) => {
    lines.push(`Scene ${index + 1} — ${scene.label}`, `  Purpose: ${scene.purpose}`)
    lines.push(`  Techniques: ${scene.techniques.join(' | ')}`, `  Visual Guidance: ${scene.visualGuidance}`, '')
  })

  if (genre) {
    lines.push('----------------------------------------------------------------')
    lines.push(
      `GENRE GUIDELINES — ${genre.videoGenre.toUpperCase()}`,
      '----------------------------------------------------------------',
      `Tone: ${genre.toneDescription}`,
      `Narrative Style: ${genre.narrativeStyle}`,
      `Audience Expectation: ${genre.audienceExpectation}`,
      `Pacing: ${genre.pacing}`,
      `Emotional Journey: ${genre.emotionalRegister}`,
      `Language Style: ${genre.languageStyle}`,
      '',
      'MUST INCLUDE:'
    )
    genre.mustInclude.forEach((item) => lines.push(`  ✓ ${item}`))
    lines.push('', 'MUST AVOID:')
    genre.mustAvoid.forEach((item) => lines.push(`  ✗ ${item}`))
  }

  return lines.join('\n')
}
