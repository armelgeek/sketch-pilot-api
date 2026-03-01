import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import type { AvatarRepositoryInterface } from '@/domain/repositories/avatar.repository.interface'
import type { PaginationParams } from '@/infrastructure/middlewares/pagination.middleware'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..', '..', '..')

export class FileService {
  private readonly allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif']
  private readonly maxFileSize = 5 * 1024 * 1024
  private readonly uploadsDir = join(rootDir, 'uploads', 'avatars')

  constructor(private readonly avatarRepository: AvatarRepositoryInterface) {
    mkdir(this.uploadsDir, { recursive: true }).catch(console.error)
  }

  validateFile(file: { size: number; mimetype: string }) {
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new Error('Invalid file type. Only JPEG, PNG and GIF are allowed.')
    }

    if (file.size > this.maxFileSize) {
      throw new Error('File too large. Maximum size is 5MB.')
    }
  }

  async saveAvatar(file: { buffer: ArrayBuffer; mimetype: string }) {
    const id = crypto.randomUUID()
    const filename = `${id}.webp`
    const filePath = join(this.uploadsDir, filename)
    const relativePath = join('uploads', 'avatars', filename)

    await sharp(Buffer.from(file.buffer))
      .resize(300, 300, {
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 80 })
      .toFile(filePath)

    const avatar = await this.avatarRepository.save({
      id,
      path: relativePath
    })

    return avatar
  }

  async getAvatarFile(id: string) {
    const avatar = await this.avatarRepository.findById(id)
    if (!avatar) return null

    const absolutePath = join(this.uploadsDir, `${id}.webp`)
    if (!existsSync(absolutePath)) {
      return null
    }

    const relativePath = `uploads/avatars/${id}.webp`
    return {
      path: relativePath,
      type: 'webp'
    }
  }

  async deleteFile(relativePath: string) {
    try {
      const absolutePath = join(rootDir, relativePath)
      await unlink(absolutePath)
      return true
    } catch (error) {
      console.error('Error deleting file:', error)
      return false
    }
  }

  async listAvatars(pagination: PaginationParams) {
    const items = await this.avatarRepository.findAll({
      skip: pagination.skip,
      limit: pagination.limit
    })
    const total = await this.avatarRepository.count()

    return {
      items,
      total
    }
  }
}
