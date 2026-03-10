import * as path from 'node:path'

export interface MusicTrack {
  id: string
  name: string
  path: string
  tags: string[] // e.g., 'upbeat', 'sad', 'lo-fi', 'business'
}

export class MusicService {
  private tracks: MusicTrack[] = []
  private assetsDir: string

  constructor() {
    this.assetsDir = path.join(__dirname, 'assets', 'music')
    this.initializeLibrary()
  }

  private initializeLibrary() {
    // In a real app, this would scan the directory or load a DB.
    // For now, we'll define some mock/placeholder tracks.
    // The user handles providing the actual .mp3 files in the assets/music folder.
    this.tracks = [
      { id: 'lofi-1', name: 'Chill Lo-Fi', path: 'lofi-beat.mp3', tags: ['chill', 'lo-fi', 'educational', 'tutorial'] },
      {
        id: 'upbeat-1',
        name: 'Upbeat Corporate',
        path: 'upbeat-corporate.mp3',
        tags: ['upbeat', 'business', 'motivational', 'promo']
      },
      { id: 'ambient-1', name: 'Soft Ambient', path: 'soft-ambient.mp3', tags: ['sad', 'emotional', 'story', 'quiet'] },
      { id: 'fun-1', name: 'Funky Groove', path: 'funky-groove.mp3', tags: ['fun', 'entertainment', 'kids'] }
    ]
  }

  public getTrackForMood(mood: string): MusicTrack {
    if (!mood) return this.getRandomTrack()

    const normalizedMood = mood.toLowerCase()

    // precise match
    const exactMatch = this.tracks.find((t) => t.tags.includes(normalizedMood))
    if (exactMatch) return exactMatch

    // partial match? or random fallback
    return this.getRandomTrack()
  }

  public getRandomTrack(): MusicTrack {
    return this.tracks[Math.floor(Math.random() * this.tracks.length)]
  }

  public getTrackPath(filename: string): string {
    return path.join(this.assetsDir, filename)
  }
}
