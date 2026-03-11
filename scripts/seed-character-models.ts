/**
 * Seed script: uploads local character model images to MinIO
 * and registers them in the character_models database table.
 *
 * Run with:
 *   npx tsx scripts/seed-character-models.ts
 */

import { Buffer } from 'node:buffer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'

import { eq } from 'drizzle-orm'

import { BUCKET, uploadBuffer } from '../src/infrastructure/config/storage.config'
import { db } from '../src/infrastructure/database/db'
import { characterModels } from '../src/infrastructure/database/schema'
// Bootstrap env before imports that use DB / storage
import 'dotenv/config'

/** Local model definitions → { name, filePath, isStandard } */
const LOCAL_MODELS = [
  { name: 'standard', file: 'model.jpg', isStandard: true },
  { name: 'model-2', file: 'stick/model-2.webp', isStandard: false },
  { name: 'model-3', file: 'stick/model-3.webp', isStandard: false },
  { name: 'model-4', file: 'stick/model-4.webp', isStandard: false }
]

const MODELS_DIR = fs.existsSync(path.join(process.cwd(), 'plugins/sketch-pilot/models'))
  ? path.join(process.cwd(), 'plugins/sketch-pilot/models')
  : path.join(process.cwd(), 'models')

async function run() {
  console.log('[Seed] Starting character models seeding...')
  console.log(`[Seed] MinIO bucket: ${BUCKET}`)
  console.log(`[Seed] Models dir: ${MODELS_DIR}`)

  let created = 0
  let skipped = 0

  for (const def of LOCAL_MODELS) {
    const localPath = path.join(MODELS_DIR, def.file)

    if (!fs.existsSync(localPath)) {
      console.warn(`[Seed] ⚠️  File not found, skipping: ${localPath}`)
      skipped++
      continue
    }

    // Check if already seeded
    const [existing] = await db.select().from(characterModels).where(eq(characterModels.name, def.name)).limit(1)

    if (existing) {
      console.log(`[Seed] ⏭️  Already exists: "${def.name}" (id: ${existing.id})`)
      skipped++
      continue
    }

    // Read file & detect MIME type
    const buffer = fs.readFileSync(localPath)
    const ext = path.extname(def.file).replace('.', '') // jpg | webp
    const mimeType = ext === 'webp' ? 'image/webp' : 'image/jpeg'

    // Upload to MinIO
    const id = crypto.randomUUID()
    const key = `character-models/${id}.${ext}`
    console.log(`[Seed] ⬆️  Uploading "${def.name}" → ${key}`)
    const imageUrl = await uploadBuffer(key, Buffer.from(buffer), mimeType)

    // Insert into DB
    await db.insert(characterModels).values({
      id,
      name: def.name,
      imageUrl,
      mimeType,
      isStandard: def.isStandard
    })

    console.log(`[Seed] ✅ Seeded: "${def.name}" → ${imageUrl}`)
    created++
  }

  console.log(`\n[Seed] Done! Created: ${created}, Skipped: ${skipped}`)
  process.exit(0)
}

run().catch((error) => {
  console.error('[Seed] Fatal error:', error)
  process.exit(1)
})
