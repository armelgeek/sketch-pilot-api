import process from 'node:process'
import { SeriesVideoGenerator } from '@sketch-pilot/core/generators/series-video-generator'
import mongoose from 'mongoose'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'
import 'dotenv/config'

async function runTest() {
  const seriesId = process.argv[2]
  const characterName = process.argv[3] // e.g., "Arthur"

  if (!seriesId || !characterName) {
    console.error('Usage: npx ts-node scripts/test-character-consistency.ts <seriesId> <characterName>')
    process.exit(1)
  }

  console.log(`\n=== 🧪 TEST DE COHÉRENCE PERSONNAGE ===`)
  console.log(`➔ Série ID: ${seriesId}`)
  console.log(`➔ Test de détection pour: "${characterName}"\n`)

  try {
    // 1. Connect to DB
    await mongoose.connect(process.env.MONGODB_URI as string)
    console.log(`[OK] Connecté à MongoDB`)

    // 2. Fetch Series Context
    const seriesRepo = new SeriesRepository()
    const seriesContext = await seriesRepo.getSeriesContext(seriesId)

    if (!seriesContext) {
      console.error(`[ERREUR] Impossible de trouver la série ${seriesId} ou son contexte.`)
      process.exit(1)
    }

    console.log(
      `[OK] Contexte de saga récupéré. Personnages dans le registre:`,
      Object.keys(seriesContext.characterRegistry)
    )

    // 3. Initialize the SeriesVideoGenerator
    const generator = new SeriesVideoGenerator(
      {
        llmProvider: 'gemini',
        imageStyle: { promptSuffix: 'in cinematic style' }
      } as any,
      seriesContext as any
    )

    // 4. Test 1: Resolve Character Images
    console.log(`\n--- TEST 1: Extraction des Images de Référence ---`)
    const resolvedImages = await generator.resolveCharacterImages()
    console.log(`Images trouvées pour Gemini (doit contenir { name, data }):`)
    resolvedImages.forEach((img, i) => {
      if (typeof img === 'object' && img.name) {
        console.log(`  ${i + 1}. Label: @${img.name} | Data length: ${img.data.length} chars`)
      } else {
        console.log(`  ${i + 1}. Structure inattendue:`, img)
      }
    })

    // 5. Test 2: Build Image Prompt via Regex Detection
    console.log(`\n--- TEST 2: Injection du Prompt (Deep Consistency) ---`)

    // Create a mock scene containing the character's name
    const mockScene = {
      id: 'scene-1',
      summary: `Dans l'obscurité, ${characterName} s'avance lentement en tenant une lampe tempête.`,
      imagePrompt: `A dark gothic street, ${characterName} holding a lantern.`
    }

    console.log(`Prompt original: "${mockScene.imagePrompt}"`)

    const finalPromptData = await generator.buildImagePrompt(mockScene as any)
    console.log(`\nPrompt final injecté pour Gemini:`)
    console.log(`"${finalPromptData.instructions}"`)

    // 6. Test 3: Check if the specific character got injected correctly
    if (
      finalPromptData.instructions.includes(characterName) &&
      finalPromptData.instructions.length > mockScene.imagePrompt.length
    ) {
      console.log(`\n[SUCCÈS] Le profil de ${characterName} a été automatiquement détecté et ajouté au prompt ! ✨`)
    } else {
      console.warn(
        `\n[ATTENTION] La détection n'a pas réagi. Vérifiez que la majuscule correspond exactement ou que le personnage existe dans le registre avec un vrai portraitPrompt.`
      )
    }
  } catch (error) {
    console.error('[ERREUR]', error)
  } finally {
    await mongoose.disconnect()
    process.exit(0)
  }
}

runTest()
