import { eq } from 'drizzle-orm'
import { db } from '../database/db'
import { musicTracks, voicePresets, type MusicTrack, type VoicePreset } from '../database/schema'

export class AssetsConfigRepository {
  // ─── Voice Presets ────────────────────────────────────────────────────────

  getAllVoices(provider?: string): Promise<VoicePreset[]> {
    if (provider) {
      return db
        .select()
        .from(voicePresets)
        .where(eq(voicePresets.isActive, true) && (eq(voicePresets.provider, provider) as any))
    }
    return db.select().from(voicePresets).where(eq(voicePresets.isActive, true))
  }

  findAllVoices(): Promise<VoicePreset[]> {
    return db.select().from(voicePresets)
  }

  async getVoiceByPresetId(presetId: string): Promise<VoicePreset | null> {
    const [voice] = await db.select().from(voicePresets).where(eq(voicePresets.presetId, presetId))
    return voice || null
  }

  async getAllVoicesGroupedByProvider(): Promise<Record<string, VoicePreset[]>> {
    const voices = await db.select().from(voicePresets).where(eq(voicePresets.isActive, true))
    return voices.reduce<Record<string, VoicePreset[]>>((acc, voice) => {
      if (!acc[voice.provider]) acc[voice.provider] = []
      acc[voice.provider].push(voice)
      return acc
    }, {})
  }

  async createVoice(data: VoicePreset): Promise<VoicePreset> {
    const [voice] = await db.insert(voicePresets).values(data).returning()
    return voice
  }

  async updateVoice(id: string, data: Partial<VoicePreset>): Promise<VoicePreset> {
    const [voice] = await db
      .update(voicePresets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(voicePresets.id, id))
      .returning()
    return voice
  }

  async deleteVoice(id: string): Promise<void> {
    await db.delete(voicePresets).where(eq(voicePresets.id, id))
  }

  // ─── Music Tracks ─────────────────────────────────────────────────────────

  getAllMusicTracks(): Promise<MusicTrack[]> {
    return db.select().from(musicTracks).where(eq(musicTracks.isActive, true))
  }

  findAllMusicTracks(): Promise<MusicTrack[]> {
    return db.select().from(musicTracks)
  }

  async getMusicTrackById(trackId: string): Promise<MusicTrack | null> {
    const [track] = await db.select().from(musicTracks).where(eq(musicTracks.trackId, trackId))
    return track || null
  }

  async createMusicTrack(data: MusicTrack): Promise<MusicTrack> {
    const [track] = await db.insert(musicTracks).values(data).returning()
    return track
  }

  async updateMusicTrack(id: string, data: Partial<MusicTrack>): Promise<MusicTrack> {
    const [track] = await db
      .update(musicTracks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(musicTracks.id, id))
      .returning()
    return track
  }

  async deleteMusicTrack(id: string): Promise<void> {
    await db.delete(musicTracks).where(eq(musicTracks.id, id))
  }
}
