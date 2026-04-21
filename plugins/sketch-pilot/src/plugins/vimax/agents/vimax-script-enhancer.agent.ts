import { VimaxBaseAgent } from '../core/vimax-base.agent'

// ─────────────────────────────────────────────
// VimaxScriptEnhancer
// Raffine un script en ajoutant précision sensorielle,
// cohérence de continuité, et spécificité cinématique.
// Placé après VimaxSagaPlanner, avant VimaxNarrationAgent.
// ─────────────────────────────────────────────

export class VimaxScriptEnhancer extends VimaxBaseAgent {
  public id = 'script-enhancer'
  private getSystem(): string {
    return `
[Rôle]
Tu es un expert senior en polissage de scénarios et en continuité.

[Tâche]
Affine le script fourni en ajoutant de la précision sensorielle, en renforçant la continuité et en clarifiant le positionnement spatial.

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
    return this.normalizeAllIdentifiers(parsed.enhanced_script)
  }
}
