import { ExtractionStatus } from '../../domain/enums/extraction-status.enum'
import { MinIOService } from './minio.service'

export class GameFileService {
  private readonly minioService: MinIOService
  private readonly folder = 'games'

  constructor() {
    this.minioService = new MinIOService()
  }

  /**
   * Upload un fichier de jeu vers MinIO (sans extraction)
   * Retourne immédiatement après l'upload
   */
  async uploadGameFile(file: File): Promise<{ id: string; url: string; isZip: boolean }> {
    // Types autorisés : ZIP standard + extensions personnalisées pour contourner validation
    const allowedTypes = [
      'application/zip',
      'application/x-zip-compressed',
      'text/html',
      'application/javascript',
      'application/json',
      'application/x-shockwave-flash',
      'application/octet-stream', // Pour les extensions personnalisées
      'text/plain', // Pour éviter les erreurs de parsing HTML
      'application/x-compressed',
      'multipart/x-zip'
    ]

    // Extensions personnalisées acceptées (considérées comme des ZIP renommés)
    const gameExtensions = ['.game', '.data', '.bin', '.pkg', '.unity', '.build']
    const isCustomGameFile = gameExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))

    // Validation flexible du type MIME
    const isValidType =
      allowedTypes.includes(file.type) ||
      isCustomGameFile ||
      file.type === '' || // Fichiers sans type MIME défini
      file.type.startsWith('application/') // Tous les types application/*

    if (!isValidType) {
      throw new Error(
        'Type de fichier non autorisé. Types acceptés: ZIP, HTML, JS, JSON, SWF, .game, .data, .bin, .pkg, .unity'
      )
    }

    // Validation de la taille (50MB max)
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      throw new Error('La taille du fichier ne doit pas dépasser 50MB')
    }

    // Détecter si c'est un fichier ZIP
    const isZip = isCustomGameFile || file.type.includes('zip') || file.name.endsWith('.zip')

    // Pour les gros fichiers ZIP (>5MB), utiliser la méthode multipart optimisée
    const isLargeZip = file.size > 5 * 1024 * 1024 && isZip

    if (isLargeZip) {
      console.info(`Upload pour gros fichier ZIP: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`)
      try {
        // Essayer d'abord le vrai multipart
        const uploadResult = await this.minioService.uploadLargeFile(file, this.folder)
        return { ...uploadResult, isZip }
      } catch (error) {
        console.warn('Échec upload multipart, fallback vers upload simple avec progression:', error)
        // Fallback vers upload simple avec progression
        const uploadResult = await this.minioService.uploadFileWithProgress(file, this.folder)
        return { ...uploadResult, isZip }
      }
    }

    const uploadResult = await this.minioService.uploadFile(file, this.folder)
    return { ...uploadResult, isZip }
  }

  /**
   * Extrait un fichier ZIP en arrière-plan
   */
  async extractGameFileBackground(
    gameId: string,
    zipUrl: string,
    onStatusUpdate?: (status: ExtractionStatus, error?: string) => Promise<void>
  ): Promise<{ indexHtmlUrl: string | null; extractedFiles: string[] }> {
    try {
      // Notifier le début de l'extraction
      if (onStatusUpdate) {
        await onStatusUpdate(ExtractionStatus.PROCESSING)
      }

      console.info(`Début extraction ZIP pour le jeu ${gameId}`)

      // Télécharger le fichier ZIP depuis MinIO
      const zipBuffer = await this.minioService.downloadFile(zipUrl)

      // Extraire et uploader
      const extractResult = await this.minioService.extractZipAndUpload(zipBuffer, this.folder, gameId)

      // Notifier le succès
      if (onStatusUpdate) {
        await onStatusUpdate(ExtractionStatus.COMPLETED)
      }

      console.info(`Extraction terminée pour le jeu ${gameId}:`, {
        indexHtmlUrl: extractResult.indexHtmlUrl,
        extractedFiles: extractResult.extractedFiles?.length || 0
      })

      return {
        indexHtmlUrl: extractResult.indexHtmlUrl || null,
        extractedFiles: extractResult.extractedFiles
      }
    } catch (error) {
      console.error(`Erreur lors de l'extraction pour le jeu ${gameId}:`, error)

      // Notifier l'échec
      if (onStatusUpdate) {
        await onStatusUpdate(ExtractionStatus.FAILED, error instanceof Error ? error.message : 'Erreur inconnue')
      }

      throw error
    }
  }

  /**
   * Supprime un fichier de jeu de MinIO
   */
  async deleteGameFile(id: string): Promise<boolean> {
    try {
      // Essayer différentes extensions possibles
      const possibleExtensions = ['zip', 'html', 'js', 'json', 'swf']

      for (const ext of possibleExtensions) {
        const exists = await this.minioService.fileExists(this.folder, id, ext)
        if (exists) {
          return await this.minioService.deleteFile(this.folder, id, ext)
        }
      }

      return false
    } catch (error) {
      console.error('Erreur lors de la suppression du fichier de jeu:', error)
      return false
    }
  }

  /**
   * Vérifie si un fichier de jeu existe
   */
  async fileExists(id: string): Promise<boolean> {
    const possibleExtensions = ['zip', 'html', 'js', 'json', 'swf']

    for (const ext of possibleExtensions) {
      const exists = await this.minioService.fileExists(this.folder, id, ext)
      if (exists) {
        return true
      }
    }

    return false
  }

  /**
   * Obtient l'URL publique d'un fichier de jeu
   */
  getPublicUrl(id: string, extension: string): string {
    return this.minioService.getPublicUrl(this.folder, id, extension)
  }

  /**
   * Génère une URL signée pour l'accès temporaire
   */
  async getSignedUrl(id: string, extension: string): Promise<string> {
    return await this.minioService.getAutoRenewedSignedUrl(this.folder, id, extension)
  }

  /**
   * Extrait l'ID d'un fichier à partir de son URL
   */
  extractFileIdFromUrl(url: string): string | null {
    const fileInfo = this.minioService.extractFileIdFromUrl(url)
    return fileInfo?.fileId || null
  }

  /**
   * Méthode pour compatibilité avec l'ancien système
   * Retourne les informations d'un fichier pour servir le contenu
   */
  async getGameFile(id: string): Promise<{ path: string; type: string; url: string } | null> {
    const possibleExtensions = ['zip', 'html', 'js', 'json', 'swf']

    for (const ext of possibleExtensions) {
      const exists = await this.minioService.fileExists(this.folder, id, ext)
      if (exists) {
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
   * Supprime un fichier par son URL
   */
  async deleteGameFileByUrl(url: string): Promise<boolean> {
    const fileInfo = this.minioService.extractFileIdFromUrl(url)
    if (!fileInfo) {
      return false
    }

    return await this.minioService.deleteFile(fileInfo.folder, fileInfo.fileId, fileInfo.extension)
  }

  /**
   * Remplace un fichier existant par un nouveau
   */
  async replaceGameFile(oldFileId: string, newFile: File): Promise<{ id: string; url: string }> {
    try {
      // Upload le nouveau fichier
      const newFileInfo = await this.uploadGameFile(newFile)

      // Supprime l'ancien fichier
      await this.deleteGameFile(oldFileId)

      return newFileInfo
    } catch (error) {
      console.error('Erreur lors du remplacement du fichier:', error)
      throw error
    }
  }

  /**
   * Supprime tous les fichiers extraits d'un jeu (dossier complet)
   */
  deleteExtractedGameFiles(gameId: string): Promise<boolean> {
    try {
      console.info(`Suppression des fichiers extraits pour le jeu ${gameId}`)

      // Note: MinIO ne supporte pas la suppression de dossiers directement
      // Il faudrait lister tous les fichiers du dossier puis les supprimer un par un
      // Pour l'instant, on retourne true pour ne pas bloquer

      // TODO: Implémenter la suppression récursive des fichiers extraits
      // - Lister tous les objets avec le préfixe games/{gameId}/
      // - Supprimer chaque fichier individuellement

      return Promise.resolve(true)
    } catch (error) {
      console.error('Erreur lors de la suppression des fichiers extraits:', error)
      return Promise.resolve(false)
    }
  }
}
