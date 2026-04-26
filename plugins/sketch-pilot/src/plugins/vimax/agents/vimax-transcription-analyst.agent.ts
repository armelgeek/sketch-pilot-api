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
[MISSION : ANALYSE NARRATIVE & ADN STYLISTIQUE]
Tu reçois la transcription d'une vidéo de référence nommée "${sourceLabel}".
Ton but est d'analyser le RYTHME, le TON, la STRUCTURE et le STYLE de narration.

[CONSIGNES D'EXTRACTION]
1. **DIRECTIVES** : Identifie des principes de narration (ex: gestion du suspens, économie de mots).
2. **VOCABULAIRE (WORD BANK)** : Extrais une liste de mots et expressions "viscéraux", "puissants" ou "sensoriels" caractéristiques de ce style.
3. **CLICHÉS À BANNIR** : Identifie les types de phrases, mots ou tics d'écriture trop "génériques" ou "abstraits" à éviter.

[CONTENU DE LA TRANSCRIPTION]
${transcription.slice(0, 10000)} ...

Renvoie du JSON : 
{ 
  "lessons": [{ "directive": "...", "category": "logic", "tags": ["narrative"] }],
  "vocabulary": ["mot1", "expression2"],
  "cliches": ["phrase bannie"]
}
`.trim()

    const result = await this.generateStructured<{ lessons: any[]; vocabulary?: string[]; cliches?: string[] }>(
      prompt,
      this.getSystem(),
      {
        lessons: [],
        vocabulary: [],
        cliches: []
      }
    )

    const lessons: Lesson[] = result.data.lessons.map((l, i) => ({
      ...l,
      id: `ref-${Date.now()}-${i}`,
      agentName: 'VimaxNarrationAgent',
      confidence: 1,
      successCount: 1,
      failCount: 0,
      lastUpdated: Date.now()
    }))

    // Ajouter le vocabulaire comme des leçons spéciales "style:vocabulary"
    if (result.data.vocabulary?.length) {
      lessons.push({
        id: `vocab-${Date.now()}`,
        agentName: 'VimaxNarrationAgent',
        directive: `Utilise préférentiellement ce vocabulaire sensoriel : ${result.data.vocabulary.join(', ')}`,
        category: 'style',
        confidence: 1,
        successCount: 1,
        failCount: 0,
        tags: ['style:vocabulary'],
        lastUpdated: Date.now()
      })
    }

    // Ajouter les clichés bannis comme des leçons spéciales "style:forbidden"
    if (result.data.cliches?.length) {
      lessons.push({
        id: `cliche-${Date.now()}`,
        agentName: 'VimaxNarrationAgent',
        directive: `INTERDICTION d'utiliser ces clichés ou mots génériques : ${result.data.cliches.join(', ')}`,
        category: 'style',
        confidence: 1,
        successCount: 1,
        failCount: 0,
        tags: ['style:forbidden'],
        lastUpdated: Date.now()
      })
    }

    return lessons
  }

  protected getSystem(): string {
    return `
Tu es l'Analyste de Transcription de Vimax.
Ton expertise réside dans la déconstruction de récits audiovisuels réussis.
Tu ne commentes pas le contenu, tu extrais les MÉCANISMES de narration qui le rendent efficace.
`.trim()
  }
}
