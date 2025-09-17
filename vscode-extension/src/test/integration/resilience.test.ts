import { EventBus } from '../../core/event-bus';
import { CircuitBreaker } from '../../core/circuit-breaker';
import { RateLimiter } from '../../core/rate-limiter';
import { ResilientMCPClient } from '../../core/resilient-mcp-client';
import { AgentOrchestrator } from '../../core/agent-orchestrator';

describe('Resilience Patterns Integration', () => {
    let eventBus: EventBus;
    let circuitBreaker: CircuitBreaker;
    let rateLimiter: RateLimiter;
    let orchestrator: AgentOrchestrator;

    beforeEach(() => {
        eventBus = EventBus.getInstance();
        eventBus.clear();
        circuitBreaker = new CircuitBreaker(3, 1000, 5000);
        rateLimiter = new RateLimiter(5, 1000);
        orchestrator = new AgentOrchestrator();
    });

    describe('EventBus Integration', () => {
        it('should handle agent communication', async () => {
            const messages: any[] = [];

            eventBus.on('agent:message', (data) => {
                messages.push(data);
            });

            eventBus.emit('agent:message', {
                from: '@architect',
                to: '@coder',
                message: 'Implement event bus'
            });

            expect(messages).toHaveLength(1);
            expect(messages[0].from).toBe('@architect');
        });

        it('should queue messages for late subscribers', async () => {
            eventBus.emit('task:complete', { task: 'build' });

            const received: any[] = [];
            eventBus.on('task:complete', (data) => {
                received.push(data);
            });

            expect(received).toHaveLength(1);
        });
    });

    describe('CircuitBreaker Integration', () => {
        it('should protect against cascading failures', async () => {
            let failCount = 0;
            const operation = async () => {
                failCount++;
                if (failCount <= 3) {
                    throw new Error('Service unavailable');
                }
                return 'success';
            };

            // Circuit should open after 3 failures
            for (let i = 0; i < 3; i++) {
                try {
                    await circuitBreaker.call(operation);
                } catch (e) {
                    // Expected failures
                }
            }

            expect(circuitBreaker.getState()).toBe('OPEN');

            // Should reject immediately when open
            await expect(circuitBreaker.call(operation))
                .rejects.toThrow('Circuit breaker is OPEN');
        });

        it('should recover after timeout', async () => {
            jest.useFakeTimers();

            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('fail'))
                .mockRejectedValueOnce(new Error('fail'))
                .mockRejectedValueOnce(new Error('fail'))
                .mockResolvedValue('success');

            // Open the circuit
            for (let i = 0; i < 3; i++) {
                try {
                    await circuitBreaker.call(operation);
                } catch (e) {
                    // Expected
                }
            }

            // Fast-forward past timeout
            jest.advanceTimersByTime(5001);

            // Should transition to HALF_OPEN and try again
            const result = await circuitBreaker.call(operation);
            expect(result).toBe('success');
            expect(circuitBreaker.getState()).toBe('CLOSED');

            jest.useRealTimers();
        });
    });

    describe('RateLimiter Integration', () => {
        it('should enforce request limits', async () => {
            const requests: Promise<void>[] = [];

            // Try to make 10 requests (limit is 5)
            for (let i = 0; i < 10; i++) {
                requests.push(rateLimiter.acquire());
            }

            // First 5 should resolve immediately
            await Promise.race([
                Promise.all(requests.slice(0, 5)),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), 100)
                )
            ]);

            // 6th request should be queued
            let sixthResolved = false;
            requests[5].then(() => { sixthResolved = true; });

            await new Promise(resolve => setTimeout(resolve, 50));
            expect(sixthResolved).toBe(false);
        });

        it('should process queue over time', async () => {
            jest.useFakeTimers();

            const acquisitions: number[] = [];

            for (let i = 0; i < 8; i++) {
                rateLimiter.acquire().then(() => {
                    acquisitions.push(i);
                });
            }

            // Process initial batch
            await Promise.resolve();
            expect(acquisitions).toHaveLength(5);

            // Advance time to allow more requests
            jest.advanceTimersByTime(1001);
            await Promise.resolve();

            expect(acquisitions).toHaveLength(8);

            jest.useRealTimers();
        });
    });

    describe('AgentOrchestrator Integration', () => {
        it('should coordinate multi-agent workflows', async () => {
            const workflow = orchestrator.createWorkflow('build-feature');

            workflow.addTask('design', '@architect');
            workflow.addTask('implement', '@coder', ['design']);
            workflow.addTask('review', '@reviewer', ['implement']);
            workflow.addTask('test', '@executor', ['implement']);
            workflow.addTask('document', '@documenter', ['review', 'test']);

            const executionOrder = workflow.getExecutionOrder();

            // Design must come first
            expect(executionOrder[0]).toBe('design');

            // Implementation depends on design
            expect(executionOrder.indexOf('implement'))
                .toBeGreaterThan(executionOrder.indexOf('design'));

            // Review and test depend on implementation
            expect(executionOrder.indexOf('review'))
                .toBeGreaterThan(executionOrder.indexOf('implement'));
            expect(executionOrder.indexOf('test'))
                .toBeGreaterThan(executionOrder.indexOf('implement'));

            // Documentation comes last
            expect(executionOrder[executionOrder.length - 1]).toBe('document');
        });

        it('should handle agent failures gracefully', async () => {
            orchestrator.registerAgent('@coder', {
                execute: jest.fn().mockRejectedValue(new Error('Compilation failed'))
            });

            orchestrator.registerAgent('@reviewer', {
                execute: jest.fn().mockResolvedValue('Review complete')
            });

            const result = await orchestrator.executeTask('implement', '@coder');
            expect(result.status).toBe('failed');
            expect(result.error).toBe('Compilation failed');

            // Should still be able to execute other agents
            const reviewResult = await orchestrator.executeTask('review', '@reviewer');
            expect(reviewResult.status).toBe('completed');
        });
    });

    describe('Full System Integration', () => {
        it('should handle complex multi-agent workflow with resilience', async () => {
            const mockMcpClient = {
                sendMessage: jest.fn()
                    .mockRejectedValueOnce(new Error('Network error'))
                    .mockRejectedValueOnce(new Error('Network error'))
                    .mockResolvedValue({ response: 'Success' })
            };

            const resilientClient = new ResilientMCPClient(mockMcpClient as any);

            // Should retry and eventually succeed
            const result = await resilientClient.sendMessage('test', {});
            expect(result.response).toBe('Success');
            expect(mockMcpClient.sendMessage).toHaveBeenCalledTimes(3);
        });

        it('should coordinate agents with rate limiting', async () => {
            const agentCalls: string[] = [];

            // Register mock agents
            ['@architect', '@coder', '@reviewer'].forEach(agent => {
                orchestrator.registerAgent(agent, {
                    execute: async () => {
                        await rateLimiter.acquire();
                        agentCalls.push(agent);
                        return 'completed';
                    }
                });
            });

            // Execute tasks in parallel
            const tasks = [
                orchestrator.executeTask('design', '@architect'),
                orchestrator.executeTask('code', '@coder'),
                orchestrator.executeTask('review', '@reviewer')
            ];

            await Promise.all(tasks);
            expect(agentCalls).toHaveLength(3);
        });
    });
});