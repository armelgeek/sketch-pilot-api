import process from 'node:process'
import { db } from '../src/infrastructure/database/db'
import { users } from '../src/infrastructure/database/schema'
import 'dotenv/config'

async function getUserId() {
  const result = await db.select().from(users).limit(1)
  if (result.length > 0) {
    console.log(result[0].id)
  } else {
    process.exit(1)
  }
  process.exit(0)
}

getUserId()
