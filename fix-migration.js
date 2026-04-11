import process from 'node:process'
import dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config()

const sql = postgres(process.env.DATABASE_URL)

async function fixMigration() {
  try {
    console.info('--- DB Fix: Converting last_cliffhanger to jsonb ---')
    await sql`ALTER TABLE series ALTER COLUMN last_cliffhanger TYPE jsonb USING to_jsonb(last_cliffhanger);`
    console.info('✅ Column successfully converted to jsonb!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Failed to convert column:', error.message)
    process.exit(1)
  }
}

fixMigration()
