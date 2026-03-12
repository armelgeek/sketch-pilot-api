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

  // ─── Music Tracks ─────────────────────────────────────────────────────────

  getAllMusicTracks(): Promise<MusicTrack[]> {
    return db.select().from(musicTracks).where(eq(musicTracks.isActive, true))
  }

  async getMusicTrackById(trackId: string): Promise<MusicTrack | null> {
    const [track] = await db.select().from(musicTracks).where(eq(musicTracks.trackId, trackId))
    return track || null
  }
}
