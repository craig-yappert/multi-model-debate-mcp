import * as vscode from 'vscode';

/**
 * Mattermost Fallback Handler
 *
 * Provides graceful fallback to Mattermost when MCP server is unavailable.
 * This ensures continuity of AI collaboration even during technical issues.
 */
export class MattermostFallback {
    private enabled: boolean;

    constructor(private config: vscode.WorkspaceConfiguration) {
        this.enabled = config.get<boolean>('enableMattermostFallback', true);
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Provide fallback response when MCP server is unavailable
     */
    getFallbackResponse(persona: string, error: any): string {
        if (!this.enabled) {
            return this.getDisabledFallbackMessage(error);
        }

        return this.getMattermostFallbackMessage(persona, error);
    }

    private getDisabledFallbackMessage(error: any): string {
        return `I'm temporarily unavailable due to a connection issue. Please check the MCP server connection or contact your team.

**Error Details**: ${error instanceof Error ? error.message : 'Unknown error'}

**Troubleshooting Steps**:
1. Use the "Test MCP Server Connection" command
2. Check that Python and dependencies are installed
3. Verify the MCP server path in settings
4. Try restarting VS Code`;
    }

    private getMattermostFallbackMessage(persona: string, error: any): string {
        const personaName = this.getPersonaDisplayName(persona);
        const mattermostInstructions = this.getMattermostInstructions();

        return `${personaName} is temporarily unavailable due to a connection issue. You can continue the conversation using Mattermost as a fallback.

**What happened**: ${error instanceof Error ? error.message : 'MCP server connection failed'}

**Continue in Mattermost**:
${mattermostInstructions}

**Or troubleshoot the connection**:
1. Use the "Test MCP Server Connection" command
2. Check that the MCP server is running
3. Verify ANTHROPIC_API_KEY is set in your .env file
4. Try restarting VS Code

Once the connection is restored, you can continue using @${persona} directly in VS Code with full code context awareness.`;
    }

    private getMattermostInstructions(): string {
        return `1. Open your Mattermost team chat
2. Navigate to the debate channel
3. Ask your question and mention team members
4. AI personas will respond in the channel

Note: Mattermost mode doesn't have access to your current VS Code context (file content, errors, debugging state). You'll need to provide context manually.`;
    }

    private getPersonaDisplayName(persona: string): string {
        switch (persona) {
            case 'claude-research':
                return 'Claude Research 🧠';
            case 'kiro':
                return 'Kiro 🔧';
            default:
                return persona;
        }
    }

    /**
     * Create actionable buttons for fallback scenarios
     */
    async handleFallbackActions(stream: vscode.ChatResponseStream): Promise<void> {
        if (!this.enabled) {
            // Only show troubleshooting options if Mattermost fallback is disabled
            stream.button({
                command: 'multiModelDebate.testMcpConnection',
                title: '🔧 Test MCP Connection'
            });
            return;
        }

        // Show both Mattermost fallback and troubleshooting options
        stream.markdown('\n**Available Actions:**\n');

        // Button to open Mattermost (if available)
        stream.button({
            command: 'vscode.open',
            title: '💬 Open Mattermost (External)',
            arguments: ['https://localhost:8065'] // Default Mattermost URL
        });

        // Button to test MCP connection
        stream.button({
            command: 'multiModelDebate.testMcpConnection',
            title: '🔧 Test MCP Connection'
        });

        // Button to check settings
        stream.button({
            command: 'workbench.action.openSettings',
            title: '⚙️ Open Extension Settings',
            arguments: ['multiModelDebate']
        });
    }

    /**
     * Check if Mattermost server is accessible
     */
    async checkMattermostAvailability(): Promise<boolean> {
        try {
            // This is a simplified check - in practice, might ping Mattermost API
            // For now, we'll assume Mattermost is available if fallback is enabled
            return this.enabled;
        } catch (error) {
            console.warn('Mattermost availability check failed:', error);
            return false;
        }
    }

    /**
     * Get status information for display
     */
    async getStatus(): Promise<{
        fallbackEnabled: boolean;
        mattermostAvailable: boolean;
        recommendedAction: string;
    }> {
        const mattermostAvailable = await this.checkMattermostAvailability();

        let recommendedAction = 'Fix MCP server connection';

        if (this.enabled && mattermostAvailable) {
            recommendedAction = 'Use Mattermost fallback while troubleshooting';
        } else if (this.enabled && !mattermostAvailable) {
            recommendedAction = 'Enable Mattermost server or fix MCP connection';
        }

        return {
            fallbackEnabled: this.enabled,
            mattermostAvailable,
            recommendedAction
        };
    }

    /**
     * Update configuration
     */
    async setEnabled(enabled: boolean): Promise<void> {
        await this.config.update('enableMattermostFallback', enabled, vscode.ConfigurationTarget.Workspace);
        this.enabled = enabled;
    }

    /**
     * Show fallback configuration prompt
     */
    async promptFallbackConfiguration(): Promise<void> {
        if (this.enabled) {
            return; // Already configured
        }

        const result = await vscode.window.showInformationMessage(
            'MCP server connection failed. Would you like to enable Mattermost fallback for future issues?',
            'Enable Fallback',
            'Keep Disabled',
            'Configure Later'
        );

        switch (result) {
            case 'Enable Fallback':
                await this.setEnabled(true);
                vscode.window.showInformationMessage('Mattermost fallback enabled. You can disable it in settings anytime.');
                break;
            case 'Keep Disabled':
                // User choice to keep disabled
                break;
            case 'Configure Later':
                vscode.window.showInformationMessage('You can enable Mattermost fallback in extension settings.');
                break;
        }
    }
}