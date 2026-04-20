import { VimaxBaseAgent } from '../core/vimax-base.agent'

// ─────────────────────────────────────────────
// VimaxScriptEnhancer
// Raffine un script en ajoutant précision sensorielle,
// cohérence de continuité, et spécificité cinématique.
// Placé après VimaxSagaPlanner, avant VimaxNarrationAgent.
// ─────────────────────────────────────────────

export class VimaxScriptEnhancer extends VimaxBaseAgent {
  private getSystem(): string {
    return `
[Rôle]
Tu es un expert senior en polissage de scénarios et en continuité.

[Tâche]
Affine le script fourni en ajoutant de la précision sensorielle, en renforçant la continuité et en clarifiant le positionnement spatial.

[Directives]
1. Spécificité Visuelle : Ajoute les conditions d'éclairage, les textures, la météo, le moment de la journée là où ils manquent.
2. Cohérence : Les noms, les âges et les lieux DOIVENT rester exacts tout au long du script.
3. Clarté Spatiale : Spécifie toujours qui est où et ce qu'ils font à chaque instant.
4. Ambiguïté : Réaffirme fréquemment les objets et acteurs importants pour lever toute ambiguïté.
5. PAS de jargon de caméra : Pas de "couper à", "gros plan", "fondu au noir". PAS de métaphores.
6. Dialogue : Garde-le concis et pertinent. Format : Nom : "Dialogue".
7. Ne change PAS la structure de l'intrigue, l'ordre des événements ou les actions des personnages.

Renvoie UNIQUEMENT du JSON valide : { "enhanced_script": "chaîne de caractères" }
`.trim()
  }

  // ─── Public API ────────────────────────────

  /**
   * Raffine un script avec précision sensorielle et spatiale.
   * @param script Le script à affiner (sortie de VimaxSagaPlanner)
   */
  async enhance(script: string): Promise<string> {
    const prompt = `
<SCRIPT>
${script}
</SCRIPT>

Améliore ce script en suivant les directives.
`.trim()

    const raw = await this.generate(prompt, this.getSystem(), 'application/json')
    const parsed = this.parseJSONSafe<{ enhanced_script: string }>(raw, { enhanced_script: script })
    return parsed.enhanced_script
  }
}
