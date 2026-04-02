import { eq } from 'drizzle-orm'
import { client, db } from '../../../../src/infrastructure/database/db'
import { prompts } from '../../../../src/infrastructure/database/schema/prompt.schema'

async function cleanupPrompts() {
  console.log('🚀 Starting Prompt Specification Cleanup...')

  try {
    const allPrompts = await db.select().from(prompts)
    console.log(`[1/3] Found ${allPrompts.length} prompt records.`)

    let updatedCount = 0

    for (const prompt of allPrompts) {
      if (!prompt.config) continue

      const config = { ...prompt.config }
      let changed = false

      const redundantFields = [
        'rules',
        'formatting',
        'outputFormat',
        'instructions',
        'scenePresets',
        'visualRules',
        'orchestration',
        'wordsPerSecondBase'
      ]

      for (const field of redundantFields) {
        if (field in config) {
          delete config[field]
          changed = true
        }
      }

      if (changed) {
        await db.update(prompts).set({ config, updatedAt: new Date() }).where(eq(prompts.id, prompt.id))

        updatedCount++
        console.log(`[2/3] Updated prompt: ${prompt.name} (${prompt.id})`)
      }
    }

    console.log(`\n✅ [3/3] Cleanup complete. ${updatedCount} records pruned.`)
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error)
    process.exit(1)
  } finally {
    await client.end()
    process.exit(0)
  }
}

cleanupPrompts()
