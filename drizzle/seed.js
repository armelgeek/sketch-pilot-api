import { randomUUID } from 'node:crypto'
import { db } from '../src/infrastructure/database/db'
import { trialConfig } from '../src/infrastructure/database/schema/trial-config.schema'

async function seed() {
  console.log('⏳ Seeding database...')

  // Vérifier si une configuration d'essai existe déjà
  const existingConfig = await db.select().from(trialConfig).limit(1)

  if (existingConfig.length === 0) {
    // Insérer la configuration par défaut
    await db.insert(trialConfig).values({
      id: randomUUID(),
      isEnabled: true,
      durationInDays: 7,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    console.log('✅ Trial config added')
  } else {
    console.log('ℹ️ Trial config already exists')
  }

  console.log('✅ Database seeded')
}

await seed().catch((error) => {
  console.error('❌ Seeding failed:', error)
})
