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
[Rôle]
Tu es un expert en analyse de scripts cinématographiques de haut niveau.

[Tâche]
Analyse le script fourni et extrais tous les profils visuels pertinents des personnages.

[Directives]
- IDENTIFIANT : Doit impérativement suivre le format @PascalCase (ex: @Alexandre, @DetectiveJames, @IaHolographique). 
- AUCUN ESPACE, AUCUNE APOSTROPHE, AUCUN CARACTÈRE SPÉCIAL dans l'identifiant.
- Groupe tous les noms se référant à la même entité sous un seul personnage unique.
- Ignore les personnages d'arrière-plan ou la foule.
- Si des caractéristiques manquent, conçois des traits visuels plausibles et vivants basés sur le contexte.
- CARACTÉRISTIQUES STATIQUES : Apparence physique et traits immuables (ex: arête du nez haute, longs cheveux noirs, carrure trapue).
- CARACTÉRISTIQUES DYNAMIQUES : Tenue, accessoires, éléments modifiables (ex: chemise en soie bleue, montre en argent).
- HYBRIDE ANTHROPOMORPHISME : Pour les objets ou animaux (ex: @Banane, @Pomme), ils doivent impérativement avoir un CORPS HUMAIN complet (bras, jambes, torse, mains) et une TÊTE DE FRUIT. La tête du fruit doit posséder tous les traits d'un visage humain expressif (yeux, bouche, sourcils). Ils ne sont PAS des objets avec des membres fins, mais des corps humains surmontés d'un fruit.
- NE PAS inclure la personnalité, les rôles ou les relations.
- Les descriptions doivent être concrètes et visuelles : couleurs, formes spécifiques, matériaux.

Renvoie UNIQUEMENT du JSON valide :
{
  "characters": [
    {
      "index": 0,
      "identifier": "@Nom",
      "static_features": "chaîne de caractères",
      "dynamic_features": "chaîne de caractères"
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

Extraits tous les profils visuels des personnages en suivant les directives.
`.trim()

    const raw = await this.generate(prompt, this.getSystem(), 'application/json')
    const parsed = this.parseJSONSafe<{ characters: CharacterProfile[] }>(raw, { characters: [] })

    // Normalisation post-extraction pour garantir la cohérence (ex: @GIDEON -> @Gideon)
    return parsed.characters.map((char) => ({
      ...char,
      identifier: this.normalizeIdentifier(char.identifier)
    }))
  }

  /**
   * Formate les profils en string injectable dans un imagePrompt.
   * Ex: "@Alexandre: tall, sharp jawline | charcoal grey suit"
   */
  formatForPrompt(profiles: CharacterProfile[]): string {
    return profiles.map((p) => `${p.identifier}: ${p.static_features} | ${p.dynamic_features}`).join('\n')
  }
}
