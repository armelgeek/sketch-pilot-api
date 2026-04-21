import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { CharacterProfile } from '../types'

// ─────────────────────────────────────────────
// VimaxCharacterExtractor
// Extrait les profils visuels des personnages depuis un script.
// Utilisé une fois par épisode — les profils sont injectés
// dans les imagePrompts pour garantir la cohérence visuelle.
// ─────────────────────────────────────────────

export class VimaxCharacterExtractor extends VimaxBaseAgent {
  public id = 'character-extractor'
  private getSystem(): string {
    return `
Tu es un expert en analyse de scripts cinématographiques.
Analyse le script fourni et extrais tous les profils visuels pertinents des personnages.

[FORMAT]
Réponds UNIQUEMENT du JSON valide :
{
  "characters": [
    {
      "index": 0,
      "identifier": "@PascalCase",
      "static_features": "Physical description (age, hair, eyes, clothes)",
      "dynamic_features": "Mood or specific pose in this context",
      "portrait_prompt": "Absolute character identity prompt: Detailed description of face and unique traits for image generation"
    }
  ]
}
`.trim()
  }

  // ─── Public API ────────────────────────────

  /**
   * Extrait les profils visuels de tous les personnages d'un script.
   * @param script La narration ou le script source
   */
  async extractCharacters(script: string): Promise<CharacterProfile[]> {
    const prompt = `
<SCRIPT>
${script}
</SCRIPT>

Extraits tous les profils visuels des personnages en suivant les directives strictes.
Réponds uniquement en JSON.
`.trim()

    const raw = await this.generate(prompt, this.getSystem(), 'application/json')
    const parsed = this.parseJSONSafe<{ characters: CharacterProfile[] }>(raw, { characters: [] })

    // Normalisation post-extraction (indexation séquentielle et @PascalCase)
    return parsed.characters.map((char, i) => ({
      ...char,
      index: i,
      identifier: this.normalizeIdentifier(char.identifier)
    }))
  }

  /**
   * Formate les profils en string injectable dans un imagePrompt.
   * Ex: "@Alexandre: mâchoire carrée, cheveux noirs courts | costume anthracite, montre en argent"
   */
  formatForPrompt(profiles: CharacterProfile[]): string {
    return profiles
      .filter((p) => p.static_features?.trim() || p.dynamic_features?.trim())
      .map((p) => {
        const parts = [p.static_features, p.dynamic_features].filter((f) => f?.trim())
        return `${p.identifier}: ${parts.join(' | ')}`
      })
      .join('\n')
  }
}
