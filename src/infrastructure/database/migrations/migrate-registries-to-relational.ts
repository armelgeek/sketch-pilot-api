import process from 'node:process'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/index'
import { series, seriesAssets, seriesCharacters, seriesLocations } from '../schema/series.schema'

async function migrate() {
  console.log('🚀 Starting registry migration...')

  const allSeries = await db.select().from(series)
  console.log(`Found ${allSeries.length} series to process.`)

  for (const s of allSeries) {
    console.log(`Processing series: ${s.id} (${s.title})`)

    // 1. Characters
    const charRegistry = (s.characterRegistry as Record<string, any>) || {}
    for (const [name, data] of Object.entries(charRegistry)) {
      console.log(`  - Character: ${name}`)
      await db
        .insert(seriesCharacters)
        .values({
          id: uuidv4(),
          seriesId: s.id,
          name,
          description: data.description,
          motivation: data.motivation,
          backstory: data.backstory,
          thumbnailUrl: data.thumbnailUrl,
          isNew: String(data.isNew ?? false),
          fate: data.fate || 'ALIVE',
          abilities: data.abilities || [],
          knownFacts: data.knownFacts || [],
          firstMentionedEpisode: data.firstMentionedEpisode,
          metadata: data,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        })
        .onConflictDoNothing()
    }

    // 2. Locations
    const locRegistry = (s.locationRegistry as Record<string, any>) || {}
    for (const [name, data] of Object.entries(locRegistry)) {
      console.log(`  - Location: ${name}`)
      await db
        .insert(seriesLocations)
        .values({
          id: uuidv4(),
          seriesId: s.id,
          name,
          description: data.description,
          atmosphere: data.atmosphere,
          thumbnailUrl: data.thumbnailUrl,
          firstMentionedEpisode: data.firstMentionedEpisode,
          metadata: data,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        })
        .onConflictDoNothing()
    }

    // 3. Assets
    const assetRegistry = (s.assetRegistry as Record<string, any>) || {}
    for (const [name, data] of Object.entries(assetRegistry)) {
      console.log(`  - Asset: ${name}`)
      await db
        .insert(seriesAssets)
        .values({
          id: uuidv4(),
          seriesId: s.id,
          name,
          description: data.description,
          type: data.type || 'object',
          thumbnailUrl: data.thumbnailUrl,
          metadata: data,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        })
        .onConflictDoNothing()
    }
  }

  console.log('✅ Migration completed successfully.')
}

migrate().catch((error) => {
  console.error('❌ Migration failed:', error)
  process.exit(1)
})
