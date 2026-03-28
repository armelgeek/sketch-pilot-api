import * as fs from 'node:fs'
import * as path from 'node:path'
import * as dotenv from 'dotenv'
import { PromptManager } from '../core/prompt-manager'
import { VideoScriptGenerator } from '../core/video-script-generator'
import { KokoroTTSService } from '../services/audio/kokoro-tts.service'
import { LLMServiceFactory } from '../services/llm'
import { videoGenerationOptionsSchema } from '../types/video-script.types'

// Load environment to ensure API keys and ONNX settings are present
dotenv.config()

async function runDurationTest() {
  const targetDuration = 300 // 5 minutes as requested by the user
  const tmpDir = path.join(process.cwd(), '.tmp_test_audio')

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true })
  }

  console.log(`\n=================================================`)
  console.log(`🧪 TESTING TTS DURATION ACCURACY (Target: ${targetDuration}s)`)
  console.log(`=================================================\n`)

  try {
    // 1. Initialize core services
    console.log(`[1/4] Initializing services...`)
    const llmService = await LLMServiceFactory.create({ provider: 'openai', apiKey: process.env.OPENAI_API_KEY || '' })
    const promptManager = new PromptManager()
    const scriptGenerator = new VideoScriptGenerator(llmService, promptManager)

    // Using Kokoro TTS directly as requested
    const audioService = new KokoroTTSService(process.env.HUGGING_FACE_TOKEN || '', 'en-US', 'af_heart')

    // 2. Generate script
    console.log(`[2/4] Generating script (Subject: Artificial Intelligence)...`)

    const DEFAULT_SPEC = {
      name: 'Storytellinng',
      role: 'Personal Transformation Storytelling Director',
      tags: [],
      task: 'Plan and write a complete YouTube video script based on the provided subject and target duration. The script must include narration, visual actions, emotional states, visual composition and transitions.',
      goals: [
        'Open with 3–4 hyper-concrete, instantly recognizable real-life examples within the first 10 seconds — make the viewer think of someone they know',
        'Name the tension or paradox at the heart of the subject before explaining it',
        'Explain psychological ideas through concrete everyday scenes, not abstract definitions',
        'Alternate between sharp observational statements and deeper psychological decoding',
        'Maintain an emotional tension arc (cold observation → named paradox → psychological insight → mirror moment → quiet conclusion)',
        'End by turning the mirror on the viewer — not just judging others, but inviting self-examination',
        "Deliver one single memorable formulation that crystallizes the entire message (e.g. 'True wealth whispers, false wealth screams')"
      ],

      rules: [
        // ─── Pacing & Duration ──────────────────────────────────────────────
        'TOTAL VIDEO DURATION MUST NOT exceed the requested duration.',
        // Removed "Aim for 15-18 seconds per scene" as it conflicts with long-form specific calculations.

        // ─── Narration Style ────────────────────────────────────────────────
        'Narration MUST be complete, logically coherent sentences. Never cut mid-sentence — rewrite long sentences into shorter ones.',
        "Each scene narration MUST be a verbatim slice of 'fullNarration'.",
        'Transitions MUST occur at natural pauses (full stops, commas, breath marks).',
        'Write in a direct, cinematic second-person or observational voice — address the viewer as if speaking to them personally.',
        'Vary sentence rhythm deliberately: short punchy statements followed by longer analytical ones. Avoid uniform sentence length.',
        'Open each major section with a concrete observation before offering the explanation — show before you tell.',
        'Avoid generic motivational language. Every claim must be grounded in a specific behavior, scene, or consequence.',
        'Include at least one counter-intuitive or slightly uncomfortable truth per major section.',
        "Anchor statistics or facts to plausible real-world behaviors — use approximate language ('a significant portion', 'several studies') only when precise data is unavailable, and flag it clearly.",
        "The conclusion must turn the lens on the viewer — not just describe others, but invite self-examination ('Look at yourself too').",
        'The final line must be a single, crystallized formulation — short, memorable, imagistic.',

        // ─── Structure Rules ────────────────────────────────────────────────
        'Vary section treatment: not every point follows the same template. Some sections get a full scene, some get one sharp sentence.',
        'Avoid stacking more than 3 consecutive sections with identical structure (observation → psychology → consequence → verdict).',
        "Use contrast pairs to sharpen points: 'The fake rich person does X. The truly wealthy person does Y.'",

        'SCENES: prioritize visual clarity and simplicity. Avoid cluttered scenes with too many irrelevant elements. Clarity over complexity.',
        'VISUAL FOCUS: Each scene must focus on a clear visual subject interacting with the core concept. Avoid background crowds or irrelevant figures that distract from the main message.',
        'VISUAL STORYTELLING (CRITICAL): Every image must tell the CORE IDEA of the scene WITHOUT words or narration. THE CORE CONCEPT MUST BE THE LARGEST AND MOST VISUALLY DOMINANT ELEMENT.',
        'STRICT REALISTIC SCALE: NEVER inflate object sizes for importance. All objects MUST maintain real-life proportions (e.g. a phone is palm-sized, a pencil is shorter than an arm).',
        'CINEMATIC DETAIL: To show detailed objects (e.g. text on a phone), MUST use an Extreme Close-Up (ECU) or Macro-shot where the object fills the frame.',
        'BAN WHITE VOIDS: Backgrounds MUST NOT be pure white. Use grayscale shading, hatching, and textures to establish depth.',
        'MANDATORY DEPTH: Show wall corners or floor perspective lines.',
        'MANDATORY DENSITY: Include 5+ background objects.',
        'NO FRAMES: NEVER include visual borders, frames, or artificial outlines around the image.',
        "PATTERN INTERRUPT (HOOK): The first 5 seconds MUST feature a visually striking, unusual, or highly symbolic 'Hook' to grab attention immediately.",
        'No abrupt motion. Split complex actions across multiple scenes (3-8s per visual cut).',
        'ACTIONS: clean visual descriptions only. No timing tags, no video keywords, no appearance descriptions.',
        'ANIMATION PROMPT: contains all timing tags and movement instructions.',
        'Avoid clichés. Prefer concrete daily-life situations — parking lots, dinner tables, social media feeds, bank apps.',
        'OUTPUT MUST BE STRICTLY VALID JSON.',

        // ─── Camera Motion & Transitions (CRITICAL) ─────────────────────────
        "Each scene MUST use a dynamic camera action (zoom-in | zoom-out | pan-left | pan-right). Avoid 'static' unless absolutely necessary.",
        "The camera motion MUST ACCELERATE towards the end of the scene. This 'Ending Acceleration' creates the visual transition to the next scene. All transitions are now movement-based cuts."
      ],
      scenePresets: {
        hook: {
          description: 'Visually striking opening to grab attention instantly',
          rules: [
            'The scene must be immediately understandable in under 2 seconds',
            'Use a strong, unusual, or symbolic visual',
            'Action must be clear and immediate, not passive',
            'Keep composition simple and focused',
            'The core concept must be instantly visible'
          ]
        },
        reveal: {
          description: 'Psychological explanation through visual action',
          rules: [
            'Show a concrete action that represents a deeper behavior',
            'Make the invisible psychological concept visible through action',
            'Keep the scene grounded in realistic daily life',
            'Avoid abstract or overly symbolic visuals',
            'Focus on clarity and understanding'
          ]
        },
        mirror: {
          description: 'Relatable moment where the viewer recognizes themselves',
          rules: [
            'Use a highly relatable everyday situation',
            'Focus on a subtle but emotionally uncomfortable moment',
            'Keep the scene simple and realistic',
            'Avoid exaggeration or dramatization',
            'The viewer should feel personal recognition'
          ]
        }
      },
      visualRules: [
        'The concept must be visually dominant without breaking realistic scale',
        'Environments must be realistic and include multiple objects',
        'No empty or undefined space; use shading and perspective to create depth',
        'Maintain consistent black and white pencil rendering with grayscale textures',
        'Vary framing naturally between close, medium, and wide compositions',
        'Actions must be simple, clear, and visually readable'
      ],
      orchestration: [
        'First generate full narration',
        'Then split into scenes',
        'Assign a preset type to each scene (hook, reveal, mirror)',
        'Each scene must visually represent its narration clearly',
        'Maintain continuity across scenes (location, action)'
      ],
      context:
        'Cinematic director specialized in psychological storytelling applied to personal finance, social behavior, and identity. The goal is to produce emotionally engaging scripts that make viewers recognize behaviors — in others first, then in themselves.',
      category: 'Storytelling',
      structure:
        'Cold Open (concrete examples + named paradox) → Numbered Sections (varied rhythm) → Mirror Moment (viewer self-examination) → Crystallized Conclusion',
      formatting:
        'Each scene must include narration, duration, timestamp, summary, preset (hook|reveal|mirror), and animation prompt.',
      instructions: [
        'Think step-by-step.',
        "First, write the complete narration in 'fullNarration' — treat it as a standalone script that could be read aloud and make complete sense.",
        'Check that the narration varies sentence length, uses contrast pairs, and ends with a single memorable line.',
        'Then, break it down into scenes.',
        'Ensure narration flows perfectly across cuts.'
      ],
      audienceDefault: 'General audience interested in psychology, social dynamics, and personal finance',
      outputFormat: JSON.stringify(
        {
          // ─── Story Identity ────────────────────────────────────────────────
          emotionalArc: [
            'Cold Open: immediate recognition (viewer sees someone they know)',
            'Rising: named paradox creates tension',
            'Peak: psychological root exposed',
            'Mirror: viewer sees themselves',
            'Resolution: quiet, crystallized clarity'
          ],

          // ─── Standard fields ───────────────────────────────────────────────
          titles: ['Title 1', 'Title 2', 'Title 3'],
          fullNarration:
            'String - The complete unbroken voice-over narration. Must read as a standalone script with varied rhythm, contrast pairs, and one final crystallized line.',
          topic: 'String',
          audience: 'String',
          scenes: [
            {
              sceneNumber: 'Integer',
              id: 'String (unique scene id)',
              narration: 'String (verbatim slice of fullNarration)',
              summary: 'String — visual summary',
              preset: 'hook | reveal | mirror',
              locationId: 'String (optional: unique location identifier, e.g. "office")',
              cameraAction: 'String (zoom-in | zoom-out | pan-left | pan-right). MUST accelerate at the end.',
              imagePrompt:
                "A symbolic visual perfectly representing the scene's core idea. Detailed text-to-image prompt.",
              animationPrompt: 'specific movement/performance instructions'
            }
          ]
        },
        null,
        2
      )
    }

    const options = videoGenerationOptionsSchema.parse({
      maxDuration: targetDuration,
      minDuration: targetDuration,
      customSpec: DEFAULT_SPEC as any
    })
    const script = await scriptGenerator.generateCompleteScript('The future of Artificial Intelligence', options)

    console.log(`      ✓ Script generated successfully with ${script.scenes.length} scenes.`)

    // 3. Generate Audio
    console.log(`\n[3/4] Synthesizing TTS Audio and measuring real duration...`)
    let totalAudioDuration = 0
    let totalWords = 0

    for (let index = 0; index < script.scenes.length; index++) {
      const scene = script.scenes[index]
      const outputPath = path.join(tmpDir, `scene_${index + 1}.wav`)
      const wordCount = (scene.narration || '').split(/\s+/).filter(Boolean).length
      totalWords += wordCount

      console.log(`      -> Scene ${index + 1}: Synthesizing ${wordCount} words...`)
      const ttsResult = await audioService.generateSpeech(scene.narration, outputPath)

      console.log(`         ✓ Scene ${index + 1} Audio Duration: ${ttsResult.duration.toFixed(2)}s`)
      totalAudioDuration += ttsResult.duration
    }

    // 4. Summarize and Evaluate
    console.log(`\n=================================================`)
    console.log(`📊 TEST RESULTS`)
    console.log(`=================================================`)
    console.log(`Target Video Duration : ${targetDuration}s`)
    console.log(`Actual TTS Duration   : ${totalAudioDuration.toFixed(2)}s`)
    console.log(`Total Words Spoken    : ${totalWords} words`)

    // Calculate the real effective WPS of the TTS engine during this run
    const effectiveWPS = totalWords / totalAudioDuration
    console.log(`Effective TTS Speed   : ${effectiveWPS.toFixed(2)} words/sec`)

    const diff = Math.abs(totalAudioDuration - targetDuration)
    const diffPercent = (diff / targetDuration) * 100

    console.log(`\nDuration Drift        : ${diffPercent.toFixed(1)}% (${diff.toFixed(2)}s)`)

    if (diffPercent <= 15) {
      console.log('✅ PASS: Duration is highly accurate (within 15% tolerance).')
    } else {
      console.log('⚠️ WARN: Duration drifts beyond 15% tolerance.')
    }

    console.log(`=================================================\n`)
  } catch (error) {
    console.error(`❌ Test failed:`, error)
  } finally {
    // Cleanup
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }
}

runDurationTest()
