import { randomUUID } from 'node:crypto'
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import JSZip from 'jszip'
import type { Buffer } from 'node:buffer'

export class MinIOService {
  private s3Client: S3Client
  private bucketName: string
  private baseUrl: string

  constructor() {
    this.bucketName = Bun.env.MINIO_BUCKET_NAME || 'images'
    this.baseUrl = Bun.env.MINIO_API_URL || 'https://api.storage.dev.meko.ac'

    const isProduction = Bun.env.NODE_ENV === 'production'

    this.s3Client = new S3Client({
      endpoint: this.baseUrl,
      region: 'us-east-1',
      credentials: {
        accessKeyId: Bun.env.MINIO_ACCESS_KEY || 'root',
        secretAccessKey: Bun.env.MINIO_SECRET_KEY || 'hjJ4nFWi2yZM9k'
      },
      forcePathStyle: true,
      // Configuration pour supporter les ZIP avec HTML (basée sur boto3 qui fonctionnait)
      maxAttempts: 3,
      ...(isProduction
        ? {}
        : {
            requestHandler: {
              requestTimeout: 60000, // 60 secondes pour les gros fichiers
              httpsAgent: { rejectUnauthorized: false }
            }
          })
    })
  }

  /**
   * Upload un fichier vers MinIO
   */
  async uploadFile(file: File, folder: string): Promise<{ id: string; url: string }> {
    console.info(`[MINIO] Début upload: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`)

    const id = randomUUID()
    const extension = this.getFileExtension(file.type)
    const fileName = `${folder}/${id}.${extension}`

    console.info(`[MINIO] Lecture du buffer...`)
    const buffer = await file.arrayBuffer()

    // Paramètres spéciaux pour les fichiers ZIP et HTML pour éviter les erreurs de parsing
    const isZipOrArchive =
      file.type.includes('zip') ||
      file.type.includes('compressed') ||
      file.name.endsWith('.zip') ||
      file.name.endsWith('.game') ||
      file.name.endsWith('.data') ||
      file.name.endsWith('.bin')

    const isHtmlOrText =
      file.type.includes('html') ||
      file.type.includes('text') ||
      file.name.endsWith('.html') ||
      file.name.endsWith('.htm')

    // Configuration adaptée selon le type de fichier
    const commandOptions: any = {
      Bucket: this.bucketName,
      Key: fileName,
      Body: new Uint8Array(buffer),
      ContentType: file.type,
      ContentLength: file.size
    }

    // Pour les ZIP et archives : forcer le téléchargement sans parsing
    if (isZipOrArchive) {
      console.info(`[MINIO] Configuration ZIP/Archive détectée`)
      commandOptions.ContentType = 'application/zip'
      commandOptions.ContentDisposition = 'attachment'
      commandOptions.ContentEncoding = 'identity' // Évite la décompression automatique
      commandOptions.Metadata = {
        'original-type': file.type,
        'file-category': 'archive'
      }
    }

    // Pour les HTML : traiter comme binaire pour éviter le parsing XML
    if (isHtmlOrText && folder === 'games') {
      console.info(`[MINIO] Configuration HTML/Text détectée`)
      commandOptions.ContentType = 'application/octet-stream'
      commandOptions.ContentDisposition = 'attachment'
      commandOptions.Metadata = {
        'original-type': file.type,
        'file-category': 'game-content'
      }
    }

    console.info(`[MINIO] Envoi vers MinIO: ${fileName}`)
    const command = new PutObjectCommand(commandOptions)

    await this.s3Client.send(command)

    const result = {
      id,
      url: `${this.baseUrl}/${this.bucketName}/${fileName}`
    }

    console.info(`[MINIO] Upload réussi: ${result.url}`)
    return result
  }

  /**
   * Upload un fichier vers MinIO depuis un buffer (pour la migration)
   */
  async uploadFileFromBuffer(
    buffer: Buffer,
    originalFilename: string,
    contentType: string,
    folder: string
  ): Promise<{ id: string; url: string }> {
    const id = this.extractIdFromFilename(originalFilename) || randomUUID()
    const extension = this.getFileExtension(contentType)
    const fileName = `${folder}/${id}.${extension}`

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileName,
      Body: new Uint8Array(buffer),
      ContentType: contentType
    })

    await this.s3Client.send(command)

    const url = `${this.baseUrl}/${this.bucketName}/${fileName}`
    return { id, url }
  }

  /**
   * Supprime un fichier de MinIO
   */
  async deleteFile(folder: string, fileId: string, extension: string): Promise<boolean> {
    try {
      const fileName = `${folder}/${fileId}.${extension}`

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: fileName
      })

      await this.s3Client.send(command)
      return true
    } catch (error) {
      console.error('Error deleting file from MinIO:', error)
      return false
    }
  }

  /**
   * Génère une URL signée pour l'accès temporaire à un fichier
   */
  async getSignedUrl(folder: string, fileId: string, extension: string, expiresIn: number = 3600): Promise<string> {
    const fileName = `${folder}/${fileId}.${extension}`

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: fileName
    })

    return await getSignedUrl(this.s3Client, command, { expiresIn })
  }

  /**
   * Vérifie si un fichier existe dans MinIO
   */
  async fileExists(folder: string, fileId: string, extension: string): Promise<boolean> {
    try {
      const fileName = `${folder}/${fileId}.${extension}`

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileName
      })

      await this.s3Client.send(command)
      return true
    } catch {
      return false
    }
  }

  /**
   * Upload un fichier avec configuration multipart (pour les gros fichiers ZIP Unity)
   */
  async uploadLargeFile(file: File, folder: string): Promise<{ id: string; url: string }> {
    console.info(`[MINIO LARGE] Début upload multipart: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`)

    const id = randomUUID()
    const extension = this.getFileExtension(file.type)
    const fileName = `${folder}/${id}.${extension}`

    console.info(`[MINIO LARGE] Lecture du buffer...`)
    const buffer = await file.arrayBuffer()
    const totalSize = buffer.byteLength

    // Seuil pour utiliser multipart (5MB)
    const multipartThreshold = 5 * 1024 * 1024

    if (totalSize < multipartThreshold) {
      console.info(`[MINIO LARGE] Fichier < 5MB, utilisation upload simple`)
      return await this.uploadFile(file, folder)
    }

    // Configuration multipart réelle
    const chunkSize = 5 * 1024 * 1024 // 5MB par chunk
    const totalChunks = Math.ceil(totalSize / chunkSize)

    console.info(`[MINIO LARGE] Upload multipart: ${totalChunks} chunks de ${(chunkSize / 1024 / 1024).toFixed(1)}MB`)

    try {
      // 1. Initier l'upload multipart
      console.info(`[MINIO LARGE] 1/3 - Création upload multipart...`)
      const createMultipartCommand = new CreateMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: fileName,
        ContentType: 'application/zip',
        ContentDisposition: 'attachment',
        Metadata: {
          'original-type': file.type,
          'file-category': 'unity-build',
          'multipart-upload': 'true'
        }
      })

      const multipartUpload = await this.s3Client.send(createMultipartCommand)
      const uploadId = multipartUpload.UploadId!
      console.info(`[MINIO LARGE] Upload ID: ${uploadId}`)

      // 2. Upload des chunks avec progression
      console.info(`[MINIO LARGE] 2/3 - Upload des chunks...`)
      const uploadPromises: Promise<{ ETag: string; PartNumber: number }>[] = []

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize
        const end = Math.min(start + chunkSize, totalSize)
        const chunk = buffer.slice(start, end)
        const partNumber = i + 1

        console.info(
          `[MINIO LARGE] Chunk ${partNumber}/${totalChunks} (${(chunk.byteLength / 1024 / 1024).toFixed(2)}MB)`
        )

        const uploadPartPromise = this.s3Client
          .send(
            new UploadPartCommand({
              Bucket: this.bucketName,
              Key: fileName,
              PartNumber: partNumber,
              UploadId: uploadId,
              Body: new Uint8Array(chunk)
            })
          )
          .then((result) => {
            console.info(`[MINIO LARGE] ✓ Chunk ${partNumber}/${totalChunks} terminé`)
            return {
              ETag: result.ETag!,
              PartNumber: partNumber
            }
          })
          .catch((error) => {
            console.error(`[MINIO LARGE] ✗ Erreur chunk ${partNumber}:`, error)
            throw error
          })

        uploadPromises.push(uploadPartPromise)
      }

      const parts = await Promise.all(uploadPromises)
      console.info(`[MINIO LARGE] Tous les chunks uploadés avec succès`)

      // 3. Finaliser l'upload multipart
      console.info(`[MINIO LARGE] 3/3 - Finalisation upload multipart...`)
      await this.s3Client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucketName,
          Key: fileName,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber)
          }
        })
      )

      const result = {
        id,
        url: `${this.baseUrl}/${this.bucketName}/${fileName}`
      }

      console.info(`[MINIO LARGE] Upload multipart réussi: ${result.url}`)
      return result
    } catch (error: any) {
      console.error(`[MINIO LARGE] Erreur upload multipart:`, error)
      throw new Error(`Upload multipart failed: ${error.message}`)
    }
  }

  /**
   * Upload un fichier avec progression (méthode simple pour debug)
   */
  async uploadFileWithProgress(file: File, folder: string): Promise<{ id: string; url: string }> {
    console.info(
      `[MINIO PROGRESS] Début upload avec progression: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`
    )

    const id = randomUUID()
    const extension = this.getFileExtension(file.type)
    const fileName = `${folder}/${id}.${extension}`

    console.info(`[MINIO PROGRESS] Lecture du buffer...`)
    const startRead = Date.now()
    const buffer = await file.arrayBuffer()
    const readTime = Date.now() - startRead
    console.info(`[MINIO PROGRESS] Buffer lu en ${readTime}ms`)

    // Configuration optimisée pour éviter les timeouts
    const commandOptions: any = {
      Bucket: this.bucketName,
      Key: fileName,
      Body: new Uint8Array(buffer),
      ContentType: 'application/zip',
      ContentDisposition: 'attachment',
      ContentLength: file.size,
      Metadata: {
        'original-type': file.type,
        'file-category': 'large-file',
        'upload-method': 'progress'
      }
    }

    console.info(`[MINIO PROGRESS] Préparation de l'envoi...`)
    const command = new PutObjectCommand(commandOptions)

    console.info(`[MINIO PROGRESS] Début envoi vers MinIO...`)
    const startUpload = Date.now()

    try {
      await this.s3Client.send(command)
      const uploadTime = Date.now() - startUpload
      console.info(`[MINIO PROGRESS] Upload terminé en ${uploadTime}ms`)

      const result = {
        id,
        url: `${this.baseUrl}/${this.bucketName}/${fileName}`
      }

      console.info(`[MINIO PROGRESS] Upload réussi: ${result.url}`)
      return result
    } catch (error: any) {
      const uploadTime = Date.now() - startUpload
      console.error(`[MINIO PROGRESS] Erreur après ${uploadTime}ms:`, error)
      throw error
    }
  }

  /**
   * Décompresse un fichier ZIP et upload les fichiers extraits (optimisé)
   */

  async extractZipAndUpload(
    zipBuffer: ArrayBuffer,
    folder: string,
    gameId: string
  ): Promise<{ extractedFiles: string[]; indexHtmlUrl?: string }> {
    console.info(
      `[MINIO EXTRACT] Début extraction ZIP pour jeu ${gameId} (${(zipBuffer.byteLength / 1024 / 1024).toFixed(2)}MB)`
    )

    try {
      // Utiliser JSZip pour décompresser
      const zip = new JSZip()
      console.info(`[MINIO EXTRACT] Chargement du ZIP...`)
      const zipContent = await zip.loadAsync(zipBuffer)

      const extractedFiles: string[] = []
      let indexHtmlUrl: string | undefined

      // Compter les fichiers à extraire
      const allFiles = Object.keys(zipContent.files).filter((path) => !zipContent.files[path].dir)
      console.info(`[MINIO EXTRACT] ${allFiles.length} fichiers à extraire`)

      // Traitement par batch pour éviter la surcharge
      const batchSize = 5 // Traiter 5 fichiers en parallèle max
      const batches: string[][] = []

      for (let i = 0; i < allFiles.length; i += batchSize) {
        batches.push(allFiles.slice(i, i + batchSize))
      }

      console.info(`[MINIO EXTRACT] Traitement en ${batches.length} lots de ${batchSize} fichiers max`)

      // Traiter chaque batch
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]
        console.info(`[MINIO EXTRACT] Lot ${batchIndex + 1}/${batches.length} (${batch.length} fichiers)`)

        const batchPromises = batch.map(async (relativePath) => {
          const file = zipContent.files[relativePath]
          const content = await file.async('arraybuffer')
          const fileName = `${folder}/${gameId}/${relativePath}`

          // Déterminer le type MIME et les headers spéciaux pour Brotli
          const extension = relativePath.split('.').pop()?.toLowerCase() || 'bin'
          const isBrotliFile = relativePath.endsWith('.br')

          let mimeType: string
          let contentEncoding: string | undefined

          if (isBrotliFile) {
            contentEncoding = 'br'

            if (relativePath.includes('.data.br')) {
              mimeType = 'application/octet-stream'
            } else if (relativePath.includes('.framework.js.br') || relativePath.includes('.js.br')) {
              mimeType = 'application/javascript'
            } else if (relativePath.includes('.wasm.br')) {
              mimeType = 'application/wasm'
            } else {
              mimeType = 'application/octet-stream'
            }
          } else {
            mimeType = this.getMimeTypeFromExtension(extension)
          }

          const commandParams: any = {
            Bucket: this.bucketName,
            Key: fileName,
            Body: new Uint8Array(content),
            ContentType: mimeType,
            Metadata: {
              'extracted-from': 'zip',
              'game-id': gameId,
              'original-path': relativePath
            }
          }

          if (contentEncoding) {
            commandParams.ContentEncoding = contentEncoding
          }

          const command = new PutObjectCommand(commandParams)
          await this.s3Client.send(command)

          const fileUrl = `${this.baseUrl}/${this.bucketName}/${fileName}`

          if (isBrotliFile) {
            console.info(
              `[MINIO EXTRACT] ✓ ${relativePath} (Brotli, ${mimeType}) (${(content.byteLength / 1024).toFixed(1)}KB)`
            )
          } else {
            console.info(`[MINIO EXTRACT] ✓ ${relativePath} (${(content.byteLength / 1024).toFixed(1)}KB)`)
          }

          if (relativePath.toLowerCase() === 'index.html' || relativePath.toLowerCase().endsWith('/index.html')) {
            indexHtmlUrl = fileUrl
            console.info(`[MINIO EXTRACT] ✓ Index HTML trouvé: ${relativePath}`)
          }

          return fileUrl
        })

        const batchResults = await Promise.all(batchPromises)
        extractedFiles.push(...batchResults)

        if (batchIndex < batches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }

      console.info(`[MINIO EXTRACT] ✅ Extraction terminée: ${extractedFiles.length} fichiers`)

      if (indexHtmlUrl) {
        console.info(`[MINIO EXTRACT] 🎮 Jeu Unity WebGL prêt: ${indexHtmlUrl}`)
      } else {
        console.warn(`[MINIO EXTRACT] ⚠️ Aucun index.html trouvé`)
      }

      return { extractedFiles, indexHtmlUrl }
    } catch (error: any) {
      console.error(`[MINIO EXTRACT] ❌ Erreur extraction ZIP:`, error)
      throw new Error(`Extraction failed: ${error.message}`)
    }
  }

  /**
   * Télécharge un fichier depuis MinIO
   */
  async downloadFile(fileUrl: string): Promise<ArrayBuffer> {
    try {
      // Extraire le nom du fichier depuis l'URL
      const urlParts = fileUrl.split('/')
      const fileName = urlParts.at(-1) || ''

      // Construire le chemin complet
      const folder = urlParts.at(-2) || 'games'
      const key = `${folder}/${fileName}`

      console.info(`[MINIO] Téléchargement du fichier: ${key}`)

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      })

      const response = await this.s3Client.send(command)

      if (!response.Body) {
        throw new Error('Fichier introuvable ou vide')
      }

      // Convertir le stream en ArrayBuffer
      const chunks: Uint8Array[] = []
      const reader = response.Body.transformToWebStream().getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
        }
      } finally {
        reader.releaseLock()
      }

      // Combiner tous les chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0

      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }

      console.info(`[MINIO] Fichier téléchargé: ${totalLength} bytes`)
      return result.buffer
    } catch (error) {
      console.error('Erreur lors du téléchargement du fichier:', error)
      throw error
    }
  }

  /**
   * Génère une URL publique pour un fichier
   */
  getAutoRenewedSignedUrl(folder: string, fileId: string, extension: string): string {
    return this.getPublicUrl(folder, fileId, extension)
  }

  /**
   * Obtient le type MIME à partir de l'extension de fichier
   */
  private getMimeTypeFromExtension(extension: string): string {
    const extToMime: { [key: string]: string } = {
      html: 'text/html',
      htm: 'text/html',
      js: 'application/javascript',
      css: 'text/css',
      json: 'application/json',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      webp: 'image/webp',
      ico: 'image/x-icon',
      wasm: 'application/wasm',
      data: 'application/octet-stream',
      unityweb: 'application/octet-stream',
      mem: 'application/octet-stream',
      symbols: 'application/octet-stream',
      txt: 'text/plain',
      xml: 'application/xml'
    }

    return extToMime[extension] || 'application/octet-stream'
  }

  /**
   * Obtient l'extension du fichier à partir du type MIME
   */
  private getFileExtension(mimeType: string): string {
    const mimeToExt: { [key: string]: string } = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'application/zip': 'zip',
      'text/html': 'html',
      'application/javascript': 'js',
      'application/json': 'json',
      'application/x-shockwave-flash': 'swf'
    }

    return mimeToExt[mimeType] || 'bin'
  }

  /**
   * Obtient l'URL publique d'un fichier
   */
  getPublicUrl(folder: string, fileId: string, extension: string): string {
    return `${this.baseUrl}/${this.bucketName}/${folder}/${fileId}.${extension}`
  }

  /**
   * Extrait l'ID d'un fichier à partir de son URL
   */
  extractFileIdFromUrl(url: string): { folder: string; fileId: string; extension: string } | null {
    try {
      // URL format: https://api.storage.dev.meko.ac/images/folder/fileId.extension
      const urlParts = url.replace(`${this.baseUrl}/${this.bucketName}/`, '').split('/')
      const folder = urlParts[0]
      const fileWithExt = urlParts[1]
      const lastDotIndex = fileWithExt.lastIndexOf('.')
      const fileId = fileWithExt.slice(0, lastDotIndex)
      const extension = fileWithExt.slice(lastDotIndex + 1)

      return { folder, fileId, extension }
    } catch (error) {
      console.error('Error extracting file ID from URL:', error)
      return null
    }
  }

  /**
   * Extrait l'ID du nom de fichier (avant la première extension)
   */
  private extractIdFromFilename(filename: string): string | null {
    const match = filename.match(/^([^.]+)/)
    return match ? match[1] : null
  }
}
