import { eq } from 'drizzle-orm'
import { db } from '../database/db'
import { musicTracks, voicePresets } from '../database/schema/assets-config.schema'

export class AssetsConfigRepository {
  // --- Voices ---
  async findAllVoices() {
    return await db.select().from(voicePresets).orderBy(voicePresets.name)
  }

  async getAllVoicesGroupedByProvider() {
    const all = await db.select().from(voicePresets).where(eq(voicePresets.isActive, true))
    const grouped: Record<string, any[]> = {}

    all.forEach((v) => {
      if (!grouped[v.provider]) {
        grouped[v.provider] = []
      }
      grouped[v.provider].push(v)
    })

    return grouped
  }

  async getVoiceByPresetId(presetId: string) {
    const [voice] = await db.select().from(voicePresets).where(eq(voicePresets.presetId, presetId))
    return voice || null
  }

  async createVoice(data: any) {
    const [voice] = await db.insert(voicePresets).values(data).returning()
    return voice
  }

  async updateVoice(id: string, data: any) {
    const [voice] = await db.update(voicePresets).set(data).where(eq(voicePresets.id, id)).returning()
    return voice
  }

  async deleteVoice(id: string) {
    return await db.delete(voicePresets).where(eq(voicePresets.id, id))
  }

  // --- Music ---
  async findAllMusicTracks() {
    return await db.select().from(musicTracks).orderBy(musicTracks.name)
  }

  async getAllMusicTracks() {
    return await db.select().from(musicTracks).where(eq(musicTracks.isActive, true))
  }

  async getMusicTrackById(trackId: string) {
    const [track] = await db.select().from(musicTracks).where(eq(musicTracks.trackId, trackId))
    return track || null
  }

  async createMusicTrack(data: any) {
    const [track] = await db.insert(musicTracks).values(data).returning()
    return track
  }

  async updateMusicTrack(id: string, data: any) {
    const [track] = await db.update(musicTracks).set(data).where(eq(musicTracks.id, id)).returning()
    return track
  }

  async deleteMusicTrack(id: string) {
    return await db.delete(musicTracks).where(eq(musicTracks.id, id))
  }
}
