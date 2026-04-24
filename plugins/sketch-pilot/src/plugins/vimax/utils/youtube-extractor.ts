import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Utilitaire pour extraire la transcription (sous-titres) d'une vidéo YouTube.
 * Utilise yt-dlp pour récupérer les sous-titres auto-générés ou manuels.
 */
export class YoutubeExtractor {
  private static readonly YT_DLP_PATH = '/home/armel/.local/bin/yt-dlp'

  /**
   * Extrait la transcription d'une vidéo YouTube.
   * @param url URL de la vidéo YouTube
   * @param lang Langue préférée (défaut 'fr')
   */
  static async extractTranscription(url: string, lang = 'fr'): Promise<string> {
    const tmpId = `yt-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    const tmpDir = path.join(process.cwd(), 'tmp', tmpId)

    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }

    try {
      console.log(`[YoutubeExtractor] Extraction des sous-titres pour: ${url} (lang: ${lang})`)

      // Essai 1 : Sans cookies, mais avec des en-têtes et clients plus robustes
      const cmdBase = `${this.YT_DLP_PATH} --write-auto-subs --write-subs --skip-download --sub-format vtt --sub-langs "${lang}.*" --output "${tmpDir}/sub"`
      const robustFlags = `--user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --extractor-args "youtube:player_client=ios,android_creator,web_embedded;js_runtime=node"`

      try {
        console.log(`[YoutubeExtractor] Tentative robuste (ios, node JS runtime)...`)
        execSync(`${cmdBase} ${robustFlags} "${url}"`, { stdio: 'pipe' })
      } catch {
        console.warn(`[YoutubeExtractor] Premier essai échoué (429?), tentative avec cookies chrome...`)
        // Essai 2 : Avec les cookies du navigateur (si disponible)
        execSync(`${cmdBase} --cookies-from-browser chrome --extractor-args "youtube:js_runtime=node" "${url}"`, {
          stdio: 'pipe'
        })
      }

      const files = fs.readdirSync(tmpDir)
      const vttFile = files.find((f) => f.endsWith('.vtt'))

      if (!vttFile) {
        throw new Error(`Aucune transcription trouvée pour ${url} en langue ${lang}`)
      }

      const content = fs.readFileSync(path.join(tmpDir, vttFile), 'utf-8')
      const cleaned = this.cleanVtt(content)

      console.log(`[YoutubeExtractor] ✓ Transcription extraite (${cleaned.length} caractères)`)
      return cleaned
    } catch (error: any) {
      console.error(`[YoutubeExtractor] Échec de l'extraction:`, error.message)
      throw error
    } finally {
      // Nettoyage
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    }
  }

  /**
   * Nettoye le format VTT pour ne garder que le texte brut.
   */
  private static cleanVtt(vtt: string): string {
    // 1. Supprimer le header WEBVTT et les métadonnées de style
    let text = vtt.replace(/^WEBVTT[\s\S]*?\n\n/, '')

    // 2. Supprimer les timestamps
    text = text.replaceAll(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/g, '')

    // 3. Supprimer les tags HTML (ex: <c>, <i>, etc.)
    text = text.replaceAll(/<[^>]+>/g, '')

    // 4. Nettoyer les lignes
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) return false
        if (/^\d+$/.test(line)) return false // Supprimer les numéros de bloc
        return true
      })

    // 5. Supprimer les répétitions consécutives (souvent présentes dans les auto-subs de YT)
    const uniqueLines: string[] = []
    let lastLine = ''
    for (const line of lines) {
      if (line !== lastLine) {
        uniqueLines.push(line)
        lastLine = line
      }
    }

    return uniqueLines.join(' ').replaceAll(/\s+/g, ' ')
  }
}
