
/**
 * State of the circuit breaker for a provider
 */
enum CircuitState {
    CLOSED,     // Everything is fine
    OPEN,       // Provider is failing, rejecting requests
    HALF_OPEN   // Testing if provider is recovered
}

/**
 * Manages rate limits and stability for a specific provider
 */
export class ProviderRateLimiter {
    private activeJobs = 0;
    private failureCount = 0;
    private lastFailureTime = 0;
    private state = CircuitState.CLOSED;

    private readonly maxConcurrent: number;
    private readonly failureThreshold: number;
    private readonly resetTimeoutMs: number;

    constructor(options: {
        maxConcurrent?: number;
        failureThreshold?: number;
        resetTimeoutMs?: number;
    } = {}) {
        this.maxConcurrent = options.maxConcurrent || 3;
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeoutMs = options.resetTimeoutMs || 30000; // 30s default
    }

    /**
     * Checks if the provider can accept a new job
     */
    canAccept(): boolean {
        this.updateState();

        if (this.state === CircuitState.OPEN) return false;
        if (this.activeJobs >= this.maxConcurrent) return false;

        return true;
    }

    /**
     * Records the start of a job
     */
    startJob() {
        this.activeJobs++;
    }

    /**
     * Records the end of a job (success or failure)
     */
    endJob(success: boolean) {
        this.activeJobs = Math.max(0, this.activeJobs - 1);

        if (success) {
            this.recordSuccess();
        } else {
            this.recordFailure();
        }
    }

    private recordSuccess() {
        if (this.state === CircuitState.HALF_OPEN) {
            console.log(`[RateLimiter] Provider recovered. Closing circuit.`);
            this.state = CircuitState.CLOSED;
            this.failureCount = 0;
        }
        // In CLOSED state, successes slowly decrease failure count to recover from sporadic errors
        if (this.state === CircuitState.CLOSED && this.failureCount > 0) {
            this.failureCount--;
        }
    }

    private recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.failureCount >= this.failureThreshold) {
            console.warn(`[RateLimiter] Provider failure threshold reached (${this.failureCount}). Opening circuit.`);
            this.state = CircuitState.OPEN;
        }
    }

    private updateState() {
        if (this.state === CircuitState.OPEN) {
            const now = Date.now();
            if (now - this.lastFailureTime > this.resetTimeoutMs) {
                console.log(`[RateLimiter] Timeout reached. Moving to HALF_OPEN state.`);
                this.state = CircuitState.HALF_OPEN;
            }
        }
    }

    getStats() {
        return {
            activeJobs: this.activeJobs,
            state: CircuitState[this.state],
            failureCount: this.failureCount
        };
    }
}
