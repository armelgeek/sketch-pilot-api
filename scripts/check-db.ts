import { eq } from 'drizzle-orm'
import { client, db } from '../src/infrastructure/database/db'
import { series } from '../src/infrastructure/database/schema/series.schema'

async function run() {
  try {
    const seriesId = 'aac0255b-3b47-42ea-af1c-c2d3c127a196'
    const [seriesData] = await db.select().from(series).where(eq(series.id, seriesId)).limit(1)

    if (!seriesData) {
      console.log('Série non trouvée:', seriesId)
      return
    }

    console.log('Série:', seriesData.title)
    console.log('Registre de Personnages:', JSON.stringify(seriesData.characterRegistry, null, 2))

    const characterRegistry: any = seriesData.characterRegistry || {}
    const characterName = Object.keys(characterRegistry)[0] || 'Unknown'

    const mockScene = {
      imagePrompt: `A dark street. ${characterName} looks around nervously while waiting for the carriage.`,
      charactersInScene: [characterName]
    }

    console.log('\n--- SIMULATION DE LA FONCTION buildImagePrompt ---')
    let paragraph = mockScene.imagePrompt

    const characterMatches = mockScene.charactersInScene || []

    console.log('Personnages injectés:', characterMatches)

    const referenceImages: any[] = []

    if (characterMatches.length > 0) {
      for (const name of characterMatches) {
        const char = characterRegistry[name]
        if (char) {
          console.log(`[SUCCÈS] Personnage MATCHÉ: ${name}`)
          const visualAnchor = char.portraitPrompt || char.description
          if (visualAnchor && !paragraph.includes(visualAnchor.slice(0, 30))) {
            paragraph += `, Character ${name}: ${visualAnchor}`
          }

          if (char.modelId && !paragraph.includes(char.modelId)) {
            paragraph += `, UTILISER MODÈLE ID: ${char.modelId}`
          }

          // On simule resolveCharacterImages() en poussant un objet referenceImages
          if (char.thumbnailUrl) {
            referenceImages.push({ name, data: char.thumbnailUrl })
          } else {
            // Pour le test, si pas d'image, on simule une image base64
            referenceImages.push({
              name,
              data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
            })
          }
        } else {
          console.log(`[IGNORE] ${name} n'est pas dans le registre.`)
        }
      }
    }

    console.log('\nPROMPT FINAL:')
    console.log(paragraph)

    console.log("\n--- SIMULATION DU PAYLOAD GEMINI AVANT L'APPEL ---")
    const contents: any[] = []
    if (referenceImages.length > 0) {
      contents.push({
        text: 'REFERENCE IMAGES: Use the following images as the ABSOLUTE SOURCE OF TRUTH...'
      })
      for (const img of referenceImages) {
        contents.push(
          { text: `NAME: @${img.name}` },
          { inlineData: { mimeType: 'image/png', data: '[BASE64_DATA_TRUNCATED]' } }
        )
      }
    }
    contents.push({ text: `${paragraph}\n\nCRITICAL ANATOMY RULES: ...` })

    console.log(JSON.stringify(contents, null, 2))
  } catch (error) {
    console.error("Erreur lors de l'exécution", error)
  } finally {
    await client.end()
  }
}

run()
