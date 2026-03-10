import { createReadStream } from 'node:fs'
import process from 'node:process'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { Buffer } from 'node:buffer'

export const storageClient = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
  },
  forcePathStyle: true
})

export const BUCKET = process.env.MINIO_BUCKET || 'stickman-videos'
export const CDN_URL = process.env.CDN_URL || 'http://localhost:9000/stickman-videos'

/**
 * Generate a signed download URL for a video (expires in 1 hour)
 */
export async function getSignedDownloadUrl(videoId: string, key?: string): Promise<string> {
  const objectKey = key || `videos/${videoId}/final.mp4`
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: objectKey
  })
  return await getSignedUrl(storageClient, command, { expiresIn: 3600 })
}

/**
 * Upload a video file to MinIO
 */
export async function uploadVideoToMinio(
  videoId: string,
  filePath: string,
  contentType = 'video/mp4'
): Promise<string> {
  const key = `videos/${videoId}/final.mp4`
  await storageClient.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: contentType,
      Metadata: { videoId }
    })
  )
  return `${CDN_URL}/${key}`
}

/**
 * Upload a file buffer to MinIO
 */
export async function uploadBuffer(key: string, body: Buffer, contentType: string): Promise<string> {
  await storageClient.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  )
  return `${CDN_URL}/${key}`
}

/**
 * List all assets for a video
 */
export async function listVideoAssets(
  videoId: string
): Promise<Array<{ key: string; size?: number; lastModified?: Date }>> {
  const prefix = `videos/${videoId}/`
  const result = await storageClient.send(
    new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix
    })
  )
  return (result.Contents || []).map((obj) => ({
    key: obj.Key!,
    size: obj.Size,
    lastModified: obj.LastModified
  }))
}

/**
 * Delete all assets for a video
 */
export async function deleteVideoAssets(videoId: string): Promise<void> {
  const prefix = `videos/${videoId}/`
  const listed = await storageClient.send(
    new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix
    })
  )
  if (!listed.Contents?.length) return
  await storageClient.send(
    new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: {
        Objects: listed.Contents.map((obj) => ({ Key: obj.Key! }))
      }
    })
  )
}
