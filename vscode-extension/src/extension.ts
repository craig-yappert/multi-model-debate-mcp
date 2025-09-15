import * as vscode from 'vscode';
import { ChatParticipantManager } from './chat/participants';
import { MCPClient } from './mcp/client';
import { ConversationStore } from './storage/conversation-store';
import { ContextAnalyzer } from './chat/context-analyzer';
import { CommandLineManager } from './chat/command-line-manager';

let mcpClient: MCPClient;
let conversationStore: ConversationStore;
let contextAnalyzer: ContextAnalyzer;
let commandLineManager: CommandLineManager;
let chatManager: ChatParticipantManager;

export function activate(context: vscode.ExtensionContext) {
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
        vscode.window.showInformationMessage(
            'Multi-Model AI Collaboration ready! Use @claude-research and @kiro in chat.',
            'Test Connection'
        ).then(selection => {
            if (selection === 'Test Connection') {
                vscode.commands.executeCommand('multiModelDebate.testMcpConnection');
            }
        });

    } catch (error) {
        console.error('Failed to activate Multi-Model AI Collaboration extension:', error);
        vscode.window.showErrorMessage(
            `Failed to activate Multi-Model AI Collaboration: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

function initializeComponents(context: vscode.ExtensionContext) {
    // Get configuration
    const config = vscode.workspace.getConfiguration('multiModelDebate');
    const mcpServerPath = config.get<string>('mcpServerPath', './src/mcp_server.py');

    // Initialize components
    conversationStore = new ConversationStore(context);
    contextAnalyzer = new ContextAnalyzer(config);
    commandLineManager = new CommandLineManager(config);
    mcpClient = new MCPClient(mcpServerPath, config);

    // Initialize chat manager
    chatManager = new ChatParticipantManager(
        mcpClient,
        conversationStore,
        contextAnalyzer,
        commandLineManager
    );
}

function registerChatParticipants(context: vscode.ExtensionContext) {
    console.log('Registering chat participants...');

    // Register claude-research participant
    const claudeResearchParticipant = vscode.chat.createChatParticipant(
        'claude-research',
        async (request, context, stream, token) => {
            return chatManager.handleChatRequest('claude-research', request, context, stream, token);
        }
    );
    claudeResearchParticipant.iconPath = new vscode.ThemeIcon('brain');

    // Register kiro participant
    const kiroParticipant = vscode.chat.createChatParticipant(
        'kiro',
        async (request, context, stream, token) => {
            return chatManager.handleChatRequest('kiro', request, context, stream, token);
        }
    );
    kiroParticipant.iconPath = new vscode.ThemeIcon('tools');

    // Add to subscriptions for proper cleanup
    context.subscriptions.push(claudeResearchParticipant, kiroParticipant);

    console.log('Chat participants registered successfully');
}

function registerCommands(context: vscode.ExtensionContext) {
    console.log('Registering commands...');

    // Test MCP connection command
    const testConnectionCommand = vscode.commands.registerCommand(
        'multiModelDebate.testMcpConnection',
        async () => {
            try {
                const isConnected = await mcpClient.testConnection();
                if (isConnected) {
                    vscode.window.showInformationMessage('✅ MCP Server connection successful!');
                } else {
                    vscode.window.showWarningMessage('⚠️ MCP Server not available. Using fallback mode.');
                }
            } catch (error) {
                vscode.window.showErrorMessage(
                    `❌ MCP Server connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    // Show conversation history command
    const showHistoryCommand = vscode.commands.registerCommand(
        'multiModelDebate.showConversationHistory',
        async () => {
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
        }
    );

    // Clear conversation history command
    const clearHistoryCommand = vscode.commands.registerCommand(
        'multiModelDebate.clearConversationHistory',
        async () => {
            const result = await vscode.window.showWarningMessage(
                'Clear all AI conversation history for this workspace?',
                { modal: true },
                'Clear History'
            );

            if (result === 'Clear History') {
                await conversationStore.clearHistory();
                vscode.window.showInformationMessage('AI conversation history cleared.');
            }
        }
    );

    // Add to subscriptions
    context.subscriptions.push(
        testConnectionCommand,
        showHistoryCommand,
        clearHistoryCommand
    );

    console.log('Commands registered successfully');
}

export function deactivate() {
    console.log('Multi-Model AI Collaboration extension deactivating...');

    // Cleanup resources
    if (mcpClient) {
        mcpClient.disconnect();
    }

    console.log('Multi-Model AI Collaboration extension deactivated');
}