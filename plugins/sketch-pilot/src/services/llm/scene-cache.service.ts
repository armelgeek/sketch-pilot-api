import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'

export class SceneCacheService {
  private readonly filePath: string
  private cache: Record<string, string> = {}
  private saveTimeout: NodeJS.Timeout | null = null
  private isSaving: boolean = false
  private pendingSave: boolean = false

  constructor(dataDir?: string) {
    const rootDir = dataDir || path.join(process.cwd(), 'data')
    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true })
    }
    this.filePath = path.join(rootDir, 'scene-cache.json')
    this.loadCache()
  }

  private loadCache(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const data = fs.readFileSync(this.filePath, 'utf-8')
        this.cache = JSON.parse(data)
      } catch (error) {
        console.error(`[SceneCacheService] Error loading cache:`, error)
        this.cache = {}
      }
    }
  }

  private triggerSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    this.saveTimeout = setTimeout(() => {
      this.executeSave()
    }, 2000) // Debounce for 2 seconds
  }

  private async executeSave(): Promise<void> {
    if (this.isSaving) {
      this.pendingSave = true
      return
    }

    this.isSaving = true
    try {
      // Stringify can be heavy, but at least file I/O is offloaded to thread pool
      const json = JSON.stringify(this.cache, null, 2)
      await fsPromises.writeFile(this.filePath, json, 'utf-8')
    } catch (error) {
      console.error(`[SceneCacheService] Error saving cache asynchronously:`, error)
    } finally {
      this.isSaving = false
      if (this.pendingSave) {
        this.pendingSave = false
        this.triggerSave()
      }
    }
  }

  private generateKey(prompt: string, options?: any): string {
    const hash = crypto.createHash('sha256')
    hash.update(prompt)
    if (options) {
      hash.update(JSON.stringify(options))
    }
    return hash.digest('hex')
  }

  get(prompt: string, options?: any): string | null {
    const key = this.generateKey(prompt, options)
    return this.cache[key] || null
  }

  set(prompt: string, response: string, options?: any): void {
    const key = this.generateKey(prompt, options)
    this.cache[key] = response
    this.triggerSave()
  }

  clear(): void {
    this.cache = {}
    this.triggerSave()
  }
}
