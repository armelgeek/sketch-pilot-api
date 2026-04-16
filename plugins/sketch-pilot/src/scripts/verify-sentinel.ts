import { SeriesHallucinationSentinel } from '../core/generators/series/series-sentinel'
import type { SeriesContext } from '../core/generators/series-video-generator'
import type { LLMScriptOutput } from '../core/generators/series/series-script.schema'

async function runTest() {
  const mockContext: SeriesContext = {
    seriesId: 'test-saga',
    episodeNumber: 2,
    previousEpisodesContext: '...',
    characterRegistry: {
      '@Lars': { description: 'Protagoniste', status: 'alive' },
      '@Maya': { description: 'Morte', status: 'dead' }
    },
    locationRegistry: {
      '@Foret': { description: 'Une forêt sombre' }
    },
    assetRegistry: {}
  } as any

  const hallucinatingScript: LLMScriptOutput = {
    titles: ['Le retour'],
    fullNarration: 'Lars marche avec @Inconnu.',
    scenes: [
      {
        id: 's1',
        sceneNumber: 1,
        summary: 'Lars et @Inconnu (hallu) sont là.',
        narration: 'Lars regarde Maya.',
        locationId: '@Chateau', // Hallu
        charactersInScene: ['@Lars', '@Inconnu', '@Maya'], // @Inconnu is unknown, @Maya is dead
        cameraAction: 'pan-right' as any,
        transition: 'fade' as any
      }
    ],
    seriesMetadata: {
      episodeSummary: 'Un test.'
    }
  } as any

  console.log('--- 🛡️ Starting Sentinel Audit ---')
  const report = SeriesHallucinationSentinel.audit(hallucinatingScript, mockContext)

  console.log('Is Valid:', report.isValid)
  console.log('Issues found:', report.issues.length)
  report.issues.forEach((i) => console.log(`- [${i.severity.toUpperCase()}] ${i.message}`))

  if (!report.isValid) {
    console.log('\n--- 📝 Generated Correction Prompt ---')
    console.log(SeriesHallucinationSentinel.generateCorrectionPrompt(report))
  }

  // Expected:
  // 1. Error: Hallucination de personnage: "@Inconnu"
  // 2. Error: Hallucination de lieu: "@Chateau"
  // 3. Error: Violation Anti-Résurrection: @Maya est MORT.
}

runTest().catch(console.error)
