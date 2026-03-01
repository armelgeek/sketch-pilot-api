#!/usr/bin/env bun

import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { MinIOService } from './src/application/services/minio.service'
import { AvatarRepository } from './src/infrastructure/repositories/avatar.repository'
import { GameRepository } from './src/infrastructure/repositories/game.repository'
import { ModuleRepository } from './src/infrastructure/repositories/module.repository'

const __dirname = dirname(fileURLToPath(import.meta.url))
const uploadsDir = join(__dirname, 'uploads')

class FilesMigration {
  private minioService: MinIOService
  private moduleRepository: ModuleRepository
  private gameRepository: GameRepository
  private avatarRepository: AvatarRepository

  constructor() {
    this.minioService = new MinIOService()
    this.moduleRepository = new ModuleRepository()
    this.gameRepository = new GameRepository()
    this.avatarRepository = new AvatarRepository()
  }

  async migrateModuleCovers() {
    console.info('🔄 Migration des couvertures de modules...')
    const coversDir = join(uploadsDir, 'covers')

    if (!existsSync(coversDir)) {
      console.warn('⚠️ Dossier covers non trouvé, passage à la suite')
      return
    }

    const files = await readdir(coversDir)
    let migrated = 0
    let errors = 0

    for (const filename of files) {
      try {
        const filepath = join(coversDir, filename)
        const fileBuffer = await readFile(filepath)

        // Extraire l'ID et l'extension du nom de fichier
        const [id, ext] = filename.split('.')
        if (!id || !ext) continue

        // Upload vers MinIO directement avec le buffer
        const mimeType = this.getMimeType(ext)
        const result = await this.minioService.uploadFileFromBuffer(fileBuffer, filename, mimeType, 'module-covers')

        // Mettre à jour la base de données si un module existe avec ce fichier
        const modules = await this.moduleRepository.findAll()
        const moduleToUpdate = modules.find((m) => m.coverUrl?.includes(id))

        if (moduleToUpdate) {
          await this.moduleRepository.update(moduleToUpdate.id, {
            coverUrl: result.url
          })
          console.info(`✅ Module ${moduleToUpdate.name} - couverture migrée: ${result.url}`)
        } else {
          console.warn(`⚠️ Aucun module trouvé pour le fichier ${filename}`)
        }

        migrated++
      } catch (error) {
        console.error(`❌ Erreur migration ${filename}:`, error)
        errors++
      }
    }

    console.info(`📊 Couvertures de modules: ${migrated} migrées, ${errors} erreurs`)
  }

  async migrateGameCovers() {
    console.info('🔄 Migration des couvertures de jeux...')
    const gameCoversDir = join(uploadsDir, 'game-covers')

    if (!existsSync(gameCoversDir)) {
      console.warn('⚠️ Dossier game-covers non trouvé, passage à la suite')
      return
    }

    const files = await readdir(gameCoversDir)
    let migrated = 0
    let errors = 0

    for (const filename of files) {
      try {
        const filepath = join(gameCoversDir, filename)
        const fileBuffer = await readFile(filepath)

        const [id, ext] = filename.split('.')
        if (!id || !ext) continue

        const mimeType = this.getMimeType(ext)
        const result = await this.minioService.uploadFileFromBuffer(fileBuffer, filename, mimeType, 'game-covers')

        // Mettre à jour la base de données
        const games = await this.gameRepository.findAll()
        const gameToUpdate = games.find((g) => g.coverUrl?.includes(id))

        if (gameToUpdate) {
          await this.gameRepository.update(gameToUpdate.id, {
            coverUrl: result.url
          })
          console.info(`✅ Jeu ${gameToUpdate.title} - couverture migrée: ${result.url}`)
        } else {
          console.warn(`⚠️ Aucun jeu trouvé pour le fichier ${filename}`)
        }

        migrated++
      } catch (error) {
        console.error(`❌ Erreur migration ${filename}:`, error)
        errors++
      }
    }

    console.info(`📊 Couvertures de jeux: ${migrated} migrées, ${errors} erreurs`)
  }

  async migrateGameFiles() {
    console.info('🔄 Migration des fichiers de jeux...')
    const gamesDir = join(uploadsDir, 'games')

    if (!existsSync(gamesDir)) {
      console.warn('⚠️ Dossier games non trouvé, passage à la suite')
      return
    }

    const files = await readdir(gamesDir)
    let migrated = 0
    let errors = 0

    for (const filename of files) {
      try {
        const filepath = join(gamesDir, filename)
        const fileBuffer = await readFile(filepath)

        const [id, ext] = filename.split('.')
        if (!id || !ext) continue

        const mimeType = this.getMimeType(ext)
        const result = await this.minioService.uploadFileFromBuffer(fileBuffer, filename, mimeType, 'games')

        // Mettre à jour la base de données
        const games = await this.gameRepository.findAll()
        const gameToUpdate = games.find((g) => g.file?.includes(id))

        if (gameToUpdate) {
          await this.gameRepository.update(gameToUpdate.id, {
            file: result.url
          })
          console.info(`✅ Jeu ${gameToUpdate.title} - fichier migré: ${result.url}`)
        } else {
          console.warn(`⚠️ Aucun jeu trouvé pour le fichier ${filename}`)
        }

        migrated++
      } catch (error) {
        console.error(`❌ Erreur migration ${filename}:`, error)
        errors++
      }
    }

    console.info(`📊 Fichiers de jeux: ${migrated} migrés, ${errors} erreurs`)
  }

  async migrateAvatars() {
    console.info('🔄 Migration des avatars...')
    const avatarsDir = join(uploadsDir, 'avatars')

    if (!existsSync(avatarsDir)) {
      console.warn('⚠️ Dossier avatars non trouvé, passage à la suite')
      return
    }

    const files = await readdir(avatarsDir)
    let migrated = 0
    let errors = 0

    for (const filename of files) {
      try {
        const filepath = join(avatarsDir, filename)
        const fileBuffer = await readFile(filepath)

        const [id, ext] = filename.split('.')
        if (!id || !ext) continue

        const mimeType = this.getMimeType(ext)
        const result = await this.minioService.uploadFileFromBuffer(fileBuffer, filename, mimeType, 'avatars')

        // Mettre à jour la base de données si un avatar existe avec ce fichier
        const avatars = await this.avatarRepository.findAll({ skip: 0, limit: 1000 })
        const avatarToUpdate = avatars.find((a) => a.path?.includes(id))

        if (avatarToUpdate) {
          // Supprimer l'ancien avatar et créer le nouveau avec l'URL MinIO
          await this.avatarRepository.delete(avatarToUpdate.id)
          await this.avatarRepository.save({
            id,
            path: result.url
          })
          console.info(`✅ Avatar ${id} migré: ${result.url}`)
        } else {
          console.warn(`⚠️ Aucun avatar trouvé pour le fichier ${filename}`)
        }

        migrated++
      } catch (error) {
        console.error(`❌ Erreur migration ${filename}:`, error)
        errors++
      }
    }

    console.info(`📊 Avatars: ${migrated} migrés, ${errors} erreurs`)
  }

  private getMimeType(extension: string): string {
    const mimeTypes: { [key: string]: string } = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      zip: 'application/zip',
      html: 'text/html',
      js: 'application/javascript',
      json: 'application/json',
      swf: 'application/x-shockwave-flash'
    }
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream'
  }

  async run() {
    console.info('🚀 Début de la migration des fichiers vers MinIO')

    try {
      await this.migrateModuleCovers()
      await this.migrateGameCovers()
      await this.migrateGameFiles()
      await this.migrateAvatars()

      console.info('🎉 Migration terminée avec succès!')
    } catch (error) {
      console.error('❌ Erreur lors de la migration:', error)
      process.exit(1)
    }
  }
}

// Exécuter la migration
const migration = new FilesMigration()
migration.run()
