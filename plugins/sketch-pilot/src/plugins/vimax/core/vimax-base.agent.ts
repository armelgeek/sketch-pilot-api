import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { GenerationResult, LearningEpisode } from '../types'
import { LessonStore } from './lesson-store'
import type { LLMService } from './llm.interface'

// ─────────────────────────────────────────────
// VimaxBaseAgent — Classe abstraite mère
// Tous les agents héritent de cette classe.
// ─────────────────────────────────────────────

export abstract class VimaxBaseAgent {
  protected seriesId?: string
  protected brainMode: 'stable' | 'all' = 'all'
  protected metrics = {
    calls: 0,
    estimatedTokens: 0,
    startTime: Date.now(),
    durationMs: 0
  }

  protected lastPromptData = {
    system: '',
    user: '',
    episodeId: ''
  }

  constructor(protected readonly llm: LLMService) {}

  public setSeriesId(id: string) {
    this.seriesId = id
  }

  public setBrainMode(mode: 'stable' | 'all') {
    this.brainMode = mode
  }

  public getSeriesId(): string | undefined {
    return this.seriesId
  }

  public getLastPromptData() {
    return { ...this.lastPromptData }
  }

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
    const startTime = Date.now()
    const prunedPrompt = this.enforceTokenBudget(prompt)

    // Injection dynamique des leçons (Semantic Diffusion)
    const store = LessonStore.getInstance()
    await store.load()

    const promptTags = this.extractContextTags(prunedPrompt)
    const learnedDirectives = store.formatDirectives(this.constructor.name, promptTags, this.brainMode)

    // Pour l'analyse post-saga, on récupère les IDs des leçons appliquées
    const contextRelevant = store.getLessonsFor(this.constructor.name, promptTags, this.brainMode)
    const appliedLessonIds = contextRelevant.map((l) => l.id)

    const finalSystem = learnedDirectives ? `${system}\n\n${learnedDirectives}` : system

    // Capture de l'épisode avant appel
    const episodeId = `ep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    // On stocke pour l'audit
    this.lastPromptData = {
      system: finalSystem,
      user: prunedPrompt,
      episodeId
    }

    if (process.env.DEBUG_LLM) {
      console.log(`\n[LLM CALL] ${this.constructor.name} - ID: ${episodeId}`)
    }

    const raw = await this.llm.generateContent(prunedPrompt, finalSystem, mime)
    const duration = Date.now() - startTime

    this.metrics.durationMs += duration
    this.metrics.calls++
    this.metrics.estimatedTokens += Math.round((prunedPrompt.length + system.length + raw.length) / 4)

    // Enregistrement de l'épisode pour le Prompt Learning System
    await this.recordEpisode({
      id: episodeId,
      agentName: this.constructor.name,
      seriesId: this.seriesId,
      systemPrompt: system,
      userPrompt: prunedPrompt,
      response: raw,
      timestamp: Date.now(),
      durationMs: duration,
      status: 'pending',
      appliedLessonIds
    })

    if (process.env.DEBUG_LLM) {
      console.log(`[LLM RESPONSE] raw: ${raw.slice(0, 100)}...`)
    }

    return raw
  }

  /**
   * Enregistre un épisode d'apprentissage sur le disque.
   */
  private async recordEpisode(episode: LearningEpisode): Promise<void> {
    try {
      let episodesDir = path.join(process.cwd(), 'vimax-logs', 'learning-episodes')
      if (episode.seriesId) {
        episodesDir = path.join(episodesDir, episode.seriesId)
      }
      await fs.mkdir(episodesDir, { recursive: true })
      const filePath = path.join(episodesDir, `${episode.id}.json`)
      await fs.writeFile(filePath, JSON.stringify(episode, null, 2), 'utf8')
    } catch (error) {
      console.warn(`[${this.constructor.name}] Échec de l'enregistrement de l'épisode:`, error)
    }
  }

  /**
   * Génére du contenu structuré avec retry automatique en cas d'échec de parsing.
   */
  public async generateStructured<T>(
    prompt: string,
    system: string,
    fallback: T,
    maxRetries = 2
  ): Promise<GenerationResult<T>> {
    let retryCount = 0

    while (retryCount <= maxRetries) {
      const episodeId = `ep-struct-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
      try {
        // Note: On passe l'episodeId pour que generate puisse l'utiliser (ou on laisse generate en créer un nouveau)
        // Pour simplifier, on laisse generate créer son propre épisode et on le récupérera via le dernier fichier créé si besoin,
        // MAIS le mieux est de modifier generate pour accepter un ID optionnel.
        const raw = await this.generate(prompt, system, 'application/json')
        const data = this.parseJSON<T>(raw)

        return {
          data,
          confidence: retryCount === 0 ? 'high' : 'low',
          retryCount
        }
      } catch (error: any) {
        // TAG FAILURE : Si on est ici, c'est un échec de parsing
        console.warn(`[VimaxBaseAgent] Échec de parsing - Tentative ${retryCount}:`, error.message)

        // On pourrait ici mettre à jour le dernier épisode enregistré pour le marquer comme FAILURE
        // Mais comme generate enregistre déjà, on va simplement laisser un log ou émettre un signal.
        // Option simple : generateStructured marque la fin du processus.

        retryCount++
        if (retryCount <= maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 500 * retryCount))
        }
      }
    }

    return {
      data: fallback,
      confidence: 'fallback',
      retryCount: maxRetries
    }
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

  /**
   * Normalise tous les identifiants @Nom trouvés dans un texte.
   */
  protected normalizeAllIdentifiers(text: string): string {
    if (!text) return text
    // Regex pour trouver les @ suivis de caractères alphanumériques
    return text.replaceAll(/@([a-z0-9]+)/gi, (match) => {
      return this.normalizeIdentifier(match)
    })
  }

  getMetrics() {
    return { ...this.metrics }
  }

  /**
   * Enforce un budget de tokens (caractères) sur le prompt.
   * Si trop long, tronque intelligemment pour garder l'essentiel.
   */
  protected enforceTokenBudget(prompt: string, maxChars = 120000): string {
    if (prompt.length <= maxChars) return prompt

    console.warn(`[${this.constructor.name}] Prompt budget exceeded (${prompt.length} chars). Enforcing truncation...`)

    // On garde le début (contexte récent/global) et la fin (directives de formatage)
    const preserveSize = Math.floor(maxChars / 2.5)
    return `${prompt.slice(0, preserveSize)}\n\n[... ÉLAGAGE BUDGET TOKEN (CONTRÔLE RIGUEUR) ...]\n\n${prompt.slice(-preserveSize)}`
  }

  private selectRelevantLessons(prompt: string, lessons: any[]): any[] {
    return lessons // Logic now handled by LessonStore.getLessonsFor
  }

  /**
   * Extrait les tags de contexte d'un prompt (@Nom, #Lieu, !Style).
   */
  private extractContextTags(prompt: string): string[] {
    const tags: string[] = []
    const matches = prompt.match(/[@#!][a-z0-9]+/gi)
    if (matches) {
      matches.forEach((m) => {
        if (!tags.includes(m)) tags.push(m)
      })
    }
    return tags
  }
}
