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
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const participants_1 = require("./chat/participants");
const client_1 = require("./mcp/client");
const conversation_store_1 = require("./storage/conversation-store");
const context_analyzer_1 = require("./chat/context-analyzer");
const command_line_manager_1 = require("./chat/command-line-manager");
let mcpClient;
let conversationStore;
let contextAnalyzer;
let commandLineManager;
let chatManager;
function activate(context) {
    console.log('Multi-Model AI Collaboration extension activating...');
    try {
        // Initialize core components
        initializeComponents(context);
        // Register chat participants
        registerChatParticipants(context);
        // Register commands
        registerCommands(context);
        console.log('Multi-Model AI Collaboration extension activated successfully!');
        // Show activation message
        vscode.window.showInformationMessage('Multi-Model AI Collaboration ready! Use @claude-research and @kiro in chat.', 'Test Connection').then(selection => {
            if (selection === 'Test Connection') {
                vscode.commands.executeCommand('multiModelDebate.testMcpConnection');
            }
        });
    }
    catch (error) {
        console.error('Failed to activate Multi-Model AI Collaboration extension:', error);
        vscode.window.showErrorMessage(`Failed to activate Multi-Model AI Collaboration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
exports.activate = activate;
function initializeComponents(context) {
    // Get configuration
    const config = vscode.workspace.getConfiguration('multiModelDebate');
    const mcpServerPath = config.get('mcpServerPath', './src/mcp_server.py');
    // Initialize components
    conversationStore = new conversation_store_1.ConversationStore(context);
    contextAnalyzer = new context_analyzer_1.ContextAnalyzer(config);
    commandLineManager = new command_line_manager_1.CommandLineManager(config);
    mcpClient = new client_1.MCPClient(mcpServerPath, config);
    // Initialize chat manager
    chatManager = new participants_1.ChatParticipantManager(mcpClient, conversationStore, contextAnalyzer, commandLineManager);
}
function registerChatParticipants(context) {
    console.log('Registering chat participants...');
    // Register claude-research participant
    const claudeResearchParticipant = vscode.chat.createChatParticipant('claude-research', async (request, context, stream, token) => {
        return chatManager.handleChatRequest('claude-research', request, context, stream, token);
    });
    claudeResearchParticipant.iconPath = new vscode.ThemeIcon('brain');
    // Register kiro participant
    const kiroParticipant = vscode.chat.createChatParticipant('kiro', async (request, context, stream, token) => {
        return chatManager.handleChatRequest('kiro', request, context, stream, token);
    });
    kiroParticipant.iconPath = new vscode.ThemeIcon('tools');
    // Add to subscriptions for proper cleanup
    context.subscriptions.push(claudeResearchParticipant, kiroParticipant);
    console.log('Chat participants registered successfully');
}
function registerCommands(context) {
    console.log('Registering commands...');
    // Test MCP connection command
    const testConnectionCommand = vscode.commands.registerCommand('multiModelDebate.testMcpConnection', async () => {
        try {
            const isConnected = await mcpClient.testConnection();
            if (isConnected) {
                vscode.window.showInformationMessage('✅ MCP Server connection successful!');
            }
            else {
                vscode.window.showWarningMessage('⚠️ MCP Server not available. Using fallback mode.');
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ MCP Server connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });
    // Show conversation history command
    const showHistoryCommand = vscode.commands.registerCommand('multiModelDebate.showConversationHistory', async () => {
        const history = await conversationStore.getConversationHistory();
        if (history.length === 0) {
            vscode.window.showInformationMessage('No AI conversation history found.');
            return;
        }
        // Create and show history document
        const doc = await vscode.workspace.openTextDocument({
            content: conversationStore.formatHistoryForDisplay(history),
            language: 'markdown'
        });
        vscode.window.showTextDocument(doc);
    });
    // Clear conversation history command
    const clearHistoryCommand = vscode.commands.registerCommand('multiModelDebate.clearConversationHistory', async () => {
        const result = await vscode.window.showWarningMessage('Clear all AI conversation history for this workspace?', { modal: true }, 'Clear History');
        if (result === 'Clear History') {
            await conversationStore.clearHistory();
            vscode.window.showInformationMessage('AI conversation history cleared.');
        }
    });
    // Add to subscriptions
    context.subscriptions.push(testConnectionCommand, showHistoryCommand, clearHistoryCommand);
    console.log('Commands registered successfully');
}
function deactivate() {
    console.log('Multi-Model AI Collaboration extension deactivating...');
    // Cleanup resources
    if (mcpClient) {
        mcpClient.disconnect();
    }
    console.log('Multi-Model AI Collaboration extension deactivated');
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map