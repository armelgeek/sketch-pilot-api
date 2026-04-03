import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface MusicTrack {
  id: string
  name: string
  path: string
  tags: string[] // e.g., 'upbeat', 'sad', 'lo-fi', 'business'
}

export class MusicService {
  public tracks: MusicTrack[] = []
  private assetsDir: string

  constructor() {
    this.assetsDir = path.join(__dirname, 'assets', 'music')
    this.initializeLibrary()
  }

  private initializeLibrary() {
    // 1. Try to scan the directory dynamically
    if (fs.existsSync(this.assetsDir)) {
      try {
        const files = fs.readdirSync(this.assetsDir)
        const mp3Files = files.filter((f) => f.endsWith('.mp3'))

        if (mp3Files.length > 0) {
          this.tracks = mp3Files.map((filename) => {
            // Naming convention: id_name_tag1-tag2.mp3
            // Example: upbeat-1_Upbeat-Corporate_upbeat-business.mp3
            const base = filename.replace('.mp3', '')
            const parts = base.split('_')

            const id = parts[0] || base
            const name = (parts[1] || id).replaceAll('-', ' ')
            const tags = (parts[2] || '').split('-').filter(Boolean)

            return { id, name, path: filename, tags }
          })
          console.log(`[MusicService] Dynamically loaded ${this.tracks.length} tracks from ${this.assetsDir}`)
          return
        }
      } catch (error) {
        console.error(`[MusicService] Failed to scan music directory:`, error)
      }
    }

    // 2. Fallback to hardcoded defaults if directory is empty or scan fails
    console.warn(`[MusicService] Falling back to default tracks (directory empty or missing)`)
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

    const normalizedMood = mood.toLowerCase().trim()

    // 1. Try ID match first (e.g., 'upbeat-1')
    const idMatch = this.getTrackById(normalizedMood)
    if (idMatch) return idMatch

    // 2. Precise tag match (e.g., 'upbeat')
    const tagMatch = this.tracks.find((t) => t.tags.includes(normalizedMood))
    if (tagMatch) return tagMatch

    // 3. Substring match in tags (more flexible)
    const partialMatch = this.tracks.find((t) => t.tags.some((tag) => tag.includes(normalizedMood)))
    if (partialMatch) return partialMatch

    // 4. Fallback to random
    return this.getRandomTrack()
  }

  public getTrackById(id: string): MusicTrack | null {
    return this.tracks.find((t) => t.id === id) || null
  }

  public getRandomTrack(): MusicTrack {
    if (this.tracks.length === 0) return null as any
    return this.tracks[Math.floor(Math.random() * this.tracks.length)]
  }

  public getTrackPath(filename: string): string {
    return path.join(this.assetsDir, filename)
  }
}
