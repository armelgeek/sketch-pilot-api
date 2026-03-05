import { boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Prompt types that correspond to the different parts of the PromptManager.
 *
 * - system_prompt      : Global LLM system prompt for script generation
 * - video_type_guideline  : Per video-type inline guideline injected in the system prompt
 * - video_genre_guideline : Per video-genre inline guideline injected in the system prompt
 * - style_suffix       : Image style suffix appended to every image generation prompt
 * - character_instruction : Base system instruction for the image generation model
 * - image_prompt       : Template for building scene image prompts
 * - animation_prompt   : Template for building scene animation prompts
 */
export const PROMPT_TYPES = [
  'system_prompt',
  'video_type_guideline',
  'video_genre_guideline',
  'style_suffix',
  'character_instruction',
  'image_prompt',
  'animation_prompt',
] as const

export type PromptType = (typeof PROMPT_TYPES)[number]

export const prompts = pgTable('prompts', {
  id: text('id').primaryKey(),
  /** Human-readable name for this prompt entry */
  name: text('name').notNull(),
  /** Optional description / notes */
  description: text('description'),
  /**
   * The category of prompt. Matches the PromptType union above.
   * Used to look up the right prompt at runtime.
   */
  promptType: text('prompt_type').notNull(),
  /**
   * Optional video type this prompt is scoped to (e.g. "tutorial", "listicle").
   * NULL = applies to all video types.
   */
  videoType: text('video_type'),
  /**
   * Optional video genre this prompt is scoped to (e.g. "educational", "tech").
   * NULL = applies to all genres.
   */
  videoGenre: text('video_genre'),
  /**
   * The prompt template string.
   * Supports variable interpolation using {{variable_name}} syntax.
   * Example: "You are a {{role}} specialized in {{topic}} content."
   */
  template: text('template').notNull(),
  /**
   * JSON array of variable names expected in the template.
   * Example: ["role", "topic"]
   * Used for documentation and validation purposes.
   */
  variables: jsonb('variables').$type<string[]>().default([]),
  /** Language this prompt targets (e.g. "en", "fr"). NULL = language-agnostic. */
  language: text('language'),
  /** Whether this prompt is active and should be used at runtime */
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
