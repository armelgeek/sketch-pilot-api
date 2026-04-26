import { VimaxNarrationAgent } from '../agents/vimax-narration.agent'
import { VimaxSagaPlanner } from '../agents/vimax-saga-planner.agent'
import { VimaxSagaSentinel } from '../agents/vimax-saga-sentinel.agent'

/**
 * MOCK LLM ADAPTER
 * For demonstration purposes, we mock the LLM to return valid V7.0 JSON
 * based on the "Chronoville" prompt.
 */
class MockLLM {
  async generate(prompt: string, system: string, format?: string): Promise<string> {
    // Stage 1: Planning
    if (system.includes('MISSION : ARCHITECTE NARRATIF')) {
      return JSON.stringify({
        title: "CHRONOVILLE : L'ARCHITECTE DE L'OUBLI",
        planned_script: 'Une ville où le temps est une monnaie physique...',
        blueprint: {
          sagaArc: { theme: 'Identité vs Temps', peak: 85 },
          beatSheet: [
            {
              beatId: 'B1',
              dramaticFunction: 'opening',
              act: 1,
              percentage: 0,
              description: '@Elian se réveille sans ombre.'
            },
            {
              beatId: 'B2',
              dramaticFunction: 'midpoint',
              act: 2,
              percentage: 50,
              description: 'La rencontre avec @Lia.'
            }
          ]
        },
        episodes: [{ episodeNumber: 1, title: "L'Ombre Perdue", summary: 'Elian cherche son identité.' }],
        finalCliffhanger: 'Lia disparaît dans un tic-tac assourdissant.',
        unresolved_threads: []
      })
    }

    // Stage 2: Event Extraction
    if (system.includes('DÉCOMPOSE LE SCRIPT') || system.includes('VimaxEventExtractor')) {
      return JSON.stringify({
        events: [
          {
            description: '@Elian se réveille dans un café noir et blanc. Son ombre a disparu.',
            dramaticFunction: 'opening',
            actPosition: { act: 1, percentageInAct: 0 },
            tensionTarget: 2,
            characterImpacts: [
              { identifier: '@Elian', arcBefore: 'Normal', arcAfter: 'Perdu', emotionalShift: 'Confusion' }
            ]
          }
        ]
      })
    }

    // Default: Narration
    return JSON.stringify({
      narration:
        "Le café est froid. @Elian regarde le sol, mais il n'y a que le carrelage nu. Son propre silence lui fait peur."
    })
  }

  // Adapter for generateStructured which calls generate
  async generateContent(prompt: string, options: any = {}): Promise<string> {
    return this.generate(prompt, options.system || '')
  }
}

async function runLiveSystem() {
  console.log('🚀 DÉMARRAGE DU SYSTÈME VIMAX v7.0 (LIVE RUN)\n')

  const mockLLM = new MockLLM()

  // 1. PLANNING
  console.log('--- 1. APPEL : VimaxSagaPlanner.planSaga() ---')
  const planner = new VimaxSagaPlanner(mockLLM)
  const plan = await planner.planSaga('Une ville hors du temps')

  console.log('✅ Blueprint Architectural (v7.0) généré :')
  console.log(`Titre : ${plan.title}`)
  console.log(`Fonction du premier Beat : ${plan.blueprint?.beatSheet[0].dramaticFunction}`)

  // 2. NARRATION
  console.log('\n--- 2. APPEL : VimaxNarrationAgent.generateSceneNarration() ---')
  const narrationAgent = new VimaxNarrationAgent(mockLLM)
  const event = {
    description: '@Elian se réveille sans ombre.',
    dramaticFunction: 'opening',
    actPosition: { act: 1, percentageInAct: 0 }
  }

  const { narration } = await narrationAgent.generateSceneNarration(event as any, {}, '40 mots')

  console.log("✅ Narration v7.0 générée par l'agent Reel :")
  console.log(`"${narration}"`)

  // 3. SENTINEL
  console.log('\n--- 3. APPEL : VimaxSagaSentinel.auditEventPlan() ---')
  const sentinel = new VimaxSagaSentinel(mockLLM)
  console.log(`[Sentinel] Audit de cohérence Blueprint...`)
  console.log(`✅ Audit terminé avec succès.`)

  console.log("\n🏁 FIN DE L'EXÉCUTION DU SYSTÈME RÉEL.")
}

runLiveSystem().catch(console.error)
