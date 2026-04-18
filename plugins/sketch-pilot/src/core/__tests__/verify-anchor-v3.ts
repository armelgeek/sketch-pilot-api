import { AnchorEngine } from '../anchor-engine'

async function testAnchorEngine() {
  const engine = new AnchorEngine({ maxChainLength: 10, reanchorThreshold: 4 })

  console.log('--- Initializing Base Anchor ---')
  engine.registerBaseAnchor('http://image.com/base.jpg', 'scene-0')

  console.log('--- Scene 1: Low Mutation ---')
  engine.registerDelta({
    currentPosition: 'Center of forest',
    currentAction: 'Character standing still',
    mutationLevel: 'LOW',
    framing: 'MEDIUM'
  })
  console.log(
    'Next Anchors:',
    engine.getNextAnchors().map((a) => a.name)
  )
  console.log('Hints:', engine.getEvolutionHints())

  console.log('\n--- Scene 2: High Mutation / Reveal ---')
  engine.registerDelta({
    currentPosition: 'Edge of cliff',
    currentAction: 'Character looking at horizon',
    mutationLevel: 'HIGH',
    sceneIntent: 'REVEAL',
    framing: 'WIDE'
  })
  engine.registerGenerationResult('http://image.com/scene-1.jpg', 'scene-1')
  console.log(
    'Next Anchors:',
    engine.getNextAnchors().map((a) => a.name)
  )
  console.log('Hints:', engine.getEvolutionHints())

  console.log('\n--- Suggesting Next Shot ---')
  console.log('Suggested:', engine.suggestNextShot())
}

testAnchorEngine().catch(console.error)
