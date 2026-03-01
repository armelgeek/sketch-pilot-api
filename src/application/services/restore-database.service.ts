import { db } from '@/infrastructure/database/db'
import * as schema from '@/infrastructure/database/schema/schema'

export class RestoreDatabaseService {
  async restoreFromBackup(backup: any) {
    // Pour chaque table, on supprime tout puis on insère les données du backup
    // (Attention: désactivez les contraintes de FK si besoin, ou respectez l'ordre)
    // Ordre: enfants, users, modules, lessons, games, gamePrerequisites, gameSessions, etc.
    // Ici, on fait simple: on supprime tout puis on insère (en respectant l'ordre des dépendances)

    // 1. Suppression (dans l'ordre des dépendances)
    await db.delete(schema.gameSessions)
    await db.delete(schema.gamePrerequisites)
    await db.delete(schema.games)
    await db.delete(schema.lessons)
    await db.delete(schema.modules)
    await db.delete(schema.children)
    await db.delete(schema.userRoles)
    await db.delete(schema.roleResources)
    await db.delete(schema.roles)
    await db.delete(schema.accounts)
    await db.delete(schema.sessions)
    await db.delete(schema.verifications)
    await db.delete(schema.verificationCodes)
    await db.delete(schema.activityLogs)
    await db.delete(schema.subscriptionHistory)
    await db.delete(schema.avatars)
    await db.delete(schema.systemConfig)
    await db.delete(schema.users)

    // 2. Insertion (dans l'ordre des dépendances inversé)
    if (backup.systemConfig) await db.insert(schema.systemConfig).values(backup.systemConfig)
    if (backup.avatars) await db.insert(schema.avatars).values(backup.avatars)
    if (backup.subscriptionHistory) await db.insert(schema.subscriptionHistory).values(backup.subscriptionHistory)
    if (backup.activityLogs) await db.insert(schema.activityLogs).values(backup.activityLogs)
    if (backup.verificationCodes) await db.insert(schema.verificationCodes).values(backup.verificationCodes)
    if (backup.verifications) await db.insert(schema.verifications).values(backup.verifications)
    if (backup.sessions) await db.insert(schema.sessions).values(backup.sessions)
    if (backup.accounts) await db.insert(schema.accounts).values(backup.accounts)
    if (backup.roles) await db.insert(schema.roles).values(backup.roles)
    if (backup.roleResources) await db.insert(schema.roleResources).values(backup.roleResources)
    if (backup.userRoles) await db.insert(schema.userRoles).values(backup.userRoles)
    if (backup.children) await db.insert(schema.children).values(backup.children)
    if (backup.modules) await db.insert(schema.modules).values(backup.modules)
    if (backup.lessons) await db.insert(schema.lessons).values(backup.lessons)
    if (backup.games) await db.insert(schema.games).values(backup.games)
    if (backup.gamePrerequisites) await db.insert(schema.gamePrerequisites).values(backup.gamePrerequisites)
    if (backup.gameSessions) await db.insert(schema.gameSessions).values(backup.gameSessions)
    if (backup.users) await db.insert(schema.users).values(backup.users)
    return { success: true }
  }
}
