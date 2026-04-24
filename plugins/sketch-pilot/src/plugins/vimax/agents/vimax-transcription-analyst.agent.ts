import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { Lesson } from '../types'

/**
 * Agent spécialisé dans l'analyse de transcriptions (Source-based Learning).
 * Il distille l'expertise de vidéos de référence en directives actionnables pour Vimax.
 */
export class VimaxTranscriptionAnalyst extends VimaxBaseAgent {
  public id = 'transcription-analyst'

  constructor(llm: any) {
    super(llm)
  }

  async analyze(transcription: string, sourceLabel: string): Promise<Lesson[]> {
    const prompt = `
[MISSION : ANALYSE NARRATIVE DE RÉFÉRENCE]
Tu reçois la transcription d'une vidéo de référence nommée "${sourceLabel}".
Ton but est d'analyser le RYTHME, le TON, la STRUCTURE et le STYLE de narration pour en extraire des leçons précieuses pour mon moteur de narration @Vimax.

[CONTENU DE LA TRANSCRIPTION]
${transcription.slice(0, 10000)} ... (tronqué si trop long)

[CONSIGNES D'EXTRACTION]
1. Identifie des principes de narration efficaces (ex: gestion du suspens, économie de mots, punchlines).
2. Distille ces principes en directives courtes et universelles (Actionnables).
3. Attribue une confiance élevée (1.0) car il s'agit d'une source de référence.
4. Catégorise chaque leçon (logic, style, flow).

Renvoie du JSON : { "lessons": [{ "directive": "...", "category": "...", "confidence": 1.0, "tags": [] }] }
`.trim()

    const result = await this.generateStructured<{ lessons: any[] }>(prompt, this.getSystem(), {
      lessons: []
    })

    return result.data.lessons.map((l, i) => ({
      ...l,
      id: `ref-${Date.now()}-${i}`,
      agentName: 'VimaxNarrationAgent', // Par défaut pour la narration
      successCount: 1,
      failCount: 0,
      lastUpdated: Date.now()
    }))
  }

  protected getSystem(): string {
    return `
Tu es l'Analyste de Transcription de Vimax.
Ton expertise réside dans la déconstruction de récits audiovisuels réussis.
Tu ne commentes pas le contenu, tu extrais les MÉCANISMES de narration qui le rendent efficace.
`.trim()
  }
}
