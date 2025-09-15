"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatParticipantManager = void 0;
const vscode = __importStar(require("vscode"));
const mattermost_fallback_1 = require("./mattermost-fallback");
class ChatParticipantManager {
    constructor(mcpClient, conversationStore, contextAnalyzer, commandLineManager) {
        this.mcpClient = mcpClient;
        this.conversationStore = conversationStore;
        this.contextAnalyzer = contextAnalyzer;
        this.commandLineManager = commandLineManager;
        // Initialize Mattermost fallback with current configuration
        const config = vscode.workspace.getConfiguration('multiModelDebate');
        this.mattermostFallback = new mattermost_fallback_1.MattermostFallback(config);
    }
    async handleChatRequest(persona, request, context, stream, token) {
        // Note: VS Code's model selector in chat is for the built-in Copilot integration.
        // Our extension uses specific personas (@claude-research, @kiro, @copilot, @team)
        // that route to our MCP server, not the VS Code model selector.
        // The model shown in VS Code chat UI doesn't affect our persona routing.
        // Special handling for team persona
        if (persona === 'team') {
            return this.handleTeamRequest(request, context, stream, token);
        }
        const startTime = Date.now();
        try {
            // Show thinking indicator with clarification about routing
            stream.progress(`${this.getPersonaDisplayName(persona)} is analyzing your request...`);
            // If user seems confused about model selection, clarify
            if (request.prompt.toLowerCase().includes('gpt') || request.prompt.toLowerCase().includes('model')) {
                stream.markdown(`ℹ️ *Note: This extension uses specific AI personas (@claude-research, @kiro, @copilot) that connect through our MCP server, independent of VS Code's model selector.*\n\n`);
            }
            // Gather rich context from VS Code
            const codeContext = await this.contextAnalyzer.gatherContext();
            // Get conversation history for context
            const conversationHistory = await this.conversationStore.getRecentConversations(5);
            // Prepare the request with all context
            const enhancedRequest = {
                message: request.prompt,
                persona: persona,
                vscode_context: codeContext,
                conversation_history: conversationHistory,
                workspace: vscode.workspace.name,
                timestamp: new Date().toISOString()
            };
            stream.progress(`Connecting to AI personas...`);
            // Get AI response from MCP server
            const aiResponse = await this.mcpClient.contribute(enhancedRequest);
            if (!aiResponse || aiResponse.trim().length === 0) {
                throw new Error('No response received from AI persona');
            }
            // Log response length for debugging
            console.log(`Response from ${persona}: ${aiResponse.length} characters`);
            console.log('First 500 chars:', aiResponse.substring(0, 500));
            console.log('Last 500 chars:', aiResponse.substring(Math.max(0, aiResponse.length - 500)));
            // Check if response contains command line suggestions
            const commandSuggestions = this.extractCommandSuggestions(aiResponse);
            // Stream the response
            stream.progress(`${this.getPersonaDisplayName(persona)} is responding...`);
            // Add persona header with icon
            stream.markdown(`**${this.getPersonaDisplayName(persona)}** ${this.getPersonaIcon(persona)}\n\n`);
            // Stream the main response
            await this.streamResponse(stream, aiResponse);
            // Handle command suggestions if present
            if (commandSuggestions.length > 0) {
                await this.handleCommandSuggestions(stream, commandSuggestions);
            }
            // Save conversation to workspace storage
            await this.conversationStore.saveConversation({
                id: '',
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
            return { metadata };
        }
        catch (error) {
            console.error(`Error in ${persona} chat participant:`, error);
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
    async streamResponse(stream, response) {
        // Get configuration
        const config = vscode.workspace.getConfiguration('multiModelDebate');
        const useChunking = config.get('useResponseChunking', true);
        if (!useChunking) {
            // Send entire response at once to avoid truncation
            stream.markdown(response);
            console.log(`Sent entire response at once: ${response.length} characters`);
        }
        else {
            // Use chunking if enabled
            const chunkSize = config.get('responseChunkSize', 5000);
            const streamDelay = config.get('responseStreamDelay', 5);
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
    chunkResponse(text, chunkSize) {
        const chunks = [];
        let currentChunk = '';
        const words = text.split(' ');
        for (const word of words) {
            if ((currentChunk + ' ' + word).length > chunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = word;
            }
            else {
                currentChunk = currentChunk ? `${currentChunk} ${word}` : word;
            }
        }
        if (currentChunk) {
            chunks.push(currentChunk);
        }
        return chunks;
    }
    extractCommandSuggestions(response) {
        // Look for command suggestions in the response
        const commandPatterns = [
            /```(?:bash|shell|cmd)\n([\s\S]*?)\n```/g,
            /`([^`]+)`/g
        ];
        const suggestions = [];
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
    looksLikeCommand(text) {
        // Simple heuristics to identify commands
        const commandIndicators = [
            'npm ', 'yarn ', 'git ', 'python ', 'node ',
            'cd ', 'ls ', 'mkdir ', 'rm ', 'cp ', 'mv ',
            'pip ', 'cargo ', 'go ', 'docker ', 'kubectl '
        ];
        return commandIndicators.some(indicator => text.toLowerCase().startsWith(indicator));
    }
    async handleCommandSuggestions(stream, suggestions) {
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
    async handleFallbackResponse(persona, message, error) {
        // Use the dedicated Mattermost fallback handler
        return this.mattermostFallback.getFallbackResponse(persona, error);
    }
    getPersonaDisplayName(persona) {
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
    getPersonaIcon(persona) {
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
    async handleTeamRequest(request, context, stream, token) {
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
            await this.orchestrateMultiAgentConversation(thread, topic, command, stream, codeContext, conversationHistory);
            // Update thread status
            await this.conversationStore.updateThreadStatus(thread.id, 'concluded');
            stream.markdown(`\n---\n\n**🎯 Team Collaboration Complete**\n\n`);
            return {
                metadata: {
                    command: `team-${command}`
                }
            };
        }
        catch (error) {
            console.error('Error in team chat participant:', error);
            stream.markdown(`**AI Team** ⚠️\n\nError during team collaboration: ${error}`);
            return { metadata: { command: 'team-error' } };
        }
    }
    async orchestrateMultiAgentConversation(thread, topic, command, stream, codeContext, conversationHistory) {
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
                const aiRequest = {
                    fromPersona: turn === 1 ? 'team' : this.getOtherPersona(currentSpeaker),
                    toPersona: currentSpeaker,
                    message: currentMessage,
                    conversationContext: conversationHistory,
                    interactionType: this.getInteractionType(turn, command),
                    threadId: thread.id
                };
                // Get response from current AI
                const response = await this.mcpClient.sendAIToAIMessage(aiRequest);
                // Display the response
                stream.markdown(`**@${currentSpeaker}** ${this.getPersonaIcon(currentSpeaker)}\n\n`);
                await this.streamResponse(stream, response);
                stream.markdown(`\n\n`);
                // Add message to thread
                const threadMessage = {
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
            }
            catch (error) {
                console.error(`Error in turn ${turn} with ${currentSpeaker}:`, error);
                stream.markdown(`⚠️ Error communicating with @${currentSpeaker}: ${error}\n\n`);
                break;
            }
        }
        // Generate final synthesis
        await this.generateSynthesis(thread, stream);
    }
    getInitialPrompt(command, topic, context) {
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
    createFollowUpPrompt(previousResponse, command, turn) {
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
    getInteractionType(turn, command) {
        if (turn >= 3)
            return 'synthesize';
        if (command === 'debate')
            return turn % 2 === 0 ? 'challenge' : 'response';
        return 'build_upon';
    }
    getOtherPersona(currentPersona) {
        return currentPersona === 'claude-research' ? 'kiro' : 'claude-research';
    }
    shouldConcludeConversation(response, turn) {
        // Simple heuristics to detect conclusion
        const conclusionWords = ['conclusion', 'finally', 'in summary', 'to summarize', 'overall'];
        const hasConclusion = conclusionWords.some(word => response.toLowerCase().includes(word));
        return turn >= 3 && hasConclusion;
    }
    async generateSynthesis(thread, stream) {
        stream.progress('Generating synthesis of the conversation...');
        try {
            const messages = thread.messages.map(msg => `${msg.persona}: ${msg.message}`).join('\n\n');
            const synthesisRequest = {
                fromPersona: 'team',
                toPersona: 'claude-research',
                message: `Please create a synthesis of this multi-AI conversation:\n\n${messages}\n\nProvide a summary of key points, areas of agreement, disagreements, and actionable conclusions.`,
                conversationContext: [],
                interactionType: 'synthesize',
                threadId: thread.id
            };
            const synthesis = await this.mcpClient.sendAIToAIMessage(synthesisRequest);
            stream.markdown(`**🎯 Conversation Synthesis**\n\n`);
            stream.markdown(synthesis);
        }
        catch (error) {
            console.error('Error generating synthesis:', error);
            stream.markdown(`**🎯 Conversation Synthesis**\n\n⚠️ Could not generate synthesis: ${error}`);
        }
    }
    summarizeContext(context) {
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
exports.ChatParticipantManager = ChatParticipantManager;
//# sourceMappingURL=participants.js.map