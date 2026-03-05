
import { ProviderRateLimiter } from './provider-rate-limiter';

/**
 * Managed queue for asynchronous tasks with concurrency limits and retries.
 * Network-aware with exponential backoff and provider-specific rate limits.
 */
export class TaskQueue {
    private queue: Array<{
        task: () => Promise<any>,
        providerId?: string,
        resolve: (val: any) => void,
        reject: (err: any) => void,
        taskName: string
    }> = [];
    private activeCount = 0;
    private readonly maxConcurrency: number;
    private readonly maxRetries: number;
    private readonly initialDelayMs: number;
    private readonly minIntervalMs: number;
    private lastTaskTime: number = 0;

    private providerLimiters: Map<string, ProviderRateLimiter> = new Map();

    constructor(options: {
        maxConcurrency?: number;
        maxRetries?: number;
        initialDelayMs?: number;
        minIntervalMs?: number;
        providerConfigs?: Record<string, { maxConcurrent?: number, failureThreshold?: number, resetTimeoutMs?: number }>
    } = {}) {
        this.maxConcurrency = options.maxConcurrency !== undefined ? options.maxConcurrency : 5;
        this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
        this.initialDelayMs = options.initialDelayMs !== undefined ? options.initialDelayMs : 2000;
        this.minIntervalMs = options.minIntervalMs !== undefined ? options.minIntervalMs : 0;

        // Initialize default limiters if provided
        if (options.providerConfigs) {
            for (const [id, config] of Object.entries(options.providerConfigs)) {
                this.providerLimiters.set(id, new ProviderRateLimiter(config));
            }
        }
    }

    /**
     * Get or create a rate limiter for a provider
     */
    private getLimiter(providerId: string): ProviderRateLimiter {
        if (!this.providerLimiters.has(providerId)) {
            this.providerLimiters.set(providerId, new ProviderRateLimiter());
        }
        return this.providerLimiters.get(providerId)!;
    }

    /**
     * Check if error is a network-related error
     */
    private isNetworkError(error: any): boolean {
        const message = error?.message || '';
        const code = error?.code || '';
        return (
            code === 'ETIMEDOUT' ||
            code === 'ECONNREFUSED' ||
            code === 'ENETUNREACH' ||
            code === 'EHOSTUNREACH' ||
            code === '429' ||
            message.includes('timeout') ||
            message.includes('ECONNRESET') ||
            message.includes('connect') ||
            message.includes('rate limit') ||
            message.includes('Too Many Requests')
        );
    }

    /**
     * Adds a task to the queue and returns a promise that resolves when the task (or its retries) completes.
     */
    async add<T>(taskFn: () => Promise<T>, taskName: string = 'Unnamed Task', providerId?: string): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({
                task: taskFn,
                providerId,
                resolve,
                reject,
                taskName
            });
            this.processNext();
        });
    }

    private async executeTask(item: typeof TaskQueue.prototype.queue[0]) {
        const { task, providerId, resolve, reject, taskName } = item;
        const limiter = providerId ? this.getLimiter(providerId) : null;

        const executeWithRetry = async (attempt: number = 0) => {
            try {
                if (limiter && !limiter.canAccept()) {
                    // This shouldn't happen if processNext works correctly, 
                    // but safety first. Re-queue.
                    this.queue.unshift(item);
                    return;
                }

                if (limiter) limiter.startJob();
                this.activeCount++;

                console.log(`[Queue] Starting ${taskName}${providerId ? ` [${providerId}]` : ''} (Attempt ${attempt + 1}/${this.maxRetries + 1})`);
                const result = await task();

                // Specific check for image generation: if result is empty string, it's a failure
                if (typeof result === 'string' && result === '') {
                    throw new Error(`Task ${taskName} returned empty result`);
                }

                if (limiter) limiter.endJob(true);
                resolve(result);
            } catch (error) {
                if (limiter) limiter.endJob(false);

                const isNetError = this.isNetworkError(error);
                const errorType = isNetError ? '[Network/Rate Error]' : '[Error]';
                const shouldRetry = attempt < this.maxRetries;

                if (shouldRetry) {
                    // Exponential backoff with jitter: (2^attempt * initial) + random(0, 1s)
                    const jitter = Math.random() * 1000;
                    const delay = (this.initialDelayMs * Math.pow(2, attempt)) + jitter;

                    console.warn(`[Queue] ${errorType} Task ${taskName} failed: ${error instanceof Error ? error.message : 'Unknown error'}. Retrying in ${(delay / 1000).toFixed(1)}s... (attempt ${attempt + 1}/${this.maxRetries})`);

                    setTimeout(() => executeWithRetry(attempt + 1), delay);
                } else {
                    console.error(`[Queue] ${errorType} Task ${taskName} failed definitively after ${this.maxRetries + 1} attempts.`);
                    reject(error);
                }
            } finally {
                this.activeCount--;
                this.processNext();
            }
        };

        executeWithRetry();
    }

    /**
     * Processes next items in the queue if capacity is available.
     */
    private processNext() {
        if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
            return;
        }

        const now = Date.now();
        const timeSinceLast = now - this.lastTaskTime;

        if (timeSinceLast < this.minIntervalMs) {
            const delay = this.minIntervalMs - timeSinceLast;
            setTimeout(() => this.processNext(), delay);
            return;
        }

        // Find the first task whose provider is ready
        let taskIndex = -1;
        for (let i = 0; i < this.queue.length; i++) {
            const item = this.queue[i];
            if (!item.providerId) {
                taskIndex = i;
                break;
            }
            const limiter = this.getLimiter(item.providerId);
            if (limiter.canAccept()) {
                taskIndex = i;
                break;
            }
        }

        if (taskIndex !== -1) {
            const [item] = this.queue.splice(taskIndex, 1);
            this.lastTaskTime = Date.now();
            this.executeTask(item);
        }
    }

    /**
     * Waits for all currently queued tasks to complete.
     */
    async onIdle(): Promise<void> {
        return new Promise((resolve) => {
            const check = () => {
                if (this.activeCount === 0 && this.queue.length === 0) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    /**
     * Get snapshot of current queue state
     */
    getStats() {
        const providerStats: Record<string, any> = {};
        this.providerLimiters.forEach((limiter, id) => {
            providerStats[id] = limiter.getStats();
        });

        return {
            queuedTasks: this.queue.length,
            activeCount: this.activeCount,
            providers: providerStats
        };
    }
}
