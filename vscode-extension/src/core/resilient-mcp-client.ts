import { CircuitBreaker, CircuitState } from './circuit-breaker';
import { RateLimiter } from './rate-limiter';
import { AgentEventBus } from './event-bus';
import { MCPClient } from '../mcp/client';

export interface ResilientMCPConfig {
    failureThreshold?: number;
    resetTimeout?: number;
    maxRequestsPerMinute?: number;
    maxQueueSize?: number;
}

export class ResilientMCPClient {
    private circuitBreaker: CircuitBreaker;
    private rateLimiter: RateLimiter;
    private eventBus: AgentEventBus;
    private mcpClient: MCPClient;

    constructor(
        mcpClient: MCPClient,
        config: ResilientMCPConfig = {}
    ) {
        this.mcpClient = mcpClient;
        this.eventBus = AgentEventBus.getInstance();

        this.circuitBreaker = new CircuitBreaker({
            failureThreshold: config.failureThreshold || 5,
            resetTimeout: config.resetTimeout || 60000,
            halfOpenRequests: 3
        });

        this.rateLimiter = new RateLimiter({
            maxRequests: config.maxRequestsPerMinute || 60,
            windowMs: 60000,
            maxQueueSize: config.maxQueueSize || 100
        });
    }

    async sendMessage(
        message: string,
        agent: string,
        conversationId?: string
    ): Promise<any> {
        return this.rateLimiter.execute(async () => {
            return this.circuitBreaker.execute(
                async () => {
                    // Emit event before sending
                    this.eventBus.emit({
                        from: agent,
                        to: 'mcp-server',
                        type: 'request',
                        content: message,
                        timestamp: Date.now(),
                        conversationId
                    });

                    const result = await this.mcpClient.sendMessage(message);

                    // Emit success event
                    this.eventBus.emit({
                        from: 'mcp-server',
                        to: agent,
                        type: 'response',
                        content: result,
                        timestamp: Date.now(),
                        conversationId
                    });

                    return result;
                },
                // Fallback to Mattermost
                async () => {
                    this.eventBus.emit({
                        from: agent,
                        to: 'fallback',
                        type: 'error',
                        content: {
                            message: 'MCP unavailable, using fallback',
                            circuitState: this.circuitBreaker.getState()
                        },
                        timestamp: Date.now(),
                        conversationId
                    });

                    // Return fallback response
                    return {
                        type: 'fallback',
                        message: 'MCP server unavailable, using Mattermost fallback'
                    };
                }
            );
        });
    }

    getHealth(): {
        circuitState: CircuitState;
        queueSize: number;
        isConnected: boolean;
    } {
        return {
            circuitState: this.circuitBreaker.getState(),
            queueSize: this.rateLimiter.getQueueSize(),
            isConnected: this.mcpClient.isConnected()
        };
    }

    reset(): void {
        this.circuitBreaker.reset();
        this.rateLimiter.clear();
    }

    dispose(): void {
        this.mcpClient.disconnect();
        this.rateLimiter.clear();
    }
}