import process from 'node:process'
import { eq, sql } from 'drizzle-orm'
import { SeriesVideoGenerator } from '../../../../plugins/sketch-pilot/src/core/generators/series-video-generator'
import { db } from '../db'
import { seriesAssets, seriesCharacters, seriesLocations } from '../schema'

async function migrate() {
  console.info('🚀 Starting Registry Deduplication & Normalization...')

  // 1. Add display_name columns if they don't exist (Drizzle-safe raw SQL)
  try {
    await db.execute(sql`ALTER TABLE series_characters ADD COLUMN IF NOT EXISTS display_name TEXT`)
    await db.execute(sql`ALTER TABLE series_locations ADD COLUMN IF NOT EXISTS display_name TEXT`)
    await db.execute(sql`ALTER TABLE series_assets ADD COLUMN IF NOT EXISTS display_name TEXT`)
    console.info('✅ Display name columns ensured.')
  } catch (error) {
    console.error('⚠️ Error adding columns (might already exist):', error)
  }

  const tables = [
    { name: 'Characters', table: seriesCharacters },
    { name: 'Locations', table: seriesLocations },
    { name: 'Assets', table: seriesAssets }
  ]

  for (const { name: tableName, table } of tables) {
    console.info(`\n📦 Processing ${tableName}...`)

    // Fetch all entries
    const allEntries = await db.select().from(table as any)

    // Group by seriesId
    const bySeries: Record<string, any[]> = {}
    allEntries.forEach((e) => {
      if (!bySeries[e.seriesId]) bySeries[e.seriesId] = []
      bySeries[e.seriesId].push(e)
    })

    for (const [seriesId, entries] of Object.entries(bySeries)) {
      const normalizedGroups: Record<string, any[]> = {}

      entries.forEach((e) => {
        const norm = SeriesVideoGenerator.normalizeId(e.name)
        if (!normalizedGroups[norm]) normalizedGroups[norm] = []
        normalizedGroups[norm].push(e)
      })

      for (const [normKey, group] of Object.entries(normalizedGroups)) {
        if (group.length > 1 || group[0].name !== normKey) {
          console.info(`   🔄 Normalizing/Merging group for ${normKey} in series ${seriesId} (${group.length} items)`)

          // Pick the winner: Prefer one with thumbnailUrl, then prefer one that already had @
          const winner = group.sort((a, b) => {
            if (a.thumbnailUrl && !b.thumbnailUrl) return -1
            if (!a.thumbnailUrl && b.thumbnailUrl) return 1
            if (a.name.startsWith('@') && !b.name.startsWith('@')) return -1
            if (!a.name.startsWith('@') && b.name.startsWith('@')) return 1
            return 0
          })[0]

          // Use the original name of the winner as displayName if not set
          const displayName = winner.displayName || winner.name

          // Update the winner to normalized key and display name
          await db
            .update(table as any)
            .set({
              name: normKey,
              displayName,
              updatedAt: new Date()
            })
            .where(eq((table as any).id, winner.id))

          // Delete others
          const toDelete = group.filter((e) => e.id !== winner.id)
          for (const d of toDelete) {
            console.info(`      ❌ Deleting duplicate: ${d.name} (${d.id})`)
            await db.delete(table as any).where(eq((table as any).id, d.id))
          }
        } else if (!group[0].displayName) {
          await db
            .update(table as any)
            .set({ displayName: group[0].name })
            .where(eq((table as any).id, group[0].id))
        }
      }
    }
  }

  console.info('\n✨ Deduplication complete!')
  process.exit(0)
}

migrate().catch((error) => {
  console.error('❌ Migration failed:', error)
  process.exit(1)
})
