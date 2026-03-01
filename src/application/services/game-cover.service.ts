import { GameRepository } from '@/infrastructure/repositories/game.repository'
import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'
import { MinIOService } from './minio.service'

export class GameCoverService {
  private readonly minioService: MinIOService
  private readonly gameRepository?: GameRepositoryInterface
  private readonly folder = 'game-covers'

  constructor() {
    this.minioService = new MinIOService()
    this.gameRepository = new GameRepository()
  }

  /**
   * Upload une couverture de jeu vers MinIO
   */
  async uploadGameCover(file: File): Promise<{ id: string; url: string }> {
    // Validation du type de fichier
    if (!file.type.startsWith('image/')) {
      throw new Error('Le fichier doit être une image')
    }

    // Validation de la taille (5MB max)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      throw new Error('La taille du fichier ne doit pas dépasser 5MB')
    }

    return await this.minioService.uploadFile(file, this.folder)
  }

  /**
   * Supprime une couverture de jeu de MinIO
   */
  async deleteGameCover(id: string): Promise<boolean> {
    try {
      // Essayer différentes extensions possibles
      const possibleExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp']

      for (const ext of possibleExtensions) {
        const exists = await this.minioService.fileExists(this.folder, id, ext)
        if (exists) {
          return await this.minioService.deleteFile(this.folder, id, ext)
        }
      }

      return false
    } catch (error) {
      console.error('Erreur lors de la suppression de la couverture:', error)
      return false
    }
  }

  /**
   * Vérifie si une couverture existe
   */
  async coverExists(id: string): Promise<boolean> {
    const possibleExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp']

    for (const ext of possibleExtensions) {
      const exists = await this.minioService.fileExists(this.folder, id, ext)
      if (exists) {
        return true
      }
    }

    return false
  }

  /**
   * Obtient l'URL publique d'une couverture
   */
  getPublicUrl(id: string, extension: string = 'jpg'): string {
    return this.minioService.getPublicUrl(this.folder, id, extension)
  }

  /**
   * Génère une URL signée pour l'accès temporaire
   */
  async getSignedUrl(id: string, extension: string = 'jpg'): Promise<string> {
    return await this.minioService.getAutoRenewedSignedUrl(this.folder, id, extension)
  }

  /**
   * Extrait l'ID d'une couverture à partir de son URL
   */
  extractCoverIdFromUrl(url: string): string | null {
    const fileInfo = this.minioService.extractFileIdFromUrl(url)
    return fileInfo?.fileId || null
  }

  /**
   * Méthode pour compatibilité avec l'ancien système de fichiers locaux
   * Retourne les informations d'un fichier pour servir le contenu
   */
  async getGameCoverFile(id: string): Promise<{ path: string; type: string; url: string } | null> {
    const possibleExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp']

    for (const ext of possibleExtensions) {
      const exists = await this.minioService.fileExists(this.folder, id, ext)
      if (exists) {
        // Pour MinIO, on retourne l'URL signée comme "path"
        const signedUrl = await this.minioService.getAutoRenewedSignedUrl(this.folder, id, ext)
        return {
          path: signedUrl,
          type: ext,
          url: this.minioService.getPublicUrl(this.folder, id, ext)
        }
      }
    }

    return null
  }

  /**
   * Supprime une couverture par son URL
   */
  async deleteGameCoverByUrl(url: string): Promise<boolean> {
    const fileInfo = this.minioService.extractFileIdFromUrl(url)
    if (!fileInfo) {
      return false
    }

    return await this.minioService.deleteFile(fileInfo.folder, fileInfo.fileId, fileInfo.extension)
  }

  /**
   * Remplace une couverture existante par une nouvelle
   */
  async replaceGameCover(oldCoverId: string, newFile: File): Promise<{ id: string; url: string }> {
    try {
      // Upload la nouvelle couverture
      const newCover = await this.uploadGameCover(newFile)

      // Supprime l'ancienne couverture
      await this.deleteGameCover(oldCoverId)

      return newCover
    } catch (error) {
      console.error('Erreur lors du remplacement de la couverture:', error)
      throw error
    }
  }

  /**
   * Nettoyage des couvertures orphelines
   * Note: Cette fonctionnalité nécessite une implémentation plus complexe pour MinIO
   */
  cleanupGameCovers(): { deleted: number; errors: string[] } {
    const result = { deleted: 0, errors: [] as string[] }

    try {
      // Pour MinIO, cette fonction nécessiterait de lister tous les objets
      // et de vérifier les références dans la base de données
      console.warn('Cleanup des couvertures orphelines non implémenté pour MinIO')
      return result
    } catch (error) {
      result.errors.push(`Erreur lors du nettoyage: ${error}`)
      return result
    }
  }
}
