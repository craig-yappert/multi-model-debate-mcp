import { AgentEventBus, AgentMessage } from './event-bus';
import { ResilientMCPClient } from './resilient-mcp-client';
import * as vscode from 'vscode';

export interface AgentConfig {
    name: string;
    role: string;
    capabilities: string[];
    priority: number;
}

export interface OrchestrationStrategy {
    type: 'sequential' | 'parallel' | 'consensus' | 'delegation';
    timeout?: number;
}

export class AgentOrchestrator {
    private static instance: AgentOrchestrator;
    private eventBus: AgentEventBus;
    private agents: Map<string, AgentConfig> = new Map();
    private activeConversations: Map<string, Set<string>> = new Map();

    private constructor(
        private mcpClient: ResilientMCPClient,
        private outputChannel: vscode.OutputChannel
    ) {
        this.eventBus = AgentEventBus.getInstance();
        this.initializeEventHandlers();
    }

    static initialize(
        mcpClient: ResilientMCPClient,
        outputChannel: vscode.OutputChannel
    ): AgentOrchestrator {
        if (!AgentOrchestrator.instance) {
            AgentOrchestrator.instance = new AgentOrchestrator(mcpClient, outputChannel);
        }
        return AgentOrchestrator.instance;
    }

    static getInstance(): AgentOrchestrator {
        if (!AgentOrchestrator.instance) {
            throw new Error('AgentOrchestrator not initialized');
        }
        return AgentOrchestrator.instance;
    }

    registerAgent(config: AgentConfig): void {
        this.agents.set(config.name, config);
        this.eventBus.subscribe(config.name, (msg) => this.handleAgentMessage(config.name, msg));

        // Notify other agents
        this.eventBus.broadcast(config.name, {
            type: 'agent.registered',
            agent: config
        });
    }

    async orchestrate(
        task: string,
        strategy: OrchestrationStrategy,
        conversationId: string
    ): Promise<any> {
        const involvedAgents = this.selectAgentsForTask(task);
        this.activeConversations.set(conversationId, new Set(involvedAgents));

        switch (strategy.type) {
            case 'sequential':
                return this.orchestrateSequential(task, involvedAgents, conversationId);
            case 'parallel':
                return this.orchestrateParallel(task, involvedAgents, conversationId);
            case 'consensus':
                return this.orchestrateConsensus(task, involvedAgents, conversationId);
            case 'delegation':
                return this.orchestrateDelegation(task, involvedAgents, conversationId);
            default:
                throw new Error(`Unknown orchestration strategy: ${strategy.type}`);
        }
    }

    private async orchestrateSequential(
        task: string,
        agents: string[],
        conversationId: string
    ): Promise<any> {
        let result = task;

        for (const agent of agents) {
            this.outputChannel.appendLine(`[Orchestrator] Passing to ${agent}: ${result.substring(0, 100)}...`);

            result = await this.mcpClient.sendMessage(
                result,
                agent,
                conversationId
            );

            // Allow other agents to observe
            this.eventBus.emit({
                from: agent,
                to: agents.filter(a => a !== agent),
                type: 'response',
                content: result,
                timestamp: Date.now(),
                conversationId
            });
        }

        return result;
    }

    private async orchestrateParallel(
        task: string,
        agents: string[],
        conversationId: string
    ): Promise<any[]> {
        const promises = agents.map(agent =>
            this.mcpClient.sendMessage(task, agent, conversationId)
        );

        const results = await Promise.allSettled(promises);

        // Broadcast all results
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                this.eventBus.broadcast(agents[index], {
                    type: 'parallel.result',
                    content: result.value
                }, conversationId);
            }
        });

        return results.map(r => r.status === 'fulfilled' ? r.value : null);
    }

    private async orchestrateConsensus(
        task: string,
        agents: string[],
        conversationId: string
    ): Promise<any> {
        // Get responses from all agents
        const responses = await this.orchestrateParallel(task, agents, conversationId);

        // Simple voting mechanism - could be enhanced
        const consensusRequest = {
            type: 'consensus',
            task,
            responses,
            agents
        };

        // Ask coordinator to determine consensus
        return this.mcpClient.sendMessage(
            JSON.stringify(consensusRequest),
            '@coordinator',
            conversationId
        );
    }

    private async orchestrateDelegation(
        task: string,
        agents: string[],
        conversationId: string
    ): Promise<any> {
        // Coordinator decides which agent handles what
        const delegationPlan = await this.mcpClient.sendMessage(
            `Plan delegation for: ${task}`,
            '@coordinator',
            conversationId
        );

        // Execute delegation plan
        return this.executeDelegationPlan(delegationPlan, conversationId);
    }

    private selectAgentsForTask(task: string): string[] {
        // Simple capability matching - could use NLP
        const keywords = task.toLowerCase().split(' ');
        const selectedAgents: string[] = [];

        this.agents.forEach((config, name) => {
            const matches = config.capabilities.some(cap =>
                keywords.some(keyword => cap.toLowerCase().includes(keyword))
            );
            if (matches) {
                selectedAgents.push(name);
            }
        });

        // Default to core team if no specific matches
        if (selectedAgents.length === 0) {
            selectedAgents.push('@architect', '@coder', '@reviewer');
        }

        return selectedAgents.sort((a, b) => {
            const priorityA = this.agents.get(a)?.priority || 999;
            const priorityB = this.agents.get(b)?.priority || 999;
            return priorityA - priorityB;
        });
    }

    private async executeDelegationPlan(plan: any, conversationId: string): Promise<any> {
        // Implementation would parse and execute the delegation plan
        return plan;
    }

    private handleAgentMessage(agent: string, message: AgentMessage): void {
        this.outputChannel.appendLine(
            `[${agent}] ${message.type}: ${JSON.stringify(message.content).substring(0, 200)}...`
        );
    }

    private initializeEventHandlers(): void {
        this.eventBus.onAgentEvent((event) => {
            this.outputChannel.appendLine(`[Event] ${event.type} from ${event.agent}`);
        });
    }

    getActiveConversations(): Map<string, Set<string>> {
        return this.activeConversations;
    }

    getAgentHealth(): Map<string, any> {
        const health = new Map();
        this.agents.forEach((config, name) => {
            health.set(name, {
                registered: true,
                config
            });
        });
        return health;
    }

    dispose(): void {
        this.eventBus.dispose();
        this.agents.clear();
        this.activeConversations.clear();
    }
}