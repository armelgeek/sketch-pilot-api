import process from 'node:process'
/* eslint-disable no-console */
import postgres from 'postgres'
import 'dotenv/config'

const sql = postgres(process.env.DATABASE_URL)

async function fix() {
  try {
    console.log('Checking series table...')
    const columns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'series';
    `

    console.log(
      'Current columns:',
      columns.map((c) => c.column_name)
    )

    if (!columns.some((c) => c.column_name === 'seed')) {
      console.log('Adding seed column...')
      await sql`ALTER TABLE series ADD COLUMN "seed" TEXT;`
      console.log('Column added successfully.')
    } else {
      console.log('Seed column already exists.')
    }
  } catch (error) {
    console.error('Error fixing DB:', error)
  } finally {
    await sql.end()
  }
}

fix()

/* eslint-enable no-console */
