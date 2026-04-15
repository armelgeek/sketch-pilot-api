import process from 'node:process'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/index'
import {
  series,
  seriesEvolutions,
  seriesPlannedEpisodes,
  seriesRelationships,
  seriesThreads
} from '../schema/series.schema'

async function migrate() {
  console.info('🚀 Starting Phase 2 narrative migration...')

  const allSeries = await db.select().from(series)
  console.info(`Found ${allSeries.length} series to process.`)

  for (const s of allSeries) {
    console.info(`Processing series: ${s.id} (${s.title})`)

    // 1. Threads
    const threads = (s.unresolvedThreads as any[]) || []
    for (const t of threads) {
      console.info(`  - Thread: ${t.title}`)
      await db
        .insert(seriesThreads)
        .values({
          id: uuidv4(),
          seriesId: s.id,
          title: t.title,
          status: t.status || 'open',
          description: t.description || '',
          lastUpdatedEpisode: t.lastUpdatedEpisode,
          metadata: t,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        })
        .onConflictDoNothing()
    }

    // 2. Relationships
    const relMap = (s.relationshipMap as Record<string, Record<string, string>>) || {}
    for (const [charA, targets] of Object.entries(relMap)) {
      for (const [charB, type] of Object.entries(targets)) {
        console.info(`  - Relationship: ${charA} -> ${charB} (${type})`)
        await db
          .insert(seriesRelationships)
          .values({
            id: uuidv4(),
            seriesId: s.id,
            characterA: charA,
            characterB: charB,
            relationshipType: type,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt
          })
          .onConflictDoNothing()
      }
    }

    // 3. Evolutions (Visual & Asset)
    const visualEv = (s.visualEvolution as Record<string, string>) || {}
    for (const [name, value] of Object.entries(visualEv)) {
      console.info(`  - Visual Evolution: ${name} -> ${value}`)
      await db
        .insert(seriesEvolutions)
        .values({
          id: uuidv4(),
          seriesId: s.id,
          entityType: 'character',
          entityName: name,
          evolutionKey: 'appearance',
          evolutionValue: value,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        })
        .onConflictDoNothing()
    }

    const assetEv = (s.assetEvolution as Record<string, string>) || {}
    for (const [name, value] of Object.entries(assetEv)) {
      console.info(`  - Asset Evolution: ${name} -> ${value}`)
      await db
        .insert(seriesEvolutions)
        .values({
          id: uuidv4(),
          seriesId: s.id,
          entityType: 'asset',
          entityName: name,
          evolutionKey: 'state',
          evolutionValue: value,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        })
        .onConflictDoNothing()
    }

    // 4. Planned Episodes
    const planned = (s.plannedEpisodes as any[]) || []
    for (const p of planned) {
      console.info(`  - Planned Episode ${p.number}: ${p.title}`)
      await db
        .insert(seriesPlannedEpisodes)
        .values({
          id: uuidv4(),
          seriesId: s.id,
          episodeNumber: p.number,
          title: p.title,
          hook: p.hook,
          metadata: p,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        })
        .onConflictDoNothing()
    }
  }

  console.info('✅ Phase 2 migration completed successfully.')
}

migrate().catch((error) => {
  console.error('❌ Phase 2 migration failed:', error)
  process.exit(1)
})
