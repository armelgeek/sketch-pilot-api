import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface AmbientAsset {
  id: string
  name: string
  path: string
  tags: string[]
}

export class AmbientService {
  private assets: AmbientAsset[] = []
  private assetsDir: string

  constructor() {
    this.assetsDir = path.join(__dirname, 'assets', 'ambient')
    this.initializeLibrary()
  }

  private initializeLibrary() {
    // Mock library for soundscapes
    this.assets = [
      {
        id: 'office',
        name: 'Busy Office',
        path: 'office-ambience.mp3',
        tags: ['office', 'work', 'indoor', 'business']
      },
      { id: 'forest', name: 'Nature Forest', path: 'forest-birds.mp3', tags: ['forest', 'nature', 'outdoor', 'calm'] },
      { id: 'rain', name: 'Soft Rain', path: 'soft-rain.mp3', tags: ['rain', 'weather', 'sad', 'melancholy'] },
      { id: 'crowd', name: 'City Crowd', path: 'city-crowd.mp3', tags: ['crowd', 'city', 'public', 'busy'] },
      { id: 'cafe', name: 'Cozy Cafe', path: 'cafe-chatter.mp3', tags: ['cafe', 'coffee', 'social', 'relaxed'] },
      { id: 'white-noise', name: 'Clean White Noise', path: 'white-noise.mp3', tags: ['minimal', 'focus', 'clean'] }
    ]
  }

  public getAssetForSoundscape(soundscape: string): AmbientAsset | null {
    if (!soundscape) return null

    const normalized = soundscape.toLowerCase()

    // Exact match by ID or tag
    const match = this.assets.find((a) => a.id === normalized || a.tags.includes(normalized))
    if (match) return match

    // Partial match
    const partial = this.assets.find((a) => a.tags.some((tag) => tag.includes(normalized) || normalized.includes(tag)))
    return partial || null
  }

  public getAssetPath(filename: string): string {
    return path.join(this.assetsDir, filename)
  }

  public resolveSoundscape(soundscape: string): string | null {
    const asset = this.getAssetForSoundscape(soundscape)
    if (!asset) return null

    const fullPath = this.getAssetPath(asset.path)
    return fs.existsSync(fullPath) ? fullPath : null
  }
}
