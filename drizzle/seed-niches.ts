import * as crypto from 'node:crypto'
import { exit } from 'node:process'
import { eq } from 'drizzle-orm'
import { COMEDY_SPEC } from '../plugins/sketch-pilot/src/specs/comedy.spec'
import { DOCUMENTARY_SPEC } from '../plugins/sketch-pilot/src/specs/documentary.spec'
import { INTERVIEW_SPEC } from '../plugins/sketch-pilot/src/specs/interview.spec'
import { MOTIVATIONAL_SPEC } from '../plugins/sketch-pilot/src/specs/motivational.spec'
import { TUTORIAL_SPEC } from '../plugins/sketch-pilot/src/specs/tutorial.spec'
import { db } from '../src/infrastructure/database/db'
import { prompts } from '../src/infrastructure/database/schema/prompt.schema'
import 'dotenv/config'

async function seed() {
  console.log('⏳ Seeding Niche Specifications...')

  const nicheSpecs = [DOCUMENTARY_SPEC, COMEDY_SPEC, MOTIVATIONAL_SPEC, TUTORIAL_SPEC, INTERVIEW_SPEC]

  for (const spec of nicheSpecs) {
    console.log(`Processing niche: ${spec.name}...`)

    // Check if prompt already exists by name
    const [existing] = await db.select().from(prompts).where(eq(prompts.name, spec.name)).limit(1)

    const promptData = {
      name: spec.name,
      description: `Spécification officielle pour la niche ${spec.name}`,
      config: spec,
      isActive: true,
      updatedAt: new Date()
    }

    if (existing) {
      console.log(`Updating existing prompt: ${existing.id} (${spec.name})`)
      await db.update(prompts).set(promptData).where(eq(prompts.id, existing.id))
    } else {
      const id = crypto.randomUUID()
      console.log(`Creating new prompt: ${id} (${spec.name})`)
      await db.insert(prompts).values({
        id,
        ...promptData,
        createdAt: new Date()
      })
    }
  }

  console.log('🏁 Niche seeding finished!')
}

seed()
  .then(() => exit(0))
  .catch((error) => {
    console.error('❌ Seeding failed:', error)
    exit(1)
  })
