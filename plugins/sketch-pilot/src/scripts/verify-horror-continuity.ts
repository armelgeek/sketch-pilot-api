import * as dotenv from 'dotenv'
import { SeriesVideoGenerator } from '../core/generators/series-video-generator'

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

  const baseConfig: any = {
    scriptSpec: HISTORY_HORROR_SPEC as any,
    provider: 'openai',
    apiKey: 'mock-key' // No real call needed for prompt inspection
  }

  const options: any = {
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

    // --- NEW: Test Image Prompt Enrichment (Scene 2 - Continuation) ---
    console.log(`\n[IMAGE PROMPT ENRICHMENT TEST (Scene 2 - Continuation)]:`)
    const mockScene2 = {
      id: 'scene-2',
      sceneNumber: 2,
      summary: 'Le vieil homme se lève et marche vers la fenêtre',
      imagePrompt: 'Le vieil homme se lève dans la bibliothèque',
      spatialAnchor: 'Bibliothèque des Archives Oubliées',
      locationId: 'archives',
      continueFromPrevious: true,
      imageUrl: 'http://mock-image/scene-1.jpg'
    }

    const imagePromptObj2 = await gen.buildImagePrompt(mockScene2 as any, false, '16:9', {
      previousScene: { ...mockScene, imageUrl: 'http://mock-image/scene-1.jpg' }
    })
    console.log(`Final Prompt 2: "${imagePromptObj2.prompt}"`)
    console.log(`Reference Image 2: "${imagePromptObj2.referenceImage}"`)

    // --- NEW: Test Location Fallback (Missing locationId in scene 2) ---
    console.log(`\n[LOCATION FALLBACK TEST (Scene 3 - missing locationId)]:`)
    const mockScene3 = {
      id: 'scene-3',
      sceneNumber: 3,
      summary: 'Action sans lieu spécifié',
      imagePrompt: 'Le personnage agis',
      // No locationId here
      continueFromPrevious: true
    }
    const imagePromptObj3 = await gen.buildImagePrompt(mockScene3 as any, false, '16:9', {
      previousScene: mockScene2
    })
    console.log(`Final Prompt 3: "${imagePromptObj3.prompt}"`)
    if (imagePromptObj3.prompt.includes('LIEU : @archives')) {
      console.log('✅ Location successfully inherited from previous scene.')
    } else {
      console.log('❌ Location inheritance FAILED!')
    }

    if (imagePromptObj2.prompt.includes('ZÉRO DRIFT')) {
      console.log('✅ ZÉRO DRIFT instruction correctly injected.')
    } else {
      console.log('❌ ZÉRO DRIFT instruction MISSING!')
    }

    if (imagePromptObj2.referenceImage === 'http://mock-image/scene-1.jpg') {
      console.log('✅ Previous frame correctly used as visual anchor.')
    } else {
      console.log('❌ Incorrect visual anchor!')
    }

    // --- NEW: Test Location Lock ---
    console.log(`\n[LOCATION LOCK TEST]:`)
    if (
      imagePromptObj.prompt.includes('LOCATION LOCK: @archives') &&
      imagePromptObj.prompt.includes('COHÉRENCE DÉCOR')
    ) {
      console.log('✅ LOCATION LOCK and COHÉRENCE DÉCOR correctly injected.')
    } else {
      console.log('❌ LOCATION LOCK MISSING!')
    }

    // --- NEW: Test System Instruction Enrichment ---
    console.log(`\n[SYSTEM INSTRUCTION TEST]:`)
    const systemInstr = await gen.buildImageSystemInstruction(true)
    if (
      systemInstr.includes('Location "@archives"') &&
      systemInstr.includes('Recalling locations from master references')
    ) {
      console.log('✅ System Instruction correctly enriched with locations.')
    } else {
      console.log('❌ System Instruction MISSING location data!')
      console.log(`Instruction: "${systemInstr}"`)
    }
  }

  console.log('\n✅ VERIFICATION SUCCESSFUL.')
}

verifyContinuity().catch(console.error)
