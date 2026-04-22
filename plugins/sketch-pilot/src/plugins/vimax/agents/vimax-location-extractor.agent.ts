import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { LocationState } from '../types'

// ─────────────────────────────────────────────
// VimaxLocationExtractor
// Extrait les lieux et leurs descriptions depuis un script.
// Utilisé pour bâtir le point de départ de la continuité spatiale.
// ─────────────────────────────────────────────

export class VimaxLocationExtractor extends VimaxBaseAgent {
  public id = 'location-extractor'
  private styleLock: any | null = null

  setStyleLock(lock: any) {
    this.styleLock = lock
  }

  private getSystem(): string {
    const styleBlock = this.styleLock
      ? `
[STYLE VISUEL LOCKÉ - OBLIGATOIRE]
- Style : ${this.styleLock.visualStyle}
- Termes requis : ${this.styleLock.mandatoryTerms.join(', ')}
- Termes interdits : ${this.styleLock.forbiddenTerms.join(', ')}
`.trim()
      : ''

    return `
Tu es un expert en repérage cinématographique et analyse spatiale.
${styleBlock}
Analyse le script fourni et extrais tous les lieux (locations) distincts.

[DIRECTIVES]
- Identifie chaque lieu par un nom concis et unique.
- Pour chaque lieu, fournis une description atmosphérique et visuelle riche RESPECTANT LE STYLE LOCKÉ.
- lastImagePrompt : Génère une description visuelle de base qui servira de référence pour ce lieu. Applique strictement le style (ex: si whiteboard, décris comme "dessin au tableau blanc").
- Précise l'état actuel du lieu tel que décrit dans le script.

[FORMAT]
Réponds UNIQUEMENT du JSON valide :
{
  "locations": [
    {
      "id": "nom-du-lieu-kebab-case",
      "name": "Nom du Lieu",
      "atmosphere": "...",
      "lastImagePrompt": "...",
      "evolution": "...",
      "modifications": []
    }
  ]
}
`.trim()
  }

  // ─── Public API ────────────────────────────

  /**
   * Extrait les lieux de tous les personnages d'un script.
   * @param script La narration ou le script source
   */
  async extractLocations(script: string): Promise<LocationState[]> {
    const prompt = `
<SCRIPT>
${script}
</SCRIPT>

Extraits tous les lieux mentionnés ou suggérés dans ce script.
Réponds uniquement en JSON.
`.trim()

    const raw = await this.generate(prompt, this.getSystem(), 'application/json')
    const parsed = this.parseJSONSafe<{ locations: LocationState[] }>(raw, { locations: [] })

    return parsed.locations
  }
}
