import { GameRepository } from '@/infrastructure/repositories/game.repository'
import type { GameRepositoryInterface } from '@/domain/repositories/game.repository.interface'
import { MinIOService } from './minio.service'

export class ModuleCoverService {
  private readonly minioService: MinIOService
  private readonly gameRepository?: GameRepositoryInterface
  private readonly folder = 'module-covers'

  constructor() {
    this.minioService = new MinIOService()
    this.gameRepository = new GameRepository()
  }

  /**
   * Upload une couverture de module vers MinIO
   */
  async uploadModuleCover(file: File): Promise<{ id: string; url: string }> {
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
   * Supprime une couverture de module de MinIO
   */
  async deleteModuleCover(id: string): Promise<boolean> {
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
      console.error('Erreur lors de la suppression de la couverture de module:', error)
      return false
    }
  }

  /**
   * Méthode pour compatibilité avec l'ancien système
   * Retourne les informations d'un fichier pour servir le contenu
   */
  async getModuleCoverFile(id: string): Promise<{ path: string; type: string; url: string } | null> {
    const possibleExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp']

    for (const ext of possibleExtensions) {
      const exists = await this.minioService.fileExists(this.folder, id, ext)
      if (exists) {
        const signedUrl = await this.minioService.getSignedUrl(this.folder, id, ext)
        return {
          path: signedUrl,
          type: ext,
          url: this.minioService.getPublicUrl(this.folder, id, ext)
        }
      }
    }

    return null
  }
}
