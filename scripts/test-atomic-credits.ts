import process from 'node:process'
import { eq } from 'drizzle-orm'
import { db } from '../src/infrastructure/database/db'
import { userCredits, users } from '../src/infrastructure/database/schema'
import { CreditsRepository } from '../src/infrastructure/repositories/credits.repository'

const creditsRepository = new CreditsRepository()

async function testConcurrency() {
  const testUserId = `test-concurrency-user-${Date.now()}`
  console.log('--- Starting Atomic Credits Concurrency Test ---')
  console.log('User ID:', testUserId)

  // 0. Create dummy user to satisfy FK
  await db.insert(users).values({
    id: testUserId,
    name: 'Test Concurrency',
    email: `${testUserId}@example.com`,
    emailVerified: true
  })

  // 1. Initialize user with 0 credits
  await creditsRepository.ensureUserCredits(testUserId)
  await db.update(userCredits).set({ extraCredits: 0 }).where(eq(userCredits.userId, testUserId))

  const initial = await creditsRepository.getUserCredits(testUserId)
  console.log('Initial Balance:', initial?.extraCredits)

  // 2. Simulate 10 concurrent additions of 100 credits each
  console.log('Simulating 10 concurrent top-ups of 100 credits...')
  const topups = Array.from({ length: 10 })
    .fill(100)
    .map((amount) => creditsRepository.addExtraCredits(testUserId, amount as number))

  // Also simulate concurrent consumptions if possible, but let's start with additions
  await Promise.all(topups)

  const afterTopups = await creditsRepository.getUserCredits(testUserId)
  console.log('Balance after 10 concurrent top-ups (Expected: 1000):', afterTopups?.extraCredits)

  if (afterTopups?.extraCredits === 1000) {
    console.log('✅ TOP-UP CONCURRENCY SUCCESSFUL')
  } else {
    console.log('❌ TOP-UP CONCURRENCY FAILED')
  }

  // 3. Mixed Concurrency: Top-up and Consumption
  console.log('Simulating mixed concurrency (10 top-ups of 100, 10 consumptions of 50)...')
  const mixed = [
    ...Array.from({ length: 10 })
      .fill(100)
      .map((amount) => creditsRepository.addExtraCredits(testUserId, amount as number)),
    ...Array.from({ length: 10 })
      .fill(50)
      .map(() => creditsRepository.consumeCredits(testUserId, 50, 0)) // Force extra credits consumption
  ]

  await Promise.all(mixed)

  const final = await creditsRepository.getUserCredits(testUserId)
  const expected = 1000 + 10 * 100 - 10 * 50 // 1000 + 1000 - 500 = 1500
  console.log(`Final Balance (Expected: ${expected}):`, final?.extraCredits)

  if (final?.extraCredits === expected) {
    console.log('✅ MIXED CONCURRENCY SUCCESSFUL')
  } else {
    console.log('❌ MIXED CONCURRENCY FAILED')
  }

  process.exit(0)
}

testConcurrency().catch((error) => {
  console.error(error)
  process.exit(1)
})
