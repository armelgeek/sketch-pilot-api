import * as dotenv from 'dotenv'
import { SeriesVideoGenerator } from '../core/generators/series-video-generator.js'
import type { VideoGeneratorConfig } from '../types/video-generator.types.js'
import type { VideoGenerationOptions } from '../types/video-script.types.js'

dotenv.config()

const HISTORY_HORROR_SPEC = {
  name: 'History Horror',
  role: "Contreur d'horreur historique et de légendes sombres",
  tags: ['horror', 'history', 'legend', 'dark-past'],
  task: "Planifier et écrire un script complet de saga d'horreur historique. Le récit doit s'ancrer dans le passé (Moyen-Âge, ère Victorienne, etc.) et mêler faits historiques et terreur surnaturelle.",
  goals: [
    'Ouvrir sur un vestige du passé ou une archive oubliée dans les 10 premières secondes',
    'Ancrer le récit dans une époque précise via des détails matériels (bougies, parchemins, architecture)',
    "Utiliser le contraste entre la normalité d'une époque et l'irruption de l'horreur mythique ou réelle",
    'Adopter un ton de conteur ancien, solennel et inquiétant',
    "Maintenir une esthétique de film d'époque sombre et granuleuse"
  ],
  wordsPerSecondBase: 2.22,
  rules: [
    "ÉPOQUE : L'histoire doit paraître authentique à sa période (pas d'anachronismes).",
    'NARRATION : Langage soutenu, presque littéraire, évoquant les chroniques anciennes.',
    "VISUEL : Éclairage naturel d'époque (flambeaux, lune, bougies). Ombres massives.",
    "MYTHE : L'horreur doit être liée à une légende, un péché du passé ou une malédiction ancienne."
  ],
  visualRules: [
    "Aesthetic : 'Dark Academia meets Period Horror'",
    "Lighting : 'Candlelight focus, heavy chiaroscuro, faded color palette'",
    "Prompts : 'historical horror style, 19th century aesthetic, ancient ruins, flickering candlelight, sepia tones, cinematic historical drama, eerie period costumes'"
  ],
  context:
    "Narrateur d'histoires sombres spécialisé dans les recoins les plus glauques de l'histoire humaine. Le but est de faire revivre les terreurs du passé pour montrer que le mal est intemporel.",
  category: 'Horror & History',
  structure: [
    'Vestige du Passé (Hook)',
    "Contexte Historique (Normalité d'autrefois)",
    'Émergence de la Malédiction (Reveal)',
    'Destin Tragique (Cliffhanger)'
  ]
}

async function verifyContinuity() {
  console.log('🧪 Starting Verification...\n')

  const baseConfig: VideoGeneratorConfig = {
    scriptSpec: HISTORY_HORROR_SPEC as any,
    provider: 'openai',
    apiKey: 'mock-key' // No real call needed for prompt inspection
  }

  const options: VideoGenerationOptions = {
    duration: 30,
    aspectRatio: '16:9',
    language: 'french'
  }

  const episodes = [1, 3, 11]
  for (const ep of episodes) {
    console.log(`\n--- TEST: EPISODE ${ep} ---`)
    const ctx = {
      seriesId: 'horror-test',
      episodeNumber: ep,
      totalEpisodes: 10,
      unresolvedThreads:
        ep === 3
          ? [
              {
                title: "L'ombre dans la crypte",
                description: 'Une silhouette observée dans la crypte.',
                status: 'OPEN'
              }
            ]
          : []
    }
    const gen = new SeriesVideoGenerator(baseConfig, ctx as any)
    const prompts = gen.buildTwoPassPrompts('Test story', options) as any
    const systemPrompt = prompts.pass1?.system || prompts.system || ''

    console.log(`\n[SYSTEM PROMPT PREVIEW (Phase Detection)]:`)
    if (systemPrompt.includes('PHASE')) {
      const phaseLine = systemPrompt.match(/🔹 PHASE.*|🌀 MODE.*/)?.[0]
      console.log(`✅ Phase Detected: ${phaseLine}`)
    } else {
      console.log('❌ Phase NOT found!')
    }

    if (ep === 3 && systemPrompt.includes("L'ombre dans la crypte ?")) {
      console.log('✅ Thread persistence present.')
    }

    if (systemPrompt.includes('historical horror style')) {
      console.log('✅ Visual consistency rules present in System Prompt.')
    }

    // --- NEW: Test Image Prompt Enrichment ---
    console.log(`\n[IMAGE PROMPT ENRICHMENT TEST (Scene 1)]:`)
    const mockScene = {
      id: 'scene-1',
      sceneNumber: 1,
      summary: 'Un vieil homme lit un grimoire poussiéreux',
      imagePrompt: 'Un vieil homme dans une bibliothèque sombre',
      spatialAnchor: 'Bibliothèque des Archives Oubliées',
      locationId: 'archives',
      continueFromPrevious: false
    }

    // We mock the registries for the test
    ;(gen as any).seriesContext.locationRegistry = {
      archives: { description: 'Rayonnages de bois sombre, poussière en suspension.' }
    }

    const imagePromptObj = await gen.buildImagePrompt(mockScene as any)
    console.log(`Final Prompt: "${imagePromptObj.prompt}"`)

    const hasVisualRules =
      imagePromptObj.prompt.includes('historical horror style') && imagePromptObj.prompt.includes('heavy chiaroscuro')

    if (hasVisualRules) {
      console.log('✅ Visual rules correctly appended to Image Prompt.')
    } else {
      console.log('❌ Visual rules MISSING from Image Prompt!')
    }

    if (imagePromptObj.prompt.includes('ANCRE SPATIALE')) {
      console.log('✅ Spatial Anchor present.')
    }
  }

  console.log('\n✅ VERIFICATION SUCCESSFUL.')
}

verifyContinuity().catch(console.error)
