import { and, desc, eq, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { SeriesVideoGenerator } from '../../../plugins/sketch-pilot/src/core/generators/series-video-generator'
import { db } from '../database/db'
import {
  series,
  seriesAssets,
  seriesCharacters,
  seriesEvolutions,
  seriesLocations,
  seriesPlannedEpisodes,
  seriesRelationships,
  seriesThreads,
  videos,
  type NarrativeThread
} from '../database/schema'

export class SeriesRepository {
  async create(data: {
    id: string
    userId: string
    title: string
    description?: string
    globalContext?: string
    characterRegistry?: Record<string, any>
    locationRegistry?: Record<string, any>
    assetRegistry?: Record<string, any>

    totalEpisodes?: string
    language?: string
    aspectRatio?: string
    duration?: string
    videoType?: string
    videoGenre?: string
    promptId?: string
    audioProvider?: string
    kokoroVoicePreset?: string
    plannedEpisodes?: { number: number; title: string; hook: string }[]
    referenceStyleImage?: string
    visualStyleLock?: any
    status?: string
    blueprint?: any
    authorialSignature?: any
  }) {
    const [result] = await db
      .insert(series)
      .values({
        ...data,
        characterRegistry: data.characterRegistry || {},
        locationRegistry: data.locationRegistry || {},
        assetRegistry: data.assetRegistry || {},
        plannedEpisodes: data.plannedEpisodes || [],
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning()

    // Initial population of relational tables if data provided
    if (data.characterRegistry) await this.updateCharacterRegistry(data.id, data.characterRegistry)
    if (data.locationRegistry) await this.updateLocationRegistry(data.id, data.locationRegistry)
    if (data.assetRegistry) await this.updateAssetRegistry(data.id, data.assetRegistry)
    if (data.plannedEpisodes) await this.updatePlannedEpisodes(data.id, data.plannedEpisodes)

    return result
  }

  async findById(id: string) {
    const [result] = await db.select().from(series).where(eq(series.id, id))
    return result || null
  }

  async findByIdAndUserId(id: string, userId: string) {
    const [result] = await db
      .select()
      .from(series)
      .where(and(eq(series.id, id), eq(series.userId, userId)))
    return result || null
  }

  async findByUserId(userId: string) {
    const results = await db
      .select({
        series,
        episodesCount: sql<number>`(SELECT count(*) FROM ${videos} WHERE ${videos.seriesId} = ${series.id} AND ${videos.status} = 'completed')`,
        maxEpisode: sql<number>`(SELECT MAX(${videos.episodeNumber}) FROM ${videos} WHERE ${videos.seriesId} = ${series.id} AND ${videos.status} = 'completed')`
      })
      .from(series)
      .where(eq(series.userId, userId))
      .orderBy(desc(series.updatedAt))

    return results.map((r) => ({
      ...r.series,
      lastEpisodeNumber: r.maxEpisode || 0 // Override with true narrative progress
    }))
  }

  async update(id: string, data: any) {
    const [updated] = await db
      .update(series)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(series.id, id))
      .returning()

    // Sync to relational tables if registries/metadata are part of the update
    if (data.characterRegistry) await this.updateCharacterRegistry(id, data.characterRegistry)
    if (data.locationRegistry) await this.updateLocationRegistry(id, data.locationRegistry)
    if (data.assetRegistry) await this.updateAssetRegistry(id, data.assetRegistry)
    if (data.plannedEpisodes) await this.updatePlannedEpisodes(id, data.plannedEpisodes)
    if (data.unresolvedThreads) await this.updateThreads(id, data.unresolvedThreads)
    if (data.relationshipMap) await this.updateRelationships(id, data.relationshipMap)
    if (data.visualEvolution) await this.updateEvolution(id, 'character', 'appearance', data.visualEvolution)
    if (data.assetEvolution) await this.updateEvolution(id, 'asset', 'state', data.assetEvolution)

    return updated || null
  }

  async findLastByUserId(userId: string) {
    const [result] = await db
      .select()
      .from(series)
      .where(eq(series.userId, userId))
      .orderBy(desc(series.updatedAt))
      .limit(1)
    return result || null
  }

  /**
   * Fetches the full context required for the SeriesVideoGenerator.
   */
  async getSeriesContext(id: string) {
    const s = await this.findById(id)
    if (!s) return null

    // Get Relational Data (Registry + Narrative + Evolution)
    const [chars, locs, assets, threads, rels, evols, planned] = await Promise.all([
      db.select().from(seriesCharacters).where(eq(seriesCharacters.seriesId, id)),
      db.select().from(seriesLocations).where(eq(seriesLocations.seriesId, id)),
      db.select().from(seriesAssets).where(eq(seriesAssets.seriesId, id)),
      db.select().from(seriesThreads).where(eq(seriesThreads.seriesId, id)),
      db.select().from(seriesRelationships).where(eq(seriesRelationships.seriesId, id)),
      db.select().from(seriesEvolutions).where(eq(seriesEvolutions.seriesId, id)),
      db.select().from(seriesPlannedEpisodes).where(eq(seriesPlannedEpisodes.seriesId, id))
    ])

    // Reconstruct Registries
    const charRegistry: Record<string, any> = {}
    chars.forEach((c) => {
      charRegistry[c.name] = { ...((c.metadata as any) || {}), ...c }
    })

    const locRegistry: Record<string, any> = {}
    locs.forEach((l) => {
      locRegistry[l.name] = { ...((l.metadata as any) || {}), ...l }
    })

    const assetRegistry: Record<string, any> = {}
    assets.forEach((a) => {
      assetRegistry[a.name] = { ...((a.metadata as any) || {}), ...a }
    })

    // Reconstruct Threads
    const threadList: NarrativeThread[] = threads.map((t) => ({
      title: t.title,
      status: t.status as any,
      description: t.description,
      lastUpdatedEpisode: t.lastUpdatedEpisode || undefined
    }))

    // Reconstruct Evolution maps
    const visualEvolution: Record<string, string> = {}
    const assetEvolution: Record<string, string> = {}
    evols.forEach((e) => {
      if (e.entityType === 'character') visualEvolution[e.entityName] = e.evolutionValue
      if (e.entityType === 'asset') assetEvolution[e.entityName] = e.evolutionValue
    })

    // Reconstruct Relationship Map
    const relationshipMap: Record<string, Record<string, string>> = {}
    rels.forEach((r) => {
      if (!relationshipMap[r.characterA]) relationshipMap[r.characterA] = {}
      relationshipMap[r.characterA][r.characterB] = r.relationshipType
    })

    const plannedList = planned
      .map((p) => ({
        number: p.episodeNumber,
        title: p.title,
        hook: p.hook,
        ...((p.metadata as any) || {})
      }))
      .sort((a, b) => a.number - b.number)

    // Hardening: Fetch the LATEST successful video to get the most accurate state snapshot
    const [lastVideo] = await db
      .select()
      .from(videos)
      .where(and(eq(videos.seriesId, id), eq(videos.status, 'completed')))
      .orderBy(desc(videos.episodeNumber))
      .limit(1)

    return {
      seriesId: s.id,
      userId: s.userId,
      title: s.title,
      description: s.description || '',
      globalContext: lastVideo?.globalContext || s.globalContext || s.description || '',
      previousEpisodesContext: lastVideo?.previousEpisodesContext || s.previousEpisodesContext || '',
      characterRegistry: charRegistry,
      locationRegistry: locRegistry,
      assetRegistry,

      totalEpisodes: s.totalEpisodes ? Number(s.totalEpisodes) : undefined,
      lastEpisodeNumber: lastVideo?.episodeNumber || 0,
      episodeNumber: (lastVideo?.episodeNumber || 0) + 1,
      lastCliffhanger: s.lastCliffhanger ?? undefined,
      unresolvedThreads: threadList,

      // PROJECT SEQUEL: Episode Bridging context (Video-as-Source-of-Truth)
      lastEpisodeFinalImage: (lastVideo as any)?.lastEpisodeFinalImage || s.lastEpisodeFinalImage || undefined,
      lastEpisodeFinalScene: (lastVideo as any)?.lastEpisodeFinalScene || s.lastEpisodeFinalScene || undefined,

      status: s.status ?? undefined,
      language: s.language ?? undefined,
      aspectRatio: s.aspectRatio ?? undefined,
      duration: s.duration ?? undefined,
      videoType: s.videoType ?? undefined,
      videoGenre: s.videoGenre ?? undefined,
      promptId: s.promptId ?? undefined,
      audioProvider: s.audioProvider ?? undefined,
      kokoroVoicePreset: s.kokoroVoicePreset ?? undefined,
      plannedEpisodes: plannedList,
      currentEpisodePitch: undefined as string | undefined,
      isFinalEpisode: undefined as boolean | undefined,

      // V13+ fields
      visualEvolution,
      weatherState: s.weatherState ?? undefined,
      timeOfDay: s.timeOfDay ?? undefined,
      relationshipMap,
      assetEvolution,
      colorPalette: s.colorPalette ?? undefined,
      symbolicMotifs: (s.symbolicMotifs as string[]) || [],
      cameraStyle: s.cameraStyle ?? undefined,
      threads: threadList,
      roadmap: s.roadmap ?? undefined,
      narrationLayer: s.narrationLayer ?? undefined,
      tensionState: (s.narrationLayer as any)?.tensionState ?? undefined,
      referenceStyleImage: s.referenceStyleImage ?? undefined,
      visualStyleLock: s.visualStyleLock ?? undefined,
      blueprint: s.blueprint ?? undefined,
      authorialSignature: s.authorialSignature ?? undefined,

      // V21 Recency Bias
      lastEpisodeSummary: this.getLastEpisodeSummary(s.previousEpisodesContext || '')
    }
  }

  private getLastEpisodeSummary(history: string): string | undefined {
    if (!history) return undefined
    const parts = history.split('--- Episode Summary ---')
    const lastPart = parts.at(-1)
    return lastPart ? lastPart.trim() : undefined
  }

  async updateNarrativeContext(id: string, data: { lastCliffhanger?: any; unresolvedThreads?: NarrativeThread[] }) {
    const [updated] = await db
      .update(series)
      .set({
        lastCliffhanger: data.lastCliffhanger,
        unresolvedThreads: data.unresolvedThreads, // Legacy sync
        updatedAt: new Date()
      })
      .where(eq(series.id, id))
      .returning()

    if (data.unresolvedThreads) await this.updateThreads(id, data.unresolvedThreads)

    return updated
  }

  async updateThreads(seriesId: string, threads: NarrativeThread[]) {
    // For simplicity in Phase 2, we overwrite the threads table for the series
    // In a high-concurrency production env, we'd use surgical upserts
    await db.delete(seriesThreads).where(eq(seriesThreads.seriesId, seriesId))
    if (threads.length > 0) {
      const values = threads.map((t) => ({
        id: uuidv4(),
        seriesId,
        title: t.title,
        status: t.status,
        description: t.description,
        lastUpdatedEpisode: t.lastUpdatedEpisode,
        metadata: t
      }))
      await db.insert(seriesThreads).values(values)
    }
  }

  async updateRelationships(seriesId: string, map: Record<string, Record<string, string>>) {
    await db.delete(seriesRelationships).where(eq(seriesRelationships.seriesId, seriesId))
    const values: any[] = []
    for (const [charA, targets] of Object.entries(map)) {
      for (const [charB, type] of Object.entries(targets)) {
        values.push({ id: uuidv4(), seriesId, characterA: charA, characterB: charB, relationshipType: type })
      }
    }
    if (values.length > 0) await db.insert(seriesRelationships).values(values)
  }

  async updateEvolution(seriesId: string, entityType: string, evolutionKey: string, map: Record<string, string>) {
    // Atomic update for evolutions
    for (const [name, value] of Object.entries(map)) {
      const [existing] = await db
        .select()
        .from(seriesEvolutions)
        .where(
          and(
            eq(seriesEvolutions.seriesId, seriesId),
            eq(seriesEvolutions.entityName, name),
            eq(seriesEvolutions.evolutionKey, evolutionKey)
          )
        )

      const id = existing?.id || uuidv4()
      await db
        .insert(seriesEvolutions)
        .values({
          id,
          seriesId,
          entityType,
          entityName: name,
          evolutionKey,
          evolutionValue: value,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: seriesEvolutions.id,
          set: { evolutionValue: value, updatedAt: new Date() }
        })
    }
  }

  async updatePlannedEpisodes(seriesId: string, episodes: { number: number; title: string; hook: string }[]) {
    await db.delete(seriesPlannedEpisodes).where(eq(seriesPlannedEpisodes.seriesId, seriesId))
    if (episodes.length > 0) {
      const values = episodes.map((e) => ({
        id: uuidv4(),
        seriesId,
        episodeNumber: e.number,
        title: e.title,
        hook: e.hook,
        metadata: e
      }))
      await db.insert(seriesPlannedEpisodes).values(values)
    }
  }

  async updateFinalBridge(id: string, data: { lastEpisodeFinalImage: string; lastEpisodeFinalScene: any }) {
    const [updated] = await db
      .update(series)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(series.id, id))
      .returning()
    return updated
  }

  async incrementEpisodeNumber(id: string) {
    const [lastVideo] = await db
      .select()
      .from(videos)
      .where(and(eq(videos.seriesId, id), eq(videos.status, 'completed')))
      .orderBy(desc(videos.episodeNumber))
      .limit(1)

    const nextEpisodeNumber = lastVideo?.episodeNumber || 0

    const [updated] = await db
      .update(series)
      .set({
        lastEpisodeNumber: String(nextEpisodeNumber),
        updatedAt: new Date()
      })
      .where(eq(series.id, id))
      .returning()
    return updated
  }

  async updateCharacterRegistry(seriesId: string, registry: Record<string, any>) {
    for (const [name, data] of Object.entries(registry)) {
      await this.updateRegistryItem(seriesId, 'characterRegistry', name, data)
    }
    return await db.update(series).set({ characterRegistry: registry }).where(eq(series.id, seriesId)).returning()
  }

  async updateLocationRegistry(seriesId: string, registry: Record<string, any>) {
    for (const [name, data] of Object.entries(registry)) {
      await this.updateRegistryItem(seriesId, 'locationRegistry', name, data)
    }
    return await db.update(series).set({ locationRegistry: registry }).where(eq(series.id, seriesId)).returning()
  }

  async updateAssetRegistry(seriesId: string, registry: Record<string, any>) {
    for (const [name, data] of Object.entries(registry)) {
      await this.updateRegistryItem(seriesId, 'assetRegistry', name, data)
    }
    return await db.update(series).set({ assetRegistry: registry }).where(eq(series.id, seriesId)).returning()
  }

  async updateRegistryItem(
    seriesId: string,
    column: 'characterRegistry' | 'locationRegistry' | 'assetRegistry',
    itemKey: string,
    itemData: any
  ) {
    const normalizedKey = SeriesVideoGenerator.normalizeId(itemKey)
    console.info(`[SeriesRepo] 🔄 Relational Sync for ${column}:${itemKey} -> ${normalizedKey}`)

    const table =
      column === 'characterRegistry' ? seriesCharacters : column === 'locationRegistry' ? seriesLocations : seriesAssets

    // Find existing by normalized name + seriesId to prevent duplicates like Elias vs @Elias
    const [existing] = await db
      .select()
      .from(table as any)
      .where(and(eq((table as any).seriesId, seriesId), eq((table as any).name, normalizedKey)))

    const id = existing?.id || uuidv4()
    const values: any = {
      id,
      seriesId,
      name: normalizedKey,
      displayName: itemKey, // Preserve original casing/handle for display
      description: itemData.description ?? existing?.description,
      thumbnailUrl: itemData.thumbnailUrl ?? existing?.thumbnailUrl,
      updatedAt: new Date(),
      metadata: { ...((existing?.metadata as any) || {}), ...itemData }
    }

    if (column === 'characterRegistry') {
      values.motivation = itemData.motivation ?? (existing as any)?.motivation
      values.backstory = itemData.backstory ?? (existing as any)?.backstory
      values.isNew = String(itemData.isNew ?? (existing as any)?.isNew ?? false)
      values.fate = itemData.fate || (existing as any)?.fate || 'ALIVE'
      values.abilities = itemData.abilities || (existing as any)?.abilities || []
      values.knownFacts = itemData.knownFacts || (existing as any)?.knownFacts || []
      values.firstMentionedEpisode = itemData.firstMentionedEpisode ?? (existing as any)?.firstMentionedEpisode
    } else if (column === 'locationRegistry') {
      values.atmosphere = itemData.atmosphere ?? (existing as any)?.atmosphere
      values.firstMentionedEpisode = itemData.firstMentionedEpisode ?? (existing as any)?.firstMentionedEpisode
    } else if (column === 'assetRegistry') {
      values.type = itemData.type || (existing as any)?.type || 'object'
    }

    await db
      .insert(table as any)
      .values(values)
      .onConflictDoUpdate({
        target: (table as any).id,
        set: values
      })

    // Legacy sync back to JSONB using the NORMALIZED key to keep things clean
    return await db
      .update(series)
      .set({
        [column]: sql`jsonb_set(COALESCE(${series[column]}, '{}'::jsonb), ${sql.raw(`'{${normalizedKey.replaceAll("'", "''")}}'`)}, ${JSON.stringify(itemData)}::jsonb, true)`
      })
      .where(eq(series.id, seriesId))
      .returning()
  }

  async appendEpisodeSummary(id: string, summary: string) {
    const s = await this.findById(id)
    if (!s) return null
    const newHistory = s.previousEpisodesContext
      ? `${s.previousEpisodesContext}\n\n--- Episode Summary ---\n${summary}`
      : `--- Episode Summary ---\n${summary}`
    const [updated] = await db
      .update(series)
      .set({ previousEpisodesContext: newHistory, updatedAt: new Date() })
      .where(eq(series.id, id))
      .returning()
    return updated
  }

  async delete(id: string, userId: string) {
    const [deleted] = await db
      .delete(series)
      .where(and(eq(series.id, id), eq(series.userId, userId)))
      .returning()
    return deleted || null
  }
}
