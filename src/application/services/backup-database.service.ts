import { db } from '@/infrastructure/database/db'
import * as schema from '@/infrastructure/database/schema/schema'

export class BackupDatabaseService {
  async getFullBackup() {
    // Liste des tables à dumper
    const tables = {
      users: await db.select().from(schema.users),
      children: await db.select().from(schema.children),
      modules: await db.select().from(schema.modules),
      lessons: await db.select().from(schema.lessons),
      games: await db.select().from(schema.games),
      gamePrerequisites: await db.select().from(schema.gamePrerequisites),
      gameSessions: await db.select().from(schema.gameSessions),
      activityLogs: await db.select().from(schema.activityLogs),
      subscriptionHistory: await db.select().from(schema.subscriptionHistory),
      avatars: await db.select().from(schema.avatars),
      roles: await db.select().from(schema.roles),
      roleResources: await db.select().from(schema.roleResources),
      userRoles: await db.select().from(schema.userRoles),
      accounts: await db.select().from(schema.accounts),
      sessions: await db.select().from(schema.sessions),
      verifications: await db.select().from(schema.verifications),
      verificationCodes: await db.select().from(schema.verificationCodes),
      systemConfig: await db.select().from(schema.systemConfig)
    }
    return tables
  }
}
