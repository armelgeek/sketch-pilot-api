import { Queue } from 'bullmq'
import { redisConnectionOptions } from './queue.config'

export const EMAIL_QUEUE_NAME = 'email-notifications'

export interface EmailJobData {
  template: string
  userId: string
  userEmail: string
  userName: string
  data?: Record<string, unknown>
}

let emailQueue: Queue | null = null

export function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue(EMAIL_QUEUE_NAME, {
      connection: redisConnectionOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200
      }
    })
  }
  return emailQueue
}
