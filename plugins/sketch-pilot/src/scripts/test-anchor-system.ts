import { AnchorEngine } from '../core/anchor-engine'

async function runAdvancedTests() {
  console.log('--- 🧪 Advanced AnchorEngine Verification ---')
  const engine = new AnchorEngine({ maxChainLength: 5, reanchorThreshold: 3 })

  // --- Scenario 1: Sans base ---
  console.log('\n[Scénario 1] Test Sans base...')
  const anchorsBeforeBase = engine.getNextAnchors()
  console.log('Anchors (should be empty):', anchorsBeforeBase)
  engine.registerGenerationResult('https://err.com', 'err-1') // Should log error

  // --- Scenario 2: Base & Normal Flow ---
  console.log('\n[Scénario 2] Initialisation...')
  engine.registerBaseAnchor('https://base.com/img.jpg', 'base-v1')
  console.log('Chain Pressure:', `${engine.getChainPressure()}%`)

  // --- Scenario 3: Forcer re-anchor ---
  console.log("\n[Scénario 3] Forcer re-anchor (Génération jusqu'au threshold)...")
  // We need to reach step 3 for re-anchor
  for (let i = 1; i <= 3; i++) {
    const anchors = engine.getNextAnchors()
    console.log(
      `Step ${i} anchors:`,
      anchors.map((a) => a.name)
    )
    engine.registerGenerationResult(`https://img.com/${i}.jpg`, `step-${i}`)
  }
  console.log('Chain Pressure after 3 steps:', `${engine.getChainPressure()}%`)

  // --- Scenario 4: Overflow chaîne ---
  console.log('\n[Scénario 4] Overflow chaîne (Trigger reset auto)...')
  console.log('Current chain count before overflow:', (engine.getState() as any).chainCount)
  // Current count is 3. maxChainLength is 5. 2 more steps to hit 5 and reset.
  for (let i = 4; i <= 5; i++) {
    engine.registerGenerationResult(`https://img.com/${i}.jpg`, `step-${i}`)
  }
  console.log('State after overflow (should be reset):', engine.getState())
  console.log('Chain Pressure after overflow:', `${engine.getChainPressure()}%`)

  // --- Scenario 5: Double promotion & Reset rapide ---
  console.log('\n[Scénario 5] Cas limites (Double promotion & Reset rapide)...')
  engine.promoteToBase('https://promo.com/1.jpg', 'promo-1')
  engine.promoteToBase('https://promo.com/2.jpg', 'promo-2') // Should just update base

  engine.resetChain()
  engine.resetChain() // Should log warning (already empty)

  // --- Setup for Live Config Simulation ---
  console.log('\n[Live Config] Testing threshold = 1 (Re-anchor at every step)...')
  engine.setConfig({ reanchorThreshold: 1 })
  engine.registerBaseAnchor('https://base-config.com/img.jpg', 'base-config')
  engine.registerGenerationResult('https://img.com/step-1.jpg', 'step-1')
  console.log(
    'Anchors at step 1 with threshold=1 (should have REANCHOR_COUPLING):',
    engine.getNextAnchors().map((a) => a.name)
  )

  console.log('\n--- ✅ All scenarios executed ---')
}

runAdvancedTests().catch(console.error)
