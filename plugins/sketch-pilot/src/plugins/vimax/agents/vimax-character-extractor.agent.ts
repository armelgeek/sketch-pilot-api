import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { CharacterProfile } from '../types'

// ─────────────────────────────────────────────
// VimaxCharacterExtractor
// Extrait les profils visuels des personnages depuis un script.
// Utilisé une fois par épisode — les profils sont injectés
// dans les imagePrompts pour garantir la cohérence visuelle.
// ─────────────────────────────────────────────

export class VimaxCharacterExtractor extends VimaxBaseAgent {
  private getSystem(): string {
    return `
Tu es un expert en analyse de scripts cinématographiques de haut niveau.
Analyse le script fourni et extrais tous les profils visuels pertinents des personnages.

[IDENTIFIANTS]
- Format OBLIGATOIRE : @PascalCase (ex: @Alexandre, @DetectiveJames, @IaHolographique).
- AUCUN ESPACE, AUCUNE APOSTROPHE, AUCUN CARACTÈRE SPÉCIAL.
- DÉDUPLICATION : Si plusieurs noms désignent le même personnage (ex: "Banane", "@Banane", "le fruit"), crée UNE SEULE entrée avec l'identifiant @PascalCase canonique.

[PERSONNAGES HUMAINS]
- STATIQUES (immuables) : morphologie, couleur de peau, couleur et texture des cheveux, structure du visage, taille, corpulence. Ces traits ne changent JAMAIS entre les scènes.
- DYNAMIQUES (modifiables) : vêtements, accessoires, armes portées, état physique (blessure, maquillage). Ces traits peuvent changer entre les épisodes.

[PERSONNAGES ANTHROPOMORPHES — RÈGLE CRITIQUE]
Si le personnage est un objet ou animal (ex: @Banane, @Pomme) :
- static_features DOIT inclure : "corps humain complet (bras musclés, jambes, torse large, mains à 5 doigts), tête en forme de [fruit] avec visage expressif (yeux, sourcils, bouche)".
- dynamic_features : tenue vestimentaire humaine portée sur ce corps (ex: veste en cuir, jean, baskets).
- INTERDIT : membres fins, corps de fruit entier, absence de jambes ou de bras.

[EXCLUSIONS]
- Ignore la foule et les personnages d'arriére-plan.
- N'inclus PAS personnalité, rôle ou relations.

[DIRECTIVES GÉNÉRALES]
- LONGUEUR : static_features et dynamic_features : 1 à 2 phrases maximum, 20-40 mots chacune. Concis et visuellement précis.
- Si des caractéristiques manquent, conçois des traits visuels plausibles et vivants basés sur le contexte.

[FORMAT]
- "index" : ordre d'apparition dans le script (0 = premier personnage mentionné).
Renvoie UNIQUEMENT du JSON valide :
{
  "characters": [
    {
      "index": 0,
      "identifier": "@Nom",
      "static_features": "Description immuable ici",
      "dynamic_features": "Description modifiable ici"
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
