import { readFileSync, statSync } from 'node:fs'
import process from 'node:process'
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
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

export const BUCKET = process.env.MINIO_BUCKET || 'sketch-videos'
export const CDN_URL = process.env.CDN_URL || 'http://localhost:9000/sketch-videos'

/**
 * Ensure the bucket exists, create it if it doesn't
 */
export async function ensureBucketExists(): Promise<void> {
  try {
    await storageClient.send(new HeadBucketCommand({ Bucket: BUCKET }))
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.info(`[Storage] Bucket '${BUCKET}' not found, creating...`)
      try {
        await storageClient.send(new CreateBucketCommand({ Bucket: BUCKET }))
      } catch (createError: any) {
        console.error(`[Storage] Failed to create bucket '${BUCKET}':`, createError.message)
      }
    } else {
      console.error(`[Storage] Error checking bucket '${BUCKET}':`, error.message)
    }
  }
}

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
  await ensureBucketExists()
  const stats = statSync(filePath)
  await storageClient.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: readFileSync(filePath),
      ContentType: contentType,
      ContentLength: stats.size,
      Metadata: { videoId }
    })
  )
  return `${CDN_URL}/${key}`
}

/**
 * Upload any file to MinIO
 */
export async function uploadFile(
  videoId: string,
  filePath: string,
  key: string,
  contentType = 'application/octet-stream'
): Promise<string> {
  await ensureBucketExists()
  const stats = statSync(filePath)
  await storageClient.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: readFileSync(filePath),
      ContentType: contentType,
      ContentLength: stats.size,
      Metadata: { videoId }
    })
  )
  return `${CDN_URL}/${key}`
}

/**
 * Upload a file buffer to MinIO
 */
export async function uploadBuffer(key: string, body: Buffer, contentType: string): Promise<string> {
  await ensureBucketExists()
  await storageClient.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.length
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
