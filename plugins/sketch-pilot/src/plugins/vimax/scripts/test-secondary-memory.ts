import { VimaxCharacterExtractor } from '../agents/vimax-character-extractor.agent'

class MockExtractor extends VimaxCharacterExtractor {
  async generate(prompt: string, system: string, format?: string): Promise<string> {
    if (system.includes('analyse de scripts') || system.includes('character-extractor')) {
      return JSON.stringify({
        characters: [
          {
            identifier: '@Garde',
            physicalDescription: 'Un garde imposant',
            roleInSaga: 'Antagoniste mineur',
            arc_plan: 'Devient un allié',
            narrative_memory: ['Posté à la porte'],
            portrait_prompt: 'Garde médiéval'
          }
        ]
      })
    }
    return JSON.stringify({ characters: [] })
  }
}

async function testSecondaryMemory() {
  const llm = {} as any // Not used anymore by MockExtractor.generate
  const extractor = new MockExtractor(llm)

  console.log('=== TESTING CHARACTER EXTRACTION WITH ARC ===')
  console.log('Calling extractCharacters...')
  const profiles = await extractor.extractCharacters('Le @Garde surveille @Lucas.')
  console.log('extractCharacters finished.')
  console.log('EXTRACTED PROFILE:', profiles[0])

  console.log('\n=== TESTING PROMPT FORMATTING WITH MEMORY ===')
  console.log('Updating profiles...')
  // Simulating memory update
  profiles[0].narrative_memory = ["A vu @Lucas s'échapper", "A reçu une pièce d'or"]
  console.log('Calling formatForPrompt...')
  const formatted = extractor.formatForPrompt(profiles)
  console.log('formatForPrompt finished.')
  console.log('FORMATTED FOR PROMPT:\n', formatted)

  if (formatted.includes('MÉMOIRE NARRATIVE') && formatted.includes('OBJECTIF ARC')) {
    console.log('✅ SUCCESS: Memory and Arc injected into prompt.')
  } else {
    console.error('❌ FAIL: Memory or Arc missing from prompt.')
  }
}

testSecondaryMemory().catch(console.error)
