export interface RateLimiterConfig {
    maxRequests: number;
    windowMs: number;
    maxQueueSize?: number;
}

export interface QueuedRequest<T> {
    execute: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    timestamp: number;
}

export class RateLimiter {
    private requests: number[] = [];
    private queue: QueuedRequest<any>[] = [];
    private processing = false;

    constructor(private config: RateLimiterConfig) {}

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            const request: QueuedRequest<T> = {
                execute: fn,
                resolve,
                reject,
                timestamp: Date.now()
            };

            if (this.canExecuteNow()) {
                this.executeRequest(request);
            } else {
                if (this.config.maxQueueSize && this.queue.length >= this.config.maxQueueSize) {
                    reject(new Error('Rate limit queue full'));
                } else {
                    this.queue.push(request);
                    this.processQueue();
                }
            }
        });
    }

    private canExecuteNow(): boolean {
        this.cleanOldRequests();
        return this.requests.length < this.config.maxRequests;
    }

    private cleanOldRequests(): void {
        const now = Date.now();
        this.requests = this.requests.filter(
            timestamp => now - timestamp < this.config.windowMs
        );
    }

    private async executeRequest<T>(request: QueuedRequest<T>): Promise<void> {
        this.requests.push(Date.now());
        try {
            const result = await request.execute();
            request.resolve(result);
        } catch (error) {
            request.reject(error as Error);
        }
    }

    private async processQueue(): Promise<void> {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            if (this.canExecuteNow()) {
                const request = this.queue.shift()!;
                await this.executeRequest(request);
            } else {
                // Wait for rate limit window
                await this.waitForNextWindow();
            }
        }

        this.processing = false;
    }

    private waitForNextWindow(): Promise<void> {
        const oldestRequest = Math.min(...this.requests);
        const waitTime = Math.max(
            100,
            this.config.windowMs - (Date.now() - oldestRequest)
        );
        return new Promise(resolve => setTimeout(resolve, waitTime));
    }

    getQueueSize(): number {
        return this.queue.length;
    }

    clear(): void {
        this.queue.forEach(request => {
            request.reject(new Error('Rate limiter cleared'));
        });
        this.queue = [];
        this.requests = [];
        this.processing = false;
    }
}