export interface CircuitBreakerConfig {
    failureThreshold: number;
    resetTimeout: number;
    halfOpenRequests: number;
}

export enum CircuitState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    HALF_OPEN = 'HALF_OPEN'
}

export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount = 0;
    private successCount = 0;
    private lastFailureTime?: number;
    private halfOpenRequestCount = 0;

    constructor(private config: CircuitBreakerConfig) {}

    async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
        if (this.state === CircuitState.OPEN) {
            if (this.shouldTryHalfOpen()) {
                this.state = CircuitState.HALF_OPEN;
                this.halfOpenRequestCount = 0;
            } else if (fallback) {
                return fallback();
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }

        if (this.state === CircuitState.HALF_OPEN) {
            if (this.halfOpenRequestCount >= this.config.halfOpenRequests) {
                if (fallback) {
                    return fallback();
                }
                throw new Error('Circuit breaker is testing recovery');
            }
            this.halfOpenRequestCount++;
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            if (fallback) {
                return fallback();
            }
            throw error;
        }
    }

    private shouldTryHalfOpen(): boolean {
        if (!this.lastFailureTime) {
            return false;
        }
        return Date.now() - this.lastFailureTime > this.config.resetTimeout;
    }

    private onSuccess(): void {
        this.failureCount = 0;
        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.config.halfOpenRequests) {
                this.state = CircuitState.CLOSED;
                this.successCount = 0;
            }
        }
    }

    private onFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        this.successCount = 0;

        if (this.failureCount >= this.config.failureThreshold) {
            this.state = CircuitState.OPEN;
        }
    }

    getState(): CircuitState {
        return this.state;
    }

    reset(): void {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = undefined;
        this.halfOpenRequestCount = 0;
    }
}