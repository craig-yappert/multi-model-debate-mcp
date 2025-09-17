import * as assert from 'assert';
import * as vscode from 'vscode';
import { CircuitBreaker, CircuitState } from '../core/circuit-breaker';
import { RateLimiter } from '../core/rate-limiter';
import { AgentEventBus } from '../core/event-bus';

suite('Resilience Pattern Tests', () => {

    test('Circuit Breaker should open after failure threshold', async () => {
        const breaker = new CircuitBreaker({
            failureThreshold: 3,
            resetTimeout: 1000,
            halfOpenRequests: 1
        });

        let failureCount = 0;
        const failingOperation = async () => {
            failureCount++;
            throw new Error('Operation failed');
        };

        // First 3 failures should be allowed
        for (let i = 0; i < 3; i++) {
            try {
                await breaker.execute(failingOperation);
            } catch (e) {
                // Expected
            }
        }

        assert.strictEqual(failureCount, 3);
        assert.strictEqual(breaker.getState(), CircuitState.OPEN);

        // Next attempt should use fallback without executing operation
        const result = await breaker.execute(
            failingOperation,
            async () => 'fallback'
        );

        assert.strictEqual(result, 'fallback');
        assert.strictEqual(failureCount, 3); // Operation not called
    });

    test('Rate Limiter should queue requests when limit exceeded', async () => {
        const limiter = new RateLimiter({
            maxRequests: 2,
            windowMs: 100,
            maxQueueSize: 5
        });

        const results: number[] = [];
        const operation = (n: number) => async () => {
            results.push(n);
            return n;
        };

        // Fire 5 requests rapidly
        const promises = [
            limiter.execute(operation(1)),
            limiter.execute(operation(2)),
            limiter.execute(operation(3)),
            limiter.execute(operation(4)),
            limiter.execute(operation(5))
        ];

        // First 2 should execute immediately
        await new Promise(resolve => setTimeout(resolve, 10));
        assert.strictEqual(results.length, 2);

        // Rest should execute after window
        await Promise.all(promises);
        assert.strictEqual(results.length, 5);
    });

    test('Event Bus should deliver messages to subscribers', async () => {
        const bus = AgentEventBus.getInstance();
        const received: any[] = [];

        // Subscribe to agent messages
        bus.subscribe('test-agent', (message) => {
            received.push(message);
        });

        // Send message to agent
        bus.emit({
            from: 'sender',
            to: 'test-agent',
            type: 'request',
            content: 'test message',
            timestamp: Date.now()
        });

        // Allow async processing
        await new Promise(resolve => setTimeout(resolve, 10));

        assert.strictEqual(received.length, 1);
        assert.strictEqual(received[0].content, 'test message');
    });

    test('Event Bus should handle broadcast messages', async () => {
        const bus = AgentEventBus.getInstance();
        const agent1Received: any[] = [];
        const agent2Received: any[] = [];

        bus.subscribe('agent1', (msg) => agent1Received.push(msg));
        bus.subscribe('agent2', (msg) => agent2Received.push(msg));

        // Broadcast to multiple agents
        bus.broadcast({
            from: 'coordinator',
            to: ['agent1', 'agent2'],
            type: 'broadcast',
            content: 'broadcast message',
            timestamp: Date.now()
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        assert.strictEqual(agent1Received.length, 1);
        assert.strictEqual(agent2Received.length, 1);
        assert.strictEqual(agent1Received[0].content, 'broadcast message');
        assert.strictEqual(agent2Received[0].content, 'broadcast message');
    });

    test('Circuit Breaker should transition to half-open after timeout', async () => {
        const breaker = new CircuitBreaker({
            failureThreshold: 1,
            resetTimeout: 100,
            halfOpenRequests: 2
        });

        // Trigger open state
        try {
            await breaker.execute(async () => {
                throw new Error('fail');
            });
        } catch (e) {
            // Expected
        }

        assert.strictEqual(breaker.getState(), CircuitState.OPEN);

        // Wait for reset timeout
        await new Promise(resolve => setTimeout(resolve, 150));

        // Should be half-open now
        assert.strictEqual(breaker.getState(), CircuitState.HALF_OPEN);

        // Successful request should close circuit
        const result = await breaker.execute(async () => 'success');
        assert.strictEqual(result, 'success');
        assert.strictEqual(breaker.getState(), CircuitState.CLOSED);
    });

    test('Rate Limiter should reject when queue is full', async () => {
        const limiter = new RateLimiter({
            maxRequests: 1,
            windowMs: 1000,
            maxQueueSize: 2
        });

        // Fill up the rate limit and queue
        const promises = [
            limiter.execute(async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return 1;
            }),
            limiter.execute(async () => 2),
            limiter.execute(async () => 3)
        ];

        // Fourth request should be rejected
        try {
            await limiter.execute(async () => 4);
            assert.fail('Should have rejected');
        } catch (error: any) {
            assert(error.message.includes('Queue is full'));
        }

        // Clean up
        await Promise.all(promises);
    });

    test('Integration: Resilient system handles cascading failures', async () => {
        const bus = AgentEventBus.getInstance();
        const breaker = new CircuitBreaker({
            failureThreshold: 2,
            resetTimeout: 100
        });
        const limiter = new RateLimiter({
            maxRequests: 5,
            windowMs: 100
        });

        let operationCalls = 0;
        let fallbackCalls = 0;

        const operation = async () => {
            operationCalls++;
            if (operationCalls <= 2) {
                throw new Error('Service unavailable');
            }
            return 'success';
        };

        const fallback = async () => {
            fallbackCalls++;
            return 'fallback';
        };

        // Simulate multiple agent requests
        const results: any[] = [];
        for (let i = 0; i < 5; i++) {
            try {
                const result = await limiter.execute(async () => {
                    return await breaker.execute(operation, fallback);
                });
                results.push(result);
            } catch (error) {
                results.push('error');
            }
        }

        // First 2 should fail and open circuit
        assert.strictEqual(operationCalls, 2);
        assert(fallbackCalls > 0);
        assert(results.includes('fallback'));
    });
});