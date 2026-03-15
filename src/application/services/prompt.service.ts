/**
 * PromptService — application-layer service for dynamic prompt management.
 */
import type { PromptRepositoryInterface } from '@/domain/repositories/prompt.repository.interface'

export type PromptVariables = Record<string, string | number | boolean>

export interface ResolvePromptOptions {
  id?: string
  name?: string
  variables?: PromptVariables
  /** Fallback string to use when no DB prompt is found */
  fallback?: string
}

export class PromptService {
  constructor(private readonly repository: PromptRepositoryInterface) {}

  /**
   * Resolve a prompt template from the database and inject variables.
   */
  async resolve(options: ResolvePromptOptions): Promise<string | null> {
    const { id, variables = {}, fallback } = options
    const prompt = await this.repository.findBestMatch({ id })

    // In the new flat model, context or task often serves as the "template"
    const template = (prompt as any)?.context ?? fallback ?? null
    if (!template) return null
    return this.interpolate(template, variables)
  }

  /**
   * Central method to resolve a full specification (Script, Image, etc.) from a prompt.
   * This is the single point of entry for getting managed specs from the database.
   */
  async resolveSpec(id?: string): Promise<any | null> {
    const prompt = await this.repository.findBestMatch({ id })
    return prompt ?? null
  }

  /**
   * Interpolate a template string, replacing all {{variable_name}} tokens.
   */
  interpolate(template: string, variables: PromptVariables = {}): string {
    return template.replaceAll(/\{\{(\s*[\w.]+\s*)\}\}/g, (_match, key: string) => {
      const trimmed = key.trim()
      const value = variables[trimmed]
      return value !== undefined ? String(value) : `{{${trimmed}}}`
    })
  }

  /**
   * Extract all variable names referenced in a template string.
   */
  extractVariables(template: string): string[] {
    const matches = [...template.matchAll(/\{\{(\s*[\w.]+\s*)\}\}/g)]
    return [...new Set(matches.map((m) => m[1].trim()))]
  }
}
