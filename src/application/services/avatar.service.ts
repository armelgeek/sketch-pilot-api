import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const uploadsDir = join(__dirname, '..', '..', '..', 'uploads', 'avatars')

export class AvatarService {
  private allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  private maxFileSize = 5 * 1024 * 1024 // 5MB

  validateFile(file: File): void {
    if (!this.allowedMimeTypes.includes(file.type)) {
      throw new Error('Invalid file type. Only JPEG, PNG, GIF and WebP are allowed.')
    }

    if (file.size > this.maxFileSize) {
      throw new Error(`File size must be less than ${this.maxFileSize / 1024 / 1024}MB`)
    }
  }

  async uploadAvatar(file: File): Promise<{ id: string; url: string }> {
    this.validateFile(file)

    await mkdir(uploadsDir, { recursive: true })

    const id = randomUUID()
    const filename = `${id}.webp`
    const filePath = join(uploadsDir, filename)

    const buffer = await file.arrayBuffer()
    await sharp(Buffer.from(buffer))
      .resize(300, 300, { fit: 'cover', position: 'center' })
      .webp({ quality: 80 })
      .toFile(filePath)

    return { id, url: `/uploads/avatars/${filename}` }
  }

  async deleteAvatar(id: string): Promise<boolean> {
    try {
      const { unlink } = await import('node:fs/promises')
      const filePath = join(uploadsDir, `${id}.webp`)
      if (existsSync(filePath)) {
        await unlink(filePath)
      }
      return true
    } catch (error) {
      console.error('Error deleting avatar:', error)
      return false
    }
  }

  async getAvatarUrl(id: string): Promise<string | null> {
    const filePath = join(uploadsDir, `${id}.webp`)
    if (existsSync(filePath)) {
      return `/uploads/avatars/${id}.webp`
    }
    return null
  }
}
