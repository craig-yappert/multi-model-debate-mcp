import * as vscode from 'vscode';
import { MCPClient } from '../mcp/client';
import { ConversationStore, ConversationEntry, ConversationThread, ThreadMessage, AIToAIRequest } from '../storage/conversation-store';
import { ContextAnalyzer, VSCodeContext } from './context-analyzer';
import { CommandLineManager } from './command-line-manager';
import { MattermostFallback } from './mattermost-fallback';
import { AgentEventBus, AgentMessage } from '../core/event-bus';
import { ResilientMCPClient } from '../core/resilient-mcp-client';

export interface AgentStatus {
    persona: string;
    status: 'idle' | 'thinking' | 'responding' | 'collaborating' | 'error';
    currentTask?: string;
    startTime?: number;
    responseTime?: number;
    lastActivity: number;
}

export interface SharedContext {
    id: string;
    sourcePersona: string;
    targetPersonas: string[];
    contextType: 'insight' | 'finding' | 'recommendation' | 'warning' | 'collaboration';
    title: string;
    content: string;
    metadata?: Record<string, any>;
    timestamp: number;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    expiresAt?: number;
}

export interface CrossAgentMemory {
    sharedInsights: Map<string, SharedContext>;
    collaborationHistory: Array<{
        participants: string[];
        topic: string;
        outcome: string;
        timestamp: number;
    }>;
    expertise: Map<string, string[]>; // persona -> areas of expertise
}

export interface QueuedRequest {
    id: string;
    persona: string;
    request: vscode.ChatRequest;
    context: vscode.ChatContext;
    stream: vscode.ChatResponseStream;
    token: vscode.CancellationToken;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    timestamp: number;
    resolve: (value: { metadata: { command: string } }) => void;
    reject: (error: any) => void;
}

export class ChatParticipantManager {
    private mattermostFallback: MattermostFallback;
    private activeConversations: Map<string, number> = new Map();
    private readonly MAX_CONVERSATION_DEPTH = 5;

    // Enhanced agent status tracking
    private agentStatuses: Map<string, AgentStatus> = new Map();
    private statusUpdateCallbacks: Set<(statuses: Map<string, AgentStatus>) => void> = new Set();

    // Cross-agent context sharing
    private crossAgentMemory: CrossAgentMemory = {
        sharedInsights: new Map(),
        collaborationHistory: [],
        expertise: new Map()
    };

    // Priority queue system
    private requestQueue: QueuedRequest[] = [];
    private processingQueue = false;
    private maxConcurrentRequests = 3;
    private activeRequests = new Set<string>();

    // Event-driven architecture components
    private eventBus: AgentEventBus;
    private resilientClient: ResilientMCPClient;

    constructor(
        private mcpClient: MCPClient,
        private conversationStore: ConversationStore,
        private contextAnalyzer: ContextAnalyzer,
        private commandLineManager: CommandLineManager
    ) {
        // Initialize Mattermost fallback with current configuration
        const config = vscode.workspace.getConfiguration('multiModelDebate');
        this.mattermostFallback = new MattermostFallback(config);

        // Initialize event-driven architecture
        this.eventBus = AgentEventBus.getInstance();
        this.resilientClient = new ResilientMCPClient(mcpClient, {
            failureThreshold: config.get('failureThreshold', 5),
            resetTimeout: config.get('resetTimeout', 60000),
            maxRequestsPerMinute: config.get('maxRequestsPerMinute', 60),
            maxQueueSize: config.get('maxQueueSize', 100)
        });

        // Initialize agent statuses and expertise
        this.initializeAgentStatuses();
        this.initializeAgentExpertise();
        this.setupEventHandlers();
    }

    // Cross-agent context sharing methods
    private initializeAgentExpertise(): void {
        this.crossAgentMemory.expertise.set('claude-research', [
            'analysis', 'research', 'documentation', 'strategic-thinking', 'problem-solving'
        ]);
        this.crossAgentMemory.expertise.set('kiro', [
            'implementation', 'debugging', 'optimization', 'practical-solutions', 'execution'
        ]);
        this.crossAgentMemory.expertise.set('copilot', [
            'code-review', 'best-practices', 'integration', 'quality-assurance', 'testing'
        ]);
        this.crossAgentMemory.expertise.set('team', [
            'coordination', 'synthesis', 'collaboration', 'decision-making', 'project-management'
        ]);
    }

    public shareContext(context: Omit<SharedContext, 'id' | 'timestamp'>): string {
        const id = `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const sharedContext: SharedContext = {
            ...context,
            id,
            timestamp: Date.now()
        };

        this.crossAgentMemory.sharedInsights.set(id, sharedContext);

        // Auto-expire low priority contexts after 1 hour
        if (context.priority === 'low' && !context.expiresAt) {
            sharedContext.expiresAt = Date.now() + (60 * 60 * 1000);
        }

        console.log(`Agent ${context.sourcePersona} shared context: ${context.title}`);
        return id;
    }

    public getRelevantContext(persona: string, topic?: string): SharedContext[] {
        const now = Date.now();
        const relevantContexts: SharedContext[] = [];

        this.crossAgentMemory.sharedInsights.forEach((context) => {
            // Skip expired contexts
            if (context.expiresAt && context.expiresAt < now) {
                this.crossAgentMemory.sharedInsights.delete(context.id);
                return;
            }

            // Include if targeting this persona or all personas
            if (context.targetPersonas.includes(persona) ||
                context.targetPersonas.includes('all')) {
                relevantContexts.push(context);
            }
        });

        // Sort by priority and recency
        return relevantContexts.sort((a, b) => {
            const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
            const aPriority = priorityOrder[a.priority];
            const bPriority = priorityOrder[b.priority];

            if (aPriority !== bPriority) {
                return bPriority - aPriority;
            }
            return b.timestamp - a.timestamp;
        });
    }

    public addCollaborationOutcome(participants: string[], topic: string, outcome: string): void {
        this.crossAgentMemory.collaborationHistory.push({
            participants: [...participants],
            topic,
            outcome,
            timestamp: Date.now()
        });

        // Keep only last 20 collaboration outcomes
        if (this.crossAgentMemory.collaborationHistory.length > 20) {
            this.crossAgentMemory.collaborationHistory =
                this.crossAgentMemory.collaborationHistory.slice(-20);
        }
    }

    public getAgentExpertise(persona: string): string[] {
        return this.crossAgentMemory.expertise.get(persona) || [];
    }

    public findExpertFor(topic: string): string[] {
        const experts: string[] = [];
        const topicLower = topic.toLowerCase();

        this.crossAgentMemory.expertise.forEach((expertise, persona) => {
            if (expertise.some(area => topicLower.includes(area.toLowerCase()))) {
                experts.push(persona);
            }
        });

        return experts;
    }

    // Event-driven communication setup
    private setupEventHandlers(): void {
        // Subscribe each agent to their own message channel
        const personas = ['claude-research', 'kiro', 'copilot', 'team'];

        personas.forEach(persona => {
            this.eventBus.subscribe(persona, (message: AgentMessage) => {
                this.handleAgentMessage(persona, message);
            });
        });

        // Listen to system events
        this.eventBus.onAgentEvent((event) => {
            this.handleSystemEvent(event);
        });
    }

    private async handleAgentMessage(targetAgent: string, message: AgentMessage): Promise<void> {
        console.log(`Agent ${targetAgent} received message from ${message.from}: ${message.type}`);

        // Share relevant context based on message type
        if (message.type === 'request' && message.conversationId) {
            const relevantContext = this.getRelevantContext(targetAgent);
            if (relevantContext.length > 0) {
                console.log(`Sharing ${relevantContext.length} context items with ${targetAgent}`);

                // Store context for this conversation
                this.shareContext({
                    sourcePersona: message.from,
                    targetPersonas: [targetAgent],
                    contextType: 'collaboration',
                    title: `Context for conversation ${message.conversationId}`,
                    content: JSON.stringify(relevantContext),
                    priority: 'medium'
                });
            }
        }
    }

    private handleSystemEvent(event: any): void {
        console.log(`System event: ${event.type} from ${event.agent}`);

        // Update agent status based on events
        if (event.type === 'agent.complete') {
            this.completeAgentTask(event.agent);
        } else if (event.type === 'agent.error') {
            this.updateAgentStatus(event.agent, 'error', event.data?.message);
        }
    }

    // Enhanced collaboration with event-driven patterns
    public async initiateCollaboration(
        initiator: string,
        participants: string[],
        topic: string,
        urgency: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
    ): Promise<string> {
        const collaborationId = `collab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Share collaboration context
        const contextId = this.shareContext({
            sourcePersona: initiator,
            targetPersonas: participants,
            contextType: 'collaboration',
            title: `Collaboration Request: ${topic}`,
            content: `${initiator} is requesting collaboration on: ${topic}`,
            priority: urgency
        });

        // Notify all participants via event bus
        participants.forEach(participant => {
            this.eventBus.emit({
                from: initiator,
                to: participant,
                type: 'request',
                content: {
                    type: 'collaboration_invite',
                    topic,
                    collaborationId,
                    contextId,
                    urgency
                },
                timestamp: Date.now(),
                conversationId: collaborationId
            });
        });

        return collaborationId;
    }

    // Health monitoring for the resilient system
    public getSystemHealth(): {
        eventBus: any;
        resilientClient: any;
        requestQueue: number;
        agentStatuses: Record<string, AgentStatus>;
    } {
        const statuses: Record<string, AgentStatus> = {};
        this.agentStatuses.forEach((status, agent) => {
            statuses[agent] = status;
        });

        return {
            eventBus: this.eventBus.getStats(),
            resilientClient: this.resilientClient.getHealth(),
            requestQueue: this.requestQueue.length,
            agentStatuses: statuses
        };
    }

    // Agent status management methods
    private initializeAgentStatuses(): void {
        const personas = ['claude-research', 'kiro', 'copilot', 'team'];
        personas.forEach(persona => {
            this.agentStatuses.set(persona, {
                persona,
                status: 'idle',
                lastActivity: Date.now()
            });
        });
    }

    private updateAgentStatus(persona: string, status: AgentStatus['status'], task?: string): void {
        const currentStatus = this.agentStatuses.get(persona);
        if (currentStatus) {
            const updatedStatus: AgentStatus = {
                ...currentStatus,
                status,
                currentTask: task,
                startTime: status !== 'idle' ? Date.now() : undefined,
                lastActivity: Date.now()
            };
            this.agentStatuses.set(persona, updatedStatus);
            this.notifyStatusUpdate();
        }
    }

    private completeAgentTask(persona: string, responseTime?: number): void {
        const currentStatus = this.agentStatuses.get(persona);
        if (currentStatus) {
            const updatedStatus: AgentStatus = {
                ...currentStatus,
                status: 'idle',
                currentTask: undefined,
                responseTime,
                lastActivity: Date.now()
            };
            this.agentStatuses.set(persona, updatedStatus);
            this.notifyStatusUpdate();
        }
    }

    private notifyStatusUpdate(): void {
        this.statusUpdateCallbacks.forEach(callback => {
            callback(new Map(this.agentStatuses));
        });
    }

    // Public API for status monitoring
    public getAgentStatuses(): Map<string, AgentStatus> {
        return new Map(this.agentStatuses);
    }

    public onStatusUpdate(callback: (statuses: Map<string, AgentStatus>) => void): () => void {
        this.statusUpdateCallbacks.add(callback);
        return () => this.statusUpdateCallbacks.delete(callback);
    }

    public getStatusIndicator(persona: string): string {
        const status = this.agentStatuses.get(persona);
        if (!status) return '❓';

        switch (status.status) {
            case 'idle': return '💤';
            case 'thinking': return '🤔';
            case 'responding': return '💬';
            case 'collaborating': return '🤝';
            case 'error': return '⚠️';
            default: return '🤖';
        }
    }

    async handleChatRequest(
        persona: string,
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<{ metadata: { command: string } }> {

        // Circuit breaker: prevent runaway conversations
        const conversationKey = `${persona}-${request.prompt.substring(0, 50)}`;
        const currentDepth = this.activeConversations.get(conversationKey) || 0;

        if (currentDepth >= this.MAX_CONVERSATION_DEPTH) {
            stream.markdown(`**${this.getPersonaDisplayName(persona)}** ⚠️\n\nConversation depth limit reached to prevent circular communication. Please start a new conversation thread.`);
            this.activeConversations.delete(conversationKey);
            return { metadata: { command: 'conversation-limit-reached' } };
        }

        this.activeConversations.set(conversationKey, currentDepth + 1);

        try {
            // Update agent status to thinking
            this.updateAgentStatus(persona, 'thinking', 'Analyzing request');

            // Note: VS Code's model selector in chat is for the built-in Copilot integration.
            // Our extension uses specific personas (@claude-research, @kiro, @copilot, @team)
            // that route to our MCP server, not the VS Code model selector.
            // The model shown in VS Code chat UI doesn't affect our persona routing.

            // Special handling for team persona
            if (persona === 'team') {
                this.updateAgentStatus(persona, 'collaborating', 'Orchestrating team response');
                const result = await this.handleTeamRequest(request, context, stream, token);
                this.completeAgentTask(persona);
                this.activeConversations.delete(conversationKey);
                return result;
            }

            const startTime = Date.now();
            // Show thinking indicator with status and clarification about routing
            const statusIndicator = this.getStatusIndicator(persona);
            stream.progress(`${this.getPersonaDisplayName(persona)} ${statusIndicator} is analyzing your request...`);

            // If user seems confused about model selection, clarify
            if (request.prompt.toLowerCase().includes('gpt') || request.prompt.toLowerCase().includes('model')) {
                stream.markdown(`ℹ️ *Note: This extension uses specific AI personas (@claude-research, @kiro, @copilot) that connect through our MCP server, independent of VS Code's model selector.*\n\n`);
            }

            // Gather rich context from VS Code
            const codeContext = await this.contextAnalyzer.gatherContext();

            // Get conversation history for context
            const conversationHistory = await this.conversationStore.getRecentConversations(5);

            // Get relevant cross-agent context
            const sharedContext = this.getRelevantContext(persona, request.prompt);
            const agentExpertise = this.getAgentExpertise(persona);
            const suggestedExperts = this.findExpertFor(request.prompt);

            // Prepare the request with all context
            const enhancedRequest = {
                message: request.prompt,
                persona: persona,
                vscode_context: codeContext,
                conversation_history: conversationHistory,
                shared_context: sharedContext,
                agent_expertise: agentExpertise,
                suggested_experts: suggestedExperts,
                workspace: vscode.workspace.name,
                timestamp: new Date().toISOString()
            };

            this.updateAgentStatus(persona, 'thinking', 'Connecting to AI personas');
            stream.progress(`Connecting to AI personas...`);

            // Get AI response from MCP server
            // Get AI response using resilient client with circuit breaker and rate limiting
            const aiResponse = await this.resilientClient.sendMessage(
                JSON.stringify(enhancedRequest),
                persona,
                conversationKey
            );

            if (!aiResponse || aiResponse.trim().length === 0) {
                throw new Error('No response received from AI persona');
            }

            // Update status to responding
            this.updateAgentStatus(persona, 'responding', 'Generating response');

            // Log response length for debugging
            console.log(`Response from ${persona}: ${aiResponse.length} characters`);
            console.log('First 500 chars:', aiResponse.substring(0, 500));
            console.log('Last 500 chars:', aiResponse.substring(Math.max(0, aiResponse.length - 500)));

            // Check if response contains command line suggestions
            const commandSuggestions = this.extractCommandSuggestions(aiResponse);

            // Stream the response
            const responseStatusIndicator = this.getStatusIndicator(persona);
            stream.progress(`${this.getPersonaDisplayName(persona)} ${responseStatusIndicator} is responding...`);

            // Add persona header with live status icon
            const currentStatusIndicator = this.getStatusIndicator(persona);
            stream.markdown(`**${this.getPersonaDisplayName(persona)}** ${currentStatusIndicator}\n\n`);

            // Stream the main response
            await this.streamResponse(stream, aiResponse);

            // Handle command suggestions if present
            if (commandSuggestions.length > 0) {
                await this.handleCommandSuggestions(stream, commandSuggestions);
            }

            // Save conversation to workspace storage
            await this.conversationStore.saveConversation({
                id: '', // Will be generated by saveConversation
                persona,
                message: request.prompt,
                response: aiResponse,
                context: codeContext,
                timestamp: new Date().toISOString(),
                responseTime: Date.now() - startTime
            });

            // Add metadata about file context for VS Code
            const metadata = {
                command: `ai-response-${persona}`,
                fileContext: codeContext.activeFile?.path || 'none',
                hasErrors: codeContext.diagnostics.length > 0,
                isDebugging: codeContext.debugging?.isActive || false
            };

            // Complete agent task and clean up conversation tracking
            this.completeAgentTask(persona, Date.now() - startTime);
            this.activeConversations.delete(conversationKey);
            return { metadata };

        } catch (error) {
            console.error(`Error in ${persona} chat participant:`, error);

            // Update agent status to error and clean up conversation tracking
            this.updateAgentStatus(persona, 'error', `Error: ${error}`);
            this.activeConversations.delete(conversationKey);

            // Fallback to Mattermost or error response
            const fallbackResponse = await this.handleFallbackResponse(persona, request.prompt, error);
            stream.markdown(`**${this.getPersonaDisplayName(persona)}** ⚠️\n\n${fallbackResponse}`);

            // Show fallback action buttons
            await this.mattermostFallback.handleFallbackActions(stream);

            // Prompt fallback configuration if needed
            await this.mattermostFallback.promptFallbackConfiguration();

            return { metadata: { command: `ai-error-${persona}` } };
        }
    }

    private async streamResponse(stream: vscode.ChatResponseStream, response: string): Promise<void> {
        // Get configuration
        const config = vscode.workspace.getConfiguration('multiModelDebate');
        const useChunking = config.get<boolean>('useResponseChunking', true);

        if (!useChunking) {
            // Send entire response at once to avoid truncation
            stream.markdown(response);
            console.log(`Sent entire response at once: ${response.length} characters`);
        } else {
            // Use chunking if enabled
            const chunkSize = config.get<number>('responseChunkSize', 5000);
            const streamDelay = config.get<number>('responseStreamDelay', 5);

            // Stream response in configurable chunks
            const chunks = this.chunkResponse(response, chunkSize);
            console.log(`Streaming ${chunks.length} chunks of max size ${chunkSize}`);

            for (const chunk of chunks) {
                stream.markdown(chunk);
                // Configurable delay between chunks
                if (streamDelay > 0) {
                    await new Promise(resolve => setTimeout(resolve, streamDelay));
                }
            }
        }
    }

    private chunkResponse(text: string, chunkSize: number): string[] {
        const chunks: string[] = [];
        let currentChunk = '';
        const words = text.split(' ');

        for (const word of words) {
            if ((currentChunk + ' ' + word).length > chunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = word;
            } else {
                currentChunk = currentChunk ? `${currentChunk} ${word}` : word;
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    private extractCommandSuggestions(response: string): string[] {
        // Look for command suggestions in the response
        const commandPatterns = [
            /```(?:bash|shell|cmd)\n([\s\S]*?)\n```/g,
            /`([^`]+)`/g
        ];

        const suggestions: string[] = [];

        for (const pattern of commandPatterns) {
            let match;
            while ((match = pattern.exec(response)) !== null) {
                const command = match[1].trim();
                if (this.looksLikeCommand(command)) {
                    suggestions.push(command);
                }
            }
        }

        return [...new Set(suggestions)]; // Remove duplicates
    }

    private looksLikeCommand(text: string): boolean {
        // Simple heuristics to identify commands
        const commandIndicators = [
            'npm ', 'yarn ', 'git ', 'python ', 'node ',
            'cd ', 'ls ', 'mkdir ', 'rm ', 'cp ', 'mv ',
            'pip ', 'cargo ', 'go ', 'docker ', 'kubectl '
        ];

        return commandIndicators.some(indicator => text.toLowerCase().startsWith(indicator));
    }

    private async handleCommandSuggestions(stream: vscode.ChatResponseStream, suggestions: string[]): Promise<void> {
        if (!this.commandLineManager.isEnabled()) {
            return;
        }

        stream.markdown('\n\n---\n\n**Command Suggestions:**\n\n');

        for (const suggestion of suggestions) {
            // Create a button for each command suggestion
            stream.button({
                command: 'multiModelDebate.executeCommand',
                title: `▶️ Run: ${suggestion}`,
                arguments: [suggestion]
            });
        }
    }

    private async handleFallbackResponse(persona: string, message: string, error: any): Promise<string> {
        // Use the dedicated Mattermost fallback handler
        return this.mattermostFallback.getFallbackResponse(persona, error);
    }

    private getPersonaDisplayName(persona: string): string {
        switch (persona) {
            case 'claude-research':
                return 'Claude Research';
            case 'kiro':
                return 'Kiro';
            case 'copilot':
                return 'GitHub Copilot';
            case 'team':
                return 'AI Team';
            default:
                return persona;
        }
    }

    private getPersonaIcon(persona: string): string {
        switch (persona) {
            case 'claude-research':
                return '🧠'; // Brain for analytical thinking
            case 'kiro':
                return '🔧'; // Tools for practical execution
            case 'copilot':
                return '🚁'; // Helicopter for oversight and integration
            case 'team':
                return '🤝'; // Handshake for collaboration
            default:
                return '🤖';
        }
    }

    async handleTeamRequest(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<{ metadata: { command: string } }> {
        const startTime = Date.now();

        try {
            // Parse team command
            const prompt = request.prompt.trim();
            const commandMatch = prompt.match(/^(debate|collaborate|discuss)\s+(.+)$/);
            
            let command = 'collaborate';
            let topic = prompt;

            if (commandMatch) {
                command = commandMatch[1];
                topic = commandMatch[2];
            }

            stream.progress('🤝 Team is initializing multi-AI collaboration...');

            // Create a new conversation thread
            const participants = ['claude-research', 'kiro', 'copilot'];
            const thread = await this.conversationStore.createThread(participants, topic);

            stream.markdown(`**AI Team** 🤝\n\n`);
            stream.markdown(`Starting ${command} session: **${topic}**\n\n`);
            stream.markdown(`Participants: @claude-research 🧠, @kiro 🔧, and @copilot �\n\n`);
            stream.markdown(`---\n\n`);

            // Gather context for the conversation
            const codeContext = await this.contextAnalyzer.gatherContext();
            const conversationHistory = await this.conversationStore.getRecentConversations(3);

            // Start the multi-agent conversation
            await this.orchestrateMultiAgentConversation(
                thread, 
                topic, 
                command, 
                stream, 
                codeContext, 
                conversationHistory
            );

            // Update thread status
            await this.conversationStore.updateThreadStatus(thread.id, 'concluded');

            stream.markdown(`\n---\n\n**🎯 Team Collaboration Complete**\n\n`);

            return { 
                metadata: { 
                    command: `team-${command}`
                } 
            };

        } catch (error) {
            console.error('Error in team chat participant:', error);
            stream.markdown(`**AI Team** ⚠️\n\nError during team collaboration: ${error}`);
            return { metadata: { command: 'team-error' } };
        }
    }

    private async orchestrateMultiAgentConversation(
        thread: ConversationThread,
        topic: string,
        command: string,
        stream: vscode.ChatResponseStream,
        codeContext: VSCodeContext,
        conversationHistory: ConversationEntry[]
    ): Promise<void> {
        const maxTurns = 4; // Prevent infinite loops
        let currentSpeaker = 'claude-research'; // Start with research
        let turn = 0;

        // Initial prompt to get the conversation started
        let currentMessage = this.getInitialPrompt(command, topic, codeContext);

        while (turn < maxTurns) {
            turn++;

            stream.progress(`Turn ${turn}: @${currentSpeaker} is thinking...`);

            try {
                // Create AI-to-AI request
                const aiRequest: AIToAIRequest = {
                    fromPersona: turn === 1 ? 'team' : this.getOtherPersona(currentSpeaker),
                    toPersona: currentSpeaker,
                    message: currentMessage,
                    conversationContext: conversationHistory,
                    interactionType: this.getInteractionType(turn, command),
                    threadId: thread.id
                };

                // Get response from current AI
                const response = await this.resilientClient.sendMessage(
                    JSON.stringify(aiRequest),
                    currentSpeaker,
                    thread.id
                );

                // Display the response
                stream.markdown(`**@${currentSpeaker}** ${this.getPersonaIcon(currentSpeaker)}\n\n`);
                await this.streamResponse(stream, response);
                stream.markdown(`\n\n`);

                // Add message to thread
                const threadMessage: ThreadMessage = {
                    id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    persona: currentSpeaker,
                    message: response,
                    timestamp: new Date().toISOString(),
                    interactionType: aiRequest.interactionType
                };

                await this.conversationStore.addMessageToThread(thread.id, threadMessage);

                // Prepare message for next AI
                currentMessage = this.createFollowUpPrompt(response, command, turn);

                // Switch to other persona
                currentSpeaker = this.getOtherPersona(currentSpeaker);

                // Check if conversation should conclude
                if (this.shouldConcludeConversation(response, turn)) {
                    break;
                }

            } catch (error) {
                console.error(`Error in turn ${turn} with ${currentSpeaker}:`, error);
                stream.markdown(`⚠️ Error communicating with @${currentSpeaker}: ${error}\n\n`);
                break;
            }
        }

        // Generate final synthesis
        await this.generateSynthesis(thread, stream);
    }

    private getInitialPrompt(command: string, topic: string, context: VSCodeContext): string {
        const contextSummary = this.summarizeContext(context);
        
        switch (command) {
            case 'debate':
                return `Let's have a constructive debate about: ${topic}\n\nCurrent context: ${contextSummary}\n\nPlease present your initial perspective and reasoning.`;
            case 'collaborate':
                return `Let's collaborate on: ${topic}\n\nCurrent context: ${contextSummary}\n\nPlease share your initial thoughts and proposed approach.`;
            case 'discuss':
                return `Let's discuss: ${topic}\n\nCurrent context: ${contextSummary}\n\nPlease provide your analysis and insights.`;
            default:
                return `Let's work together on: ${topic}\n\nCurrent context: ${contextSummary}\n\nPlease share your perspective.`;
        }
    }

    private createFollowUpPrompt(previousResponse: string, command: string, turn: number): string {
        const responsePrefix = `Previous response from colleague: "${previousResponse}"\n\n`;
        
        if (turn >= 3) {
            return responsePrefix + "Please provide your final thoughts and help synthesize our discussion into actionable conclusions.";
        }

        switch (command) {
            case 'debate':
                return responsePrefix + "Please respond with your counterpoints, alternative perspectives, or build upon the valid points raised.";
            case 'collaborate':
                return responsePrefix + "Please build upon this idea, suggest improvements, or identify implementation considerations.";
            default:
                return responsePrefix + "Please respond with your thoughts, questions, or additional insights.";
        }
    }

    private getInteractionType(turn: number, command: string): 'response' | 'challenge' | 'build_upon' | 'synthesize' {
        if (turn >= 3) return 'synthesize';
        if (command === 'debate') return turn % 2 === 0 ? 'challenge' : 'response';
        return 'build_upon';
    }

    private getOtherPersona(currentPersona: string): string {
        return currentPersona === 'claude-research' ? 'kiro' : 'claude-research';
    }

    private shouldConcludeConversation(response: string, turn: number): boolean {
        // Simple heuristics to detect conclusion
        const conclusionWords = ['conclusion', 'finally', 'in summary', 'to summarize', 'overall'];
        const hasConclusion = conclusionWords.some(word =>
            response.toLowerCase().includes(word)
        );

        // Check for circular communication patterns
        const circularPatterns = ['mentioned you in their response', 'inter-agent communication', 'original message'];
        const isCircular = circularPatterns.some(pattern =>
            response.toLowerCase().includes(pattern.toLowerCase())
        );

        // Conclude if we detect circular communication or reach turn limit
        return turn >= 3 && (hasConclusion || isCircular) || turn >= 5;
    }

    private async generateSynthesis(thread: ConversationThread, stream: vscode.ChatResponseStream): Promise<void> {
        stream.progress('Generating synthesis of the conversation...');

        try {
            const messages = thread.messages.map(msg => 
                `${msg.persona}: ${msg.message}`
            ).join('\n\n');

            const synthesisRequest: AIToAIRequest = {
                fromPersona: 'team',
                toPersona: 'claude-research',
                message: `Please create a synthesis of this multi-AI conversation:\n\n${messages}\n\nProvide a summary of key points, areas of agreement, disagreements, and actionable conclusions.`,
                conversationContext: [],
                interactionType: 'synthesize',
                threadId: thread.id
            };

            const synthesis = await this.resilientClient.sendMessage(
                JSON.stringify(synthesisRequest),
                'claude-research',
                thread.id
            );

            stream.markdown(`**🎯 Conversation Synthesis**\n\n`);
            stream.markdown(synthesis);

        } catch (error) {
            console.error('Error generating synthesis:', error);
            stream.markdown(`**🎯 Conversation Synthesis**\n\n⚠️ Could not generate synthesis: ${error}`);
        }
    }

    private summarizeContext(context: VSCodeContext): string {
        const parts = [];
        
        if (context.activeFile) {
            parts.push(`Active file: ${context.activeFile.path}`);
        }
        
        if (context.workspace?.name) {
            parts.push(`Workspace: ${context.workspace.name}`);
        }

        if (context.diagnostics.length > 0) {
            parts.push(`${context.diagnostics.length} diagnostic issues`);
        }

        if (context.git?.branch) {
            parts.push(`Git branch: ${context.git.branch}`);
        }

        return parts.length > 0 ? parts.join(', ') : 'No specific context';
    }
}