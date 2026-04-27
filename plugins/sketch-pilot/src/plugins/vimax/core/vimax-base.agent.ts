import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { GenerationResult, LearningEpisode, SeriesContext } from '../types'
import { LessonStore } from './lesson-store'
import type { LLMService } from './llm.interface'
import type { VimaxPlugin } from './vimax-plugin.interface'

export interface AgentPersonality {
  temperature?: number // Créativité vs Rigueur (0.0 à 1.0)
  topP?: number
  rolePersona?: string // "Tu es imprévisible" vs "Tu es méthodique"
  focusWindow?: number // Taille du contexte utile
}

// ─────────────────────────────────────────────
// VimaxBaseAgent — Classe abstraite mère
// Tous les agents héritent de cette classe.
// ─────────────────────────────────────────────

export abstract class VimaxBaseAgent implements VimaxPlugin {
  public abstract id: string
  protected seriesId?: string
  protected brainMode: 'stable' | 'all' = 'all'
  protected metrics = {
    calls: 0,
    estimatedTokens: 0,
    startTime: Date.now(),
    durationMs: 0
  }

  protected pluginDirectives: string[] = []
  protected personality: AgentPersonality = { temperature: 0.8 }

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

  public setPersonality(personality: Partial<AgentPersonality>) {
    this.personality = { ...this.personality, ...personality }
  }

  public getSeriesId(): string | undefined {
    return this.seriesId
  }

  public getLastPromptData() {
    return { ...this.lastPromptData }
  }

  /**
   * Ajoute une consigne dynamique issue d'un plugin.
   * Ces consignes sont volatiles et doivent être purgées après chaque pass.
   */
  public addDirective(directive: string) {
    this.pluginDirectives.push(directive)
  }

  /**
   * Purge les consignes des plugins.
   */
  public clearDirectives() {
    this.pluginDirectives = []
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
    mime: 'text/plain' | 'application/json' = 'text/plain',
    images?: { data: string; mimeType: string }[],
    narrativeContext?: any // [V48] Architecte Narratif
  ): Promise<string> {
    const startTime = Date.now()
    const prunedPrompt = this.enforceTokenBudget(prompt)

    // [V55] IMMUTABLE INTELLIGENCE CONSUMPTION : On utilise le snapshot de l'épisode si disponible
    const store = LessonStore.getInstance()
    const promptTags = this.extractContextTags(prunedPrompt)
    let learnedDirectives = ''
    let appliedLessonIds: string[] = []

    if (narrativeContext?.lessonSnapshot) {
      // Injection rapide depuis la mémoire (Zero-Disc)
      const snap = narrativeContext.lessonSnapshot as any[]

      // Filtrage manuel du snapshot pour simuler formatDirectives sans lecture disque
      const relevant = snap.filter(
        (l) => (l.agentName === this.id || l.agentName === 'Global') && (!l.seriesId || l.seriesId === this.seriesId)
      )
      learnedDirectives = store.formatDirectives(this.id, promptTags, this.brainMode, this.seriesId, narrativeContext)
      appliedLessonIds = relevant.map((l) => l.id)
    } else {
      // Fallback classique (avec lecture disque)
      await store.load()
      learnedDirectives = store.formatDirectives(this.id, promptTags, this.brainMode, this.seriesId, narrativeContext)
      const contextRelevant = store.getLessonsFor(this.id, promptTags, this.brainMode, this.seriesId, narrativeContext)
      appliedLessonIds = contextRelevant.map((l) => l.id)
    }

    // Fusion des systèmes prompts : Base + Leçons + Plugins
    let finalSystem = system

    // [V3] Dynamic Directive Pruning
    // Si le système prompt global + leçons dépasse un certain seuil, on élague les leçons les moins pertinentes.
    const MAX_SYSTEM_CHARS = 30000 // Environ 7.5k tokens dévolus aux règles
    let directives = learnedDirectives

    if (finalSystem.length + (directives?.length || 0) > MAX_SYSTEM_CHARS) {
      console.warn(`[${this.id}] System prompt budget exceeded. Pruning lessons...`)
      // On récupère les leçons brutes pour un élagage intelligent
      const relevantLessons = store.getLessonsFor(this.id, promptTags, this.brainMode, this.seriesId)
      // Priorité 1 : Mismatch de tags (mais inclus car général) -> Priorité 2 : Succès/Fail ratio
      const sorted = relevantLessons.sort((a, b) => {
        const scoreA = (a.successCount || 0) - (a.failCount || 0)
        const scoreB = (b.successCount || 0) - (b.failCount || 0)
        return scoreB - scoreA
      })

      // On reconstruit jusqu'à ce que ça loge
      let prunedDirectives = '\n[LEÇONS PRIORITAIRES]\n'
      for (const l of sorted) {
        const entry = `- [${(l.category || 'general').toUpperCase()}] ${l.directive}\n`
        if (finalSystem.length + prunedDirectives.length + entry.length < MAX_SYSTEM_CHARS) {
          prunedDirectives += entry
        } else {
          break
        }
      }
      directives = prunedDirectives.trim()
    }

    if (directives) finalSystem += `\n\n${directives}`
    if (this.pluginDirectives.length > 0) {
      finalSystem += `\n\n[CONSIGNES SPÉCIFIQUES PLUGINS] :\n${this.pluginDirectives.join('\n')}`
    }

    // Capture de l'épisode avant appel
    const episodeId = `ep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    // On stocke pour l'audit
    this.lastPromptData = {
      system: finalSystem,
      user: prunedPrompt,
      episodeId
    }

    if (process.env.DEBUG_LLM) {
      console.log(`\n[LLM CALL] ${this.id} (${this.constructor.name}) - ID: ${episodeId}`)
    }

    // [V48] Injection du Persona si défini
    let systemInstruction = this.personality.rolePersona
      ? `${finalSystem}\n\n[PERSONNALITÉ DE L'AGENT]\n${this.personality.rolePersona}`
      : finalSystem

    if (mime === 'application/json' && !systemInstruction.toLowerCase().includes('json')) {
      systemInstruction += '\n\n[FORMAT] : Your response must be a valid JSON object.'
    }

    const raw = await this.llm.generateContent(prunedPrompt, systemInstruction, mime, images, {
      temperature: this.personality.temperature,
      topP: this.personality.topP
    })
    const duration = Date.now() - startTime

    this.metrics.durationMs += duration
    this.metrics.calls++
    this.metrics.estimatedTokens += Math.round((prunedPrompt.length + system.length + raw.length) / 4)

    // Enregistrement de l'épisode pour le Prompt Learning System
    await this.recordEpisode({
      id: episodeId,
      agentName: this.id,
      seriesId: this.seriesId,
      systemPrompt: system,
      userPrompt: prunedPrompt,
      response: raw,
      timestamp: Date.now(),
      durationMs: duration,
      status: 'pending',
      appliedLessonIds,
      images
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
        // Nouvelle structure unifiée : vimax-logs/sagas/[seriesId]/brain-data/
        episodesDir = path.join(process.cwd(), 'vimax-logs', 'sagas', episode.seriesId, 'brain-data')
      }

      await fs.mkdir(episodesDir, { recursive: true })
      const filePath = path.join(episodesDir, `${episode.id}.json`)
      await fs.writeFile(filePath, JSON.stringify(episode, null, 2), 'utf8')
    } catch (error) {
      console.warn(`[${this.id}] Échec de l'enregistrement de l'épisode:`, error)
    }
  }

  /**
   * Génére du contenu structuré avec retry automatique en cas d'échec de parsing.
   */
  public async generateStructured<T>(
    prompt: string,
    system: string,
    fallback: T,
    images?: { data: string; mimeType: string }[],
    maxRetries = 2,
    narrativeContext?: any // [V48] Architecte Narratif
  ): Promise<GenerationResult<T>> {
    let retryCount = 0

    while (retryCount <= maxRetries) {
      const episodeId = `ep-struct-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
      try {
        // Note: On passe l'episodeId pour que generate puisse l'utiliser (ou on laisse generate en créer un nouveau)
        // Pour simplifier, on laisse generate créer son propre épisode et on le récupérera via le dernier fichier créé si besoin,
        // MAIS le mieux est de modifier generate pour accepter un ID optionnel.
        const raw = await this.generate(prompt, system, 'application/json', images, narrativeContext)
        const data = this.parseJSON<T>(raw)

        return {
          data,
          confidence: retryCount === 0 ? 'high' : 'low',
          retryCount,
          images
        }
      } catch (error: any) {
        // TAG FAILURE : Si on est ici, c'est un échec de parsing
        console.warn(`[VimaxBaseAgent] Échec de parsing (${this.id}) - Tentative ${retryCount}:`, error.message)

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
      retryCount: maxRetries,
      fallbackReached: true
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

    // Détection d'index numérique (ex: "@0", "1")
    // Si l'identifiant est purement numérique, on ne peut pas l'utiliser tel quel.
    if (!isNaN(Number(base))) {
      return `@Personnage${base}`
    }

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

    console.warn(`[${this.id}] Prompt budget exceeded (${prompt.length} chars). Enforcing truncation...`)

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

  // ─── Shared Context Blocks ──────────────────

  protected getGlobalScriptBlock(context: SeriesContext): string {
    if (!context.globalScript) return ''
    const truncated = context.globalScript.slice(0, 2000)
    return `
[SCRIPT GLOBAL DE LA SAGA — RÉFÉRENCE]
${truncated}${context.globalScript.length > 2000 ? '\n[...]' : ''}
`.trim()
  }

  protected getBlueprintBlock(context: SeriesContext): string {
    const b = context.blueprint
    if (!b || !b.premise) return ''
    return `
[BLUEPRINT NARRATIF V7.0]
- THÈME : ${b.theme}
- PRÉMISSE : ${b.premise}
- CONTRAT AUDIENCE : ${b.audienceContract}
`.trim()
  }

  protected getEpisodePlanBlock(context: SeriesContext): string {
    const plan = context.plannedEpisodeContext
    if (!plan) return ''
    return `
[PLAN ÉPISODE]
- TITRE : ${plan.title || 'Inconnu'}
- HOOK : ${plan.hook || 'Inconnu'}
- FONCTION DRAMATIQUE : ${plan.dramaticFunction || 'N/A'}
- ACTE : ${plan.actPosition || '1'}
- TENSION CIBLE : ${plan.tensionTarget || 5}/10
- RYTHME : ${plan.paceTarget || 'medium'}
`.trim()
  }

  protected getScenePlanBlock(context: SeriesContext): string {
    const plan = context.plannedSceneContext
    if (!plan) return ''

    let block = `\n[CHECKLIST VISUELLE DE LA SCÈNE ${plan.sceneNumber || '?'}]`
    block += `\n- [ ] OBJECTIF MAJEUR : ${plan.objective || 'N/A'}`

    if (plan.characterState) {
      Object.entries(plan.characterState).forEach(([id, state]) => {
        block += `\n- [ ] ÉTAT DE ${id} : ${state}`
      })
    }

    if (plan.obligatory) {
      block += `\n- [!] CONTRAINTE OBLIGATOIRE : ${plan.obligatory}`
    }

    if (plan.prepares) {
      block += `\n- [ ] PRÉPARATION VISUELLE : ${plan.prepares}`
    }

    block += `\n\n[DIRECTIVE] Ton imagePrompt doit impérativement valider TOUS les points cochés [ ] ci-dessus.`

    return block.trim()
  }
}
