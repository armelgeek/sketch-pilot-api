import { VimaxBaseAgent } from '../core/vimax-base.agent'
import { VimaxVisionUtils } from '../utils/vision-utils'
import type { CharacterProfile } from '../types'

// ─────────────────────────────────────────────
// VimaxCharacterExtractor
// Extrait les profils visuels des personnages depuis un script.
// Utilisé une fois par épisode — les profils sont injectés
// dans les imagePrompts pour garantir la cohérence visuelle.
// ─────────────────────────────────────────────

export class VimaxCharacterExtractor extends VimaxBaseAgent {
  public id = 'character-extractor'
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
Tu es un expert en analyse de scripts cinématographiques.
${styleBlock}
Analyse le script fourni et extrais TOUS les profils visuels des personnages.
NE FILTRE AUCUN RÔLE : Même les personnages secondaires, les figurants nommés ou les unités collectives (ex: @Gardes, @Foule) doivent être extraits car ils nécessitent une identité visuelle cohérente.

[DIRECTIVE DE STYLE]
Le champ "portrait_prompt" DOIT ABSOLUMENT intégrer les termes requis du STYLE LOCKÉ. 
Exemple si whiteboard/sketch : "personnage dessiné au feutre noir, lignes claires, [IDENTITÉ : ${this.styleLock ? 'intègre ici les traits de @Nom' : 'traits physiques'}], fond blanc".
L'identité visuelle (cheveux, yeux, accessoires) doit être préservée mais ADAPTÉE au médium (ex: ne pas demander de réalisme photo si c'est un croquis).

[FORMAT]
Réponds UNIQUEMENT du JSON valide :
{
  "characters": [
    {
      "index": 0,
      "identifier": "@NomDuPersonnage",
      "static_features": "Description physique permanente (vêtements, traits, accessoires)",
      "dynamic_features": "Humeur/Pose actuelle pour ce segment",
      "portrait_prompt": "Prompt d'identité absolue incluant le STYLE LOCKÉ"
    }
  ]
}
`.trim()
  }

  // ─── Public API ────────────────────────────

  /**
   * Analyse chirurgicale d'un portrait pour fixer l'identité visuelle d'un personnage.
   */
  async refineCharacterIdentity(identifier: string, referenceImageUrl: string): Promise<string> {
    const prompt = `
[MISSION : ANALYSE D'IDENTITÉ CHIRURGICALE]
Analyse le portrait de ${identifier} et génère un "portrait_prompt" ABSOLU et VERROUILLÉ.
Ce prompt doit capturer les traits uniques (forme du visage, accessoires, style de trait) pour garantir la cohérence par personne.

[DIRECTIVES]
- Détaille les éléments fixes (chapeau, lunettes, forme du nez).
- Précise le style de dessin (ex: "traits de feutre noirs épais").
- NE FAIS PAS de métaphores.

[FORMAT]
Renvoie UNIQUEMENT du JSON : { "portrait_prompt": "..." }
`.trim()

    let images: { data: string; mimeType: string }[] | undefined = undefined
    try {
      const img = await VimaxVisionUtils.imageUrlToBase64(referenceImageUrl)
      images = [img]
    } catch {
      console.warn(
        `[VimaxCharacterExtractor] Impossible de charger l'image ${referenceImageUrl}, passage en mode texte seul.`
      )
    }

    const result = await this.generateStructured<{ portrait_prompt: string }>(
      `[CHARACTER_IDENTITY_PROMPT]\n${prompt}`,
      'Tu es un portraitiste expert en identification visuelle.',
      { portrait_prompt: '' },
      images
    )

    return result.data.portrait_prompt
  }

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
      .filter((p) => p.static_features?.trim() || p.dynamic_features?.trim() || p.portrait_prompt?.trim())
      .map((p) => {
        const parts = [p.portrait_prompt, p.static_features, p.dynamic_features].filter((f) => f?.trim())
        return `${p.identifier}: ${parts.join(' | ')}`
      })
      .join('\n')
  }
}
