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
        const startTime = Date.now();
        try {
            // Show thinking indicator
            stream.progress(`${this.getPersonaDisplayName(persona)} is analyzing your request...`);
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
        // Stream response in chunks to make it feel more interactive
        const chunks = this.chunkResponse(response, 100);
        for (const chunk of chunks) {
            stream.markdown(chunk);
            // Small delay to make streaming visible
            await new Promise(resolve => setTimeout(resolve, 50));
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
            default:
                return '🤖';
        }
    }
}
exports.ChatParticipantManager = ChatParticipantManager;
//# sourceMappingURL=participants.js.map