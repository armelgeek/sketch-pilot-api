import process from 'node:process'

import { Queue, QueueEvents } from 'bullmq'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

function getRedisConnectionOptions() {
  try {
    // Handle cases where REDIS_URL might be just 'localhost' or 'localhost:6379'
    const normalizedUrl = redisUrl.includes('://') ? redisUrl : `redis://${redisUrl}`
    const url = new URL(normalizedUrl)
    return {
      host: url.hostname || 'localhost',
      port: Number.parseInt(url.port) || 6379,
      password: url.password || undefined,
      maxRetriesPerRequest: null as null,
      enableReadyCheck: false,
      lazyConnect: true
    }
  } catch (error) {
    console.warn(
      `[QueueConfig] Failed to parse REDIS_URL "${redisUrl}": ${error instanceof Error ? error.message : String(error)}. Using default connection.`
    )
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null as null,
      enableReadyCheck: false,
      lazyConnect: true
    }
  }
}

export const redisConnectionOptions = getRedisConnectionOptions()

export const VIDEO_QUEUE_NAME = 'video-generation'

let videoQueue: Queue | null = null
let videoQueueEvents: QueueEvents | null = null

export function getVideoQueue(): Queue {
  if (!videoQueue) {
    videoQueue = new Queue(VIDEO_QUEUE_NAME, {
      connection: redisConnectionOptions
    })
  }
  return videoQueue
}

export function getVideoQueueEvents(): QueueEvents {
  if (!videoQueueEvents) {
    videoQueueEvents = new QueueEvents(VIDEO_QUEUE_NAME, {
      connection: redisConnectionOptions
    })
  }
  return videoQueueEvents
}

export interface VideoJobData {
  jobId: string
  userId: string
  videoId: string
  topic: string
  options: {
    duration?: number
    sceneCount?: number
    style?: string
    videoType?: string
    videoGenre?: string
    language?: string
    voiceProvider?: string
    voiceId?: string
    animationProvider?: string
    llmProvider?: string
    imageProvider?: string
    qualityMode?: string
    textOverlay?: { enabled: boolean; position: string }
    characterConsistency?: boolean
    autoTransitions?: boolean
    generateFromScript?: boolean
    generateOnlyScenes?: boolean
    skipAudio?: boolean
    repromptSceneIndex?: number
    customSpec?: any
  }
}
