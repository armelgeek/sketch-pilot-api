import type { LLMService } from './llm.interface'

// ─────────────────────────────────────────────
// VimaxBaseAgent — Classe abstraite mère
// Tous les agents héritent de cette classe.
// ─────────────────────────────────────────────

export abstract class VimaxBaseAgent {
  constructor(protected readonly llm: LLMService) {}

  /**
   * Parse une réponse JSON du LLM de façon sécurisée.
   * Nettoie les backticks markdown avant parsing.
   */
  protected parseJSON<T>(raw: string): T {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim()

    return JSON.parse(cleaned) as T
  }

  /**
   * Parse avec retry — renvoie le fallback si le parsing échoue.
   */
  protected parseJSONSafe<T>(raw: string, fallback: T): T {
    try {
      return this.parseJSON<T>(raw)
    } catch {
      return fallback
    }
  }

  /**
   * Génère du contenu texte via le LLM.
   */
  protected async generate(
    prompt: string,
    system: string,
    mime: 'text/plain' | 'application/json' = 'text/plain'
  ): Promise<string> {
    if (process.env.DEBUG_LLM) {
      console.log(`\n[LLM CALL] system: ${system.slice(0, 100)}... prompt: ${prompt.slice(0, 100)}...`)
    }

    const raw = await this.llm.generateContent(prompt, system, mime)

    // Log direct pour debug
    if (process.env.DEBUG_LLM) {
      console.log(`[LLM RESPONSE] raw: ${raw.slice(0, 100)}...`)
    }

    return raw
  }

  /**
   * Normalise un identifiant au format @PascalCase strict.
   * Ex: "l'IA" -> "@Ia", "@SAMUEL" -> "@Samuel", "detective james" -> "@Detectivejames"
   */
  protected normalizeIdentifier(id: string): string {
    if (!id) return id
    const clean = id.trim()

    // Enlever le @ initial s'il existe pour travailler sur la base
    const hasAt = clean.startsWith('@')
    let base = hasAt ? clean.slice(1) : clean

    // Enlever tout ce qui n'est pas alphanumérique (espaces, apostrophes, etc.)
    base = base.replaceAll(/[^a-z0-9]/gi, '')

    if (base.length === 0) return id // Fallback si vide

    // Forcer le format @PascalCase : Première lettre majuscule, le reste minuscule
    return `@${base.charAt(0).toUpperCase()}${base.slice(1).toLowerCase()}`
  }
}
