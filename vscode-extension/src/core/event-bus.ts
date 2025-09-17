import { EventEmitter } from 'vscode';

export interface AgentMessage {
    from: string;
    to: string | string[];
    type: 'request' | 'response' | 'broadcast' | 'error';
    content: any;
    timestamp: number;
    conversationId?: string;
}

export interface AgentEvent {
    type: 'agent.message' | 'agent.ready' | 'agent.error' | 'agent.complete';
    agent: string;
    data: any;
}

export class AgentEventBus {
    private static instance: AgentEventBus;
    private emitter: EventEmitter<AgentEvent>;
    private messageQueue: Map<string, AgentMessage[]>;
    private subscribers: Map<string, Set<(message: AgentMessage) => void>>;

    private constructor() {
        this.emitter = new EventEmitter<AgentEvent>();
        this.messageQueue = new Map();
        this.subscribers = new Map();
    }

    static getInstance(): AgentEventBus {
        if (!AgentEventBus.instance) {
            AgentEventBus.instance = new AgentEventBus();
        }
        return AgentEventBus.instance;
    }

    subscribe(agent: string, handler: (message: AgentMessage) => void): void {
        if (!this.subscribers.has(agent)) {
            this.subscribers.set(agent, new Set());
        }
        this.subscribers.get(agent)!.add(handler);

        // Process any queued messages
        const queued = this.messageQueue.get(agent) || [];
        queued.forEach(msg => handler(msg));
        this.messageQueue.delete(agent);
    }

    unsubscribe(agent: string, handler: (message: AgentMessage) => void): void {
        this.subscribers.get(agent)?.delete(handler);
    }

    emit(message: AgentMessage): void {
        const targets = Array.isArray(message.to) ? message.to : [message.to];

        targets.forEach(target => {
            const handlers = this.subscribers.get(target);
            if (handlers && handlers.size > 0) {
                handlers.forEach(handler => handler(message));
            } else {
                // Queue message if no subscriber yet
                if (!this.messageQueue.has(target)) {
                    this.messageQueue.set(target, []);
                }
                this.messageQueue.get(target)!.push(message);
            }
        });

        // Emit generic event
        this.emitter.fire({
            type: 'agent.message',
            agent: message.from,
            data: message
        });
    }

    broadcast(from: string, content: any, conversationId?: string): void {
        const agents = Array.from(this.subscribers.keys()).filter(a => a !== from);
        this.emit({
            from,
            to: agents,
            type: 'broadcast',
            content,
            timestamp: Date.now(),
            conversationId
        });
    }

    onAgentEvent(handler: (event: AgentEvent) => void): void {
        this.emitter.event(handler);
    }

    dispose(): void {
        this.emitter.dispose();
        this.subscribers.clear();
        this.messageQueue.clear();
    }
}