import { PRESET_MIN_SENTENCES, PRESET_MIN_WORDS } from '../constants/prompt-constants'

export function validateAndCorrectNarration(
  narration: string,
  preset: string
): {
  corrected: string
  violations: string[]
  isValid: boolean
} {
  const violations: string[] = []
  let corrected = narration.trim()

  // ── 1. Sentences > 18 words → flag ──────────────────────────────────
  corrected.split(/(?<=[.!?])\s+/).forEach((sentence) => {
    const words = sentence.trim().split(/\s+/)
    if (words.length > 18) {
      violations.push(
        `Sentence too long (${words.length} words) — needs manual split: "${sentence.slice(0, 80)}${sentence.length > 80 ? '...' : ''}"`
      )
    }
  })

  // ── 2. Pause density — min 2 '...' per scene ────────────────────────
  const pauseCount = (corrected.match(/\.\.\./g) || []).length
  if (pauseCount < 2) {
    violations.push(`Insufficient pause markers: ${pauseCount}/2 minimum`)
    const sentences = corrected.split(/(?<=[.!?])\s+/)
    if (sentences.length >= 2 && pauseCount === 0) {
      sentences[0] = sentences[0].replace(/([.!?])$/, '...')
      if (sentences.length > 2) {
        sentences[2] = sentences[2].replace(/([.!?])$/, '...')
      }
      corrected = sentences.join(' ')
    } else if (pauseCount === 1 && sentences.length >= 3) {
      sentences[2] = sentences[2].replace(/([.!?])$/, '...')
      corrected = sentences.join(' ')
    }
  }

  // ── 2a. Reflective Question Pause ──────────────────────────────────
  if (corrected.trim().endsWith('?')) {
    corrected = `${corrected.trim()}...`
    violations.push(`Scene ends with a question — added reflective '...' pause`)
  }

  // ── 3. Orphan sentence at end < 5 words ─────────────────────────────
  const sentences = corrected.split(/(?<=[.!?])\s+/)
  const lastSentence = sentences.at(-1)?.trim() ?? ''
  const lastWordCount = lastSentence.split(/\s+/).filter(Boolean).length
  if (lastWordCount > 0 && lastWordCount < 5) {
    const precededByPause = sentences.at(-2)?.trim().endsWith('...')
    if (!precededByPause) {
      violations.push(`Orphan sentence at end (${lastWordCount} words): "${lastSentence}"`)
      if (sentences.length > 1) {
        const prevIdx = sentences.length - 2
        const prev = sentences[prevIdx]
        if (prev) {
          sentences[prevIdx] = prev.replace(/([.!?])$/, '...')
          corrected = sentences.join(' ')
        }
      }
    }
  }

  // ── 4. Word count floor per preset ──────────────────────────────────
  const wordCount = corrected.split(/\s+/).filter(Boolean).length
  const minWords = (PRESET_MIN_WORDS as any)[preset] || 15
  if (wordCount < minWords) {
    violations.push(`Word count too low: ${wordCount}/${minWords} minimum for preset "${preset}"`)
  }

  // ── 5. Sentence count floor per preset ──────────────────────────────
  const sentenceCount = (corrected.match(/[.!?]+/g) || []).length
  const minSentences = (PRESET_MIN_SENTENCES as any)[preset] || 2
  if (sentenceCount < minSentences) {
    violations.push(`Sentence count too low: ${sentenceCount}/${minSentences} minimum for preset "${preset}"`)
  }

  return {
    corrected,
    violations,
    isValid: violations.length === 0
  }
}

export function validateNarrativeCoherence(
  scenes: Array<{ sceneNumber: number; preset: string; narration: string }>
): string[] {
  const violations: string[] = []

  for (let i = 0; i < scenes.length - 1; i++) {
    const current = scenes[i]
    const next = scenes[i + 1]

    const currentSentences = current.narration.split(/(?<=[.!?])\s+/)
    const lastSentence = currentSentences.at(-1)?.trim() ?? ''

    const nextSentences = next.narration.split(/(?<=[.!?])\s+/)
    const firstSentence = nextSentences[0]?.trim() ?? ''

    const bridgeKeywords = extractKeywords(lastSentence)
    const openingKeywords = extractKeywords(firstSentence)

    const overlap = bridgeKeywords.filter((k) => openingKeywords.includes(k))

    if (overlap.length === 0) {
      violations.push(
        `Scene ${current.sceneNumber} → ${next.sceneNumber}: No semantic bridge detected.\n` +
          `  Bridge: "${lastSentence.slice(0, 80)}"\n` +
          `  Opening: "${firstSentence.slice(0, 80)}"`
      )
    }
  }

  const hook = scenes.find((s) => s.preset === 'hook')
  if (hook) {
    const hookKeywords = extractKeywords(hook.narration)
    const restKeywords = scenes.filter((s) => s.preset !== 'hook').flatMap((s) => extractKeywords(s.narration))

    const resolved = hookKeywords.filter((k) => restKeywords.includes(k))
    if (resolved.length < 2) {
      violations.push(
        `Narrative drift: Hook introduces concepts not resolved in subsequent scenes.\n` +
          `  Hook keywords: ${hookKeywords.slice(0, 6).join(', ')}\n` +
          `  Rest coverage: ${resolved.join(', ') || 'none'}`
      )
    }
  }

  const presets = scenes.map((s) => s.preset)
  if (!presets.includes('reveal')) {
    violations.push(`Structural violation: No "reveal" scene found. Arc is incomplete.`)
  }

  return violations
}

export function fixFullNarrationDrift(script: any): { script: any; driftFixed: boolean; driftWords: number } {
  if (!script?.scenes?.length) return { script, driftFixed: false, driftWords: 0 }

  const sceneNarrations: string = script.scenes.map((s: any) => s.narration ?? '').join(' ')
  const sceneWords = sceneNarrations.trim().split(/\s+/).filter(Boolean).length
  const fullNarrationWords = (script.fullNarration ?? '').trim().split(/\s+/).filter(Boolean).length
  const drift = Math.abs(sceneWords - fullNarrationWords)
  const driftPct = fullNarrationWords > 0 ? drift / fullNarrationWords : 1

  if (driftPct > 0.02) {
    script.fullNarration = sceneNarrations
    script.totalWordCount = sceneWords
    return { script, driftFixed: true, driftWords: drift }
  }

  return { script, driftFixed: false, driftWords: drift }
}

export function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'is',
    'are',
    'was',
    'were',
    'this',
    'that',
    'it',
    'you',
    'we',
    'they',
    'he',
    'she',
    'i',
    'me',
    'my',
    'your',
    'our',
    'their',
    'have',
    'has',
    'had',
    'be',
    'been',
    'do',
    'does',
    'did',
    'will',
    'would',
    'can',
    'could',
    'should',
    'may',
    'might',
    'not',
    'no',
    'so',
    'if',
    'as'
  ])

  return text
    .toLowerCase()
    .replaceAll(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w))
}
