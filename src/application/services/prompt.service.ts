/**
 * PromptService — application-layer service for dynamic prompt management.
 *
 * Responsibilities:
 *  - Resolve the best-matching prompt for a given context (type, video type, genre, language)
 *  - Inject runtime variables into prompt templates using {{variable_name}} syntax
 *  - Provide fallback to built-in defaults when no DB prompt is found
 */
import type { PromptRepositoryInterface } from '@/domain/repositories/prompt.repository.interface'
import type { PromptType } from '@/infrastructure/database/schema/prompt.schema'

export type PromptVariables = Record<string, string | number | boolean>

export interface ResolvePromptOptions {
  promptType: PromptType
  videoType?: string
  videoGenre?: string
  language?: string
  variables?: PromptVariables
  /** Fallback string to use when no DB prompt is found */
  fallback?: string
}

export class PromptService {
  constructor(private readonly repository: PromptRepositoryInterface) {}

  /**
   * Resolve a prompt template from the database and inject variables.
   * Returns the interpolated string, or the fallback (if provided) when no
   * active prompt is found.
   */
  async resolve(options: ResolvePromptOptions): Promise<string | null> {
    const { promptType, videoType, videoGenre, language, variables = {}, fallback } = options

    const prompt = await this.repository.findBestMatch({ promptType, videoType, videoGenre, language })

    const template = prompt?.template ?? fallback ?? null
    if (!template) return null

    return this.interpolate(template, variables)
  }

  /**
   * Interpolate a template string, replacing all {{variable_name}} tokens
   * with the corresponding value from the variables map.
   * Unknown variables are left as-is.
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
   * Returns a deduplicated array of variable names.
   */
  extractVariables(template: string): string[] {
    const matches = [...template.matchAll(/\{\{(\s*[\w.]+\s*)\}\}/g)]
    return [...new Set(matches.map((m) => m[1].trim()))]
  }
}
