/**
 * VideoJobLock
 * ---------------------------------------------------------------------------
 * In-process mutex that prevents two BullMQ jobs from processing the same
 * videoId concurrently.
 *
 * Problem reproduced from logs:
 *   Job 5788d2c6 (active)  → completes → 🧹 deletes project dir
 *   Job 265fdf68 (stalled→resumed, same videoId) → Whisper JSON not found
 *   because job A already cleaned up the shared project directory.
 *
 * Solution:
 *   1. Before processing, check whether another job already holds the lock
 *      for this videoId.
 *   2. If locked → delay the incoming job and return early (BullMQ will
 *      re-queue it after the delay).
 *   3. If free  → acquire lock, run the job, release in finally.
 *   4. Cleanup is guarded: only executes when no lock is held for the videoId.
 */

export class VideoJobLock {
  /**
   * Map of videoId → jobId currently processing it.
   * Module-level singleton — shared across all Worker callback invocations
   * within the same Node.js process.
   */
  private static readonly held = new Map<string, string>()

  /**
   * Attempt to acquire the lock for `videoId` on behalf of `jobId`.
   *
   * @returns `true`  — lock acquired, caller may proceed.
   *          `false` — another job already holds the lock, caller must defer.
   */
  static acquire(videoId: string, jobId: string): boolean {
    const existing = VideoJobLock.held.get(videoId)

    if (existing && existing !== jobId) {
      console.warn(`[VideoJobLock] Job ${jobId} deferred — videoId ${videoId} already locked by job ${existing}`)
      return false
    }

    VideoJobLock.held.set(videoId, jobId)
    return true
  }

  /**
   * Release the lock for `videoId`, but only if `jobId` is the current holder.
   * Silently ignores attempts to release a lock held by a different job.
   */
  static release(videoId: string, jobId: string): void {
    if (VideoJobLock.held.get(videoId) === jobId) {
      VideoJobLock.held.delete(videoId)
      console.log(`[VideoJobLock] Lock released for videoId ${videoId} (job ${jobId})`)
    }
  }

  /**
   * Returns true when NO lock is currently held for `videoId`.
   * Use this before cleanup to avoid deleting files still in use.
   */
  static isFree(videoId: string): boolean {
    return !VideoJobLock.held.has(videoId)
  }

  /** Diagnostic helper — returns the jobId currently holding the lock, or undefined. */
  static holder(videoId: string): string | undefined {
    return VideoJobLock.held.get(videoId)
  }
}
