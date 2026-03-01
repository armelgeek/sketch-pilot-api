import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { MinIOService } from './minio.service'

export class AvatarService {
  private minioService: MinIOService
  private allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  private maxFileSize = 5 * 1024 * 1024 // 5MB

  constructor() {
    this.minioService = new MinIOService()
  }

  /**
   * Valide un fichier avatar
   */
  validateFile(file: File): void {
    if (!this.allowedMimeTypes.includes(file.type)) {
      throw new Error('Invalid file type. Only JPEG, PNG, GIF and WebP are allowed.')
    }

    if (file.size > this.maxFileSize) {
      throw new Error(`File size must be less than ${this.maxFileSize / 1024 / 1024}MB`)
    }
  }

  /**
   * Upload un avatar avec redimensionnement
   */
  async uploadAvatar(file: File): Promise<{ id: string; url: string }> {
    this.validateFile(file)

    // Lire le fichier et le redimensionner
    const buffer = await file.arrayBuffer()
    const processedBuffer = await sharp(Buffer.from(buffer))
      .resize(300, 300, {
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 80 })
      .toBuffer()

    // Upload directement avec le buffer traité vers MinIO
    return await this.minioService.uploadFileFromBuffer(processedBuffer, 'avatar.webp', 'image/webp', 'avatars')
  }

  /**
   * Supprime un avatar
   */
  async deleteAvatar(id: string): Promise<boolean> {
    return await this.minioService.deleteFile('avatars', id, 'webp')
  }

  /**
   * Obtient l'URL signée d'un avatar
   */
  async getAvatarUrl(id: string): Promise<string | null> {
    try {
      return await this.minioService.getAutoRenewedSignedUrl('avatars', id, 'webp')
    } catch (error) {
      console.error('Error getting avatar URL:', error)
      return null
    }
  }

  /**
   * Upload depuis un buffer (pour la migration)
   */
  async uploadAvatarFromBuffer(buffer: Buffer, originalFilename: string): Promise<{ id: string; url: string }> {
    // Redimensionner l'image
    const processedBuffer = await sharp(buffer)
      .resize(300, 300, {
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 80 })
      .toBuffer()

    // Utiliser la méthode MinIO pour buffer
    const id = this.extractIdFromFilename(originalFilename) || randomUUID()
    return await this.minioService.uploadFileFromBuffer(processedBuffer, `${id}.webp`, 'image/webp', 'avatars')
  }

  /**
   * Extrait l'ID du nom de fichier
   */
  private extractIdFromFilename(filename: string): string | null {
    const match = filename.match(/^([^.]+)/)
    return match ? match[1] : null
  }
}
