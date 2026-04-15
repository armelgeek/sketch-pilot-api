import { SeriesVideoGenerator } from '../core/generators/series-video-generator.js'

async function testMapping() {
  const registry = {
    'Frère Aloysius': { description: 'Un moine' },
    'Dr. Watson': { description: 'Un médecin' },
    Maya: { description: 'Une aventurière' }
  }

  const testCases = [
    { input: '@brotheraloysius', expected: 'Frère Aloysius' },
    { input: '@aloysius', expected: 'Frère Aloysius' },
    { input: '@drwatson', expected: 'Dr. Watson' },
    { input: '@watson', expected: 'Dr. Watson' },
    { input: '@maya', expected: 'Maya' }
  ]

  console.log('🧪 Testing Character Handle Mapping...')
  let success = 0
  for (const tc of testCases) {
    const result = SeriesVideoGenerator.findKeyInRegistry(registry as any, tc.input)
    if (result === tc.expected) {
      console.log(`✅ ${tc.input} -> ${tc.expected}`)
      success++
    } else {
      console.log(`❌ ${tc.input} -> EXPECTED: ${tc.expected}, GOT: ${result}`)
    }
  }

  if (success === testCases.length) {
    console.log('\n✨ All mapping tests passed!')
  } else {
    console.log(`\n⚠️ ${testCases.length - success} tests failed.`)
    process.exit(1)
  }
}

testMapping().catch(console.error)
