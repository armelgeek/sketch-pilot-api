import { sql } from 'drizzle-orm'
import { db } from '../../../../src/infrastructure/database/db'

async function testDb() {
  console.log('🔍 Testing DB connection...')
  try {
    const result = await db.execute(sql`SELECT COUNT(*) FROM prompts`)
    console.log('✅ Connection OK, count result:', result)
    process.exit(0)
  } catch (error) {
    console.error('❌ Connection failed:', error)
    process.exit(1)
  }
}

testDb()
