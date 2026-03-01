import { db } from '../database/db'

const INDEXES = [
  { name: 'idx_activity_logs_action', sql: 'CREATE INDEX idx_activity_logs_action ON activity_logs (action);' },
  { name: 'idx_activity_logs_resource', sql: 'CREATE INDEX idx_activity_logs_resource ON activity_logs (resource);' },
  { name: 'idx_activity_logs_status', sql: 'CREATE INDEX idx_activity_logs_status ON activity_logs (status);' },
  { name: 'idx_activity_logs_user_id', sql: 'CREATE INDEX idx_activity_logs_user_id ON activity_logs (user_id);' },
  { name: 'idx_activity_logs_timestamp', sql: 'CREATE INDEX idx_activity_logs_timestamp ON activity_logs (timestamp);' }
]

export async function createActivityLogsIndexes() {
  try {
    // Récupère la liste des index existants sur activity_logs
    const existingIndexes = await db.execute(`SELECT indexname FROM pg_indexes WHERE tablename = 'activity_logs'`)
    // db.execute retourne un tableau d'objets { indexname: string }
    const existing = new Set((existingIndexes as any[]).map((r) => r.indexname))
    let created = 0
    for (const idx of INDEXES) {
      if (!existing.has(idx.name)) {
        await db.execute(idx.sql)
        created++
        console.info(`[activity_logs] Index créé : ${idx.name}`)
      } else {
        console.info(`[activity_logs] Index déjà présent : ${idx.name}`)
      }
    }
    if (created === 0) {
      console.info('Tous les index activity_logs existent déjà.')
    }
  } catch (error) {
    console.error('Error creating activity logs indexes:', error)
  }
}
