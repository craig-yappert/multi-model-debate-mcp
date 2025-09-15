import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

export interface CommandExecutionResult {
    success: boolean;
    output: string;
    error?: string;
    exitCode?: number;
    duration: number;
}

export interface CommandSuggestion {
    command: string;
    description: string;
    riskLevel: 'low' | 'medium' | 'high';
    category: 'build' | 'test' | 'git' | 'npm' | 'file' | 'other';
}

export class CommandLineManager {
    private enabled: boolean;
    private runningCommands: Map<string, ChildProcess> = new Map();

    constructor(private config: vscode.WorkspaceConfiguration) {
        this.enabled = config.get<boolean>('enableCommandLineAccess', true);
        this.registerCommands();
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    private registerCommands() {
        // Register command to execute AI-suggested commands
        vscode.commands.registerCommand('multiModelDebate.executeCommand', async (command: string) => {
            await this.executeCommandWithConfirmation(command);
        });

        // Register command to show command history
        vscode.commands.registerCommand('multiModelDebate.showCommandHistory', async () => {
            await this.showCommandHistory();
        });

        // Register command to kill running command
        vscode.commands.registerCommand('multiModelDebate.killCommand', async (commandId: string) => {
            await this.killCommand(commandId);
        });
    }

    async executeCommandWithConfirmation(command: string): Promise<void> {
        if (!this.enabled) {
            vscode.window.showWarningMessage('Command execution is disabled in settings.');
            return;
        }

        const suggestion = this.analyzeCommand(command);
        const confirmationMessage = this.getConfirmationMessage(suggestion);

        // Show confirmation dialog with risk assessment
        const result = await vscode.window.showWarningMessage(
            confirmationMessage,
            { modal: true },
            'Execute',
            'Copy to Terminal',
            'Cancel'
        );

        switch (result) {
            case 'Execute':
                await this.executeCommand(command);
                break;
            case 'Copy to Terminal':
                await this.copyToTerminal(command);
                break;
            default:
                // User cancelled
                break;
        }
    }

    private analyzeCommand(command: string): CommandSuggestion {
        const cmd = command.toLowerCase().trim();

        // Determine risk level and category
        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        let category: CommandSuggestion['category'] = 'other';

        // High risk commands
        if (this.isHighRiskCommand(cmd)) {
            riskLevel = 'high';
        }
        // Medium risk commands
        else if (this.isMediumRiskCommand(cmd)) {
            riskLevel = 'medium';
        }

        // Categorize command
        category = this.categorizeCommand(cmd);

        return {
            command,
            description: this.getCommandDescription(cmd),
            riskLevel,
            category
        };
    }

    private isHighRiskCommand(cmd: string): boolean {
        const highRiskPatterns = [
            /^rm\s+-rf/,           // Recursive force remove
            /^sudo/,               // Sudo commands
            /^dd\s+/,              // Disk destroyer
            />\s*\/dev\/sd/,       // Writing to disk devices
            /^mkfs/,               // Format filesystem
            /^fdisk/,              // Partition manipulation
            /\|\s*sh$/,            // Piping to shell
            /curl.*\|\s*bash/,     // Download and execute
            /wget.*\|\s*bash/,     // Download and execute
            /^chmod\s+777/,        // Overly permissive permissions
        ];

        return highRiskPatterns.some(pattern => pattern.test(cmd));
    }

    private isMediumRiskCommand(cmd: string): boolean {
        const mediumRiskPatterns = [
            /^rm\s+/,              // Remove commands
            /^mv\s+.*\s+\//,       // Move to system directories
            /^cp\s+.*\s+\//,       // Copy to system directories
            /^chmod/,              // Permission changes
            /^chown/,              // Ownership changes
            /^npm\s+install\s+-g/, // Global npm installs
            /^pip\s+install/,      // Python package installs
            /^docker\s+run/,       // Docker execution
            /^git\s+reset\s+--hard/, // Git hard reset
            /^git\s+clean\s+-fd/,  // Git clean force
        ];

        return mediumRiskPatterns.some(pattern => pattern.test(cmd));
    }

    private categorizeCommand(cmd: string): CommandSuggestion['category'] {
        if (cmd.match(/^(npm|yarn|pnpm)/)) return 'npm';
        if (cmd.match(/^git\s+/)) return 'git';
        if (cmd.match(/^(pytest|npm\s+test|yarn\s+test|cargo\s+test)/)) return 'test';
        if (cmd.match(/^(npm\s+run\s+build|yarn\s+build|cargo\s+build|make)/)) return 'build';
        if (cmd.match(/^(ls|cd|mkdir|rm|cp|mv|pwd)/)) return 'file';
        return 'other';
    }

    private getCommandDescription(cmd: string): string {
        if (cmd.startsWith('npm install')) return 'Install npm dependencies';
        if (cmd.startsWith('npm run')) return 'Run npm script';
        if (cmd.startsWith('git add')) return 'Stage files for commit';
        if (cmd.startsWith('git commit')) return 'Create git commit';
        if (cmd.startsWith('git push')) return 'Push changes to remote';
        if (cmd.startsWith('pytest')) return 'Run Python tests';
        if (cmd.startsWith('ls')) return 'List directory contents';
        if (cmd.startsWith('cd')) return 'Change directory';
        return 'Execute command';
    }

    private getConfirmationMessage(suggestion: CommandSuggestion): string {
        const riskEmoji = suggestion.riskLevel === 'high' ? '🚨' : suggestion.riskLevel === 'medium' ? '⚠️' : '✅';

        return `${riskEmoji} Execute this command?\n\nCommand: ${suggestion.command}\nDescription: ${suggestion.description}\nRisk Level: ${suggestion.riskLevel.toUpperCase()}\nCategory: ${suggestion.category}`;
    }

    private async executeCommand(command: string): Promise<CommandExecutionResult> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const commandId = `cmd-${Date.now()}`;

            // Determine shell and command based on platform
            const isWindows = process.platform === 'win32';
            const shell = isWindows ? 'cmd' : 'bash';
            const shellArgs = isWindows ? ['/c', command] : ['-c', command];

            // Show progress notification
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Executing: ${command}`,
                cancellable: true
            }, async (progress, token) => {
                return new Promise<void>((progressResolve) => {
                    const process = spawn(shell, shellArgs, {
                        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
                        shell: true
                    });

                    this.runningCommands.set(commandId, process);

                    let output = '';
                    let errorOutput = '';

                    process.stdout?.on('data', (data) => {
                        const chunk = data.toString();
                        output += chunk;
                        progress.report({ message: `Output: ${chunk.slice(-50)}...` });
                    });

                    process.stderr?.on('data', (data) => {
                        const chunk = data.toString();
                        errorOutput += chunk;
                        progress.report({ message: `Error: ${chunk.slice(-50)}...` });
                    });

                    process.on('close', (code) => {
                        this.runningCommands.delete(commandId);
                        const duration = Date.now() - startTime;
                        const success = code === 0;

                        const result: CommandExecutionResult = {
                            success,
                            output: output.trim(),
                            error: errorOutput.trim() || undefined,
                            exitCode: code || undefined,
                            duration
                        };

                        // Show result
                        this.showCommandResult(command, result);
                        resolve(result);
                        progressResolve();
                    });

                    // Handle cancellation
                    token.onCancellationRequested(() => {
                        process.kill();
                        this.runningCommands.delete(commandId);
                        progressResolve();
                    });
                });
            });
        });
    }

    private async copyToTerminal(command: string): Promise<void> {
        // Get or create terminal
        let terminal = vscode.window.activeTerminal;
        if (!terminal) {
            terminal = vscode.window.createTerminal('AI Command');
        }

        // Show terminal and send command
        terminal.show();
        terminal.sendText(command, false); // Don't execute automatically

        vscode.window.showInformationMessage(`Command copied to terminal: ${command}`);
    }

    private async killCommand(commandId: string): Promise<void> {
        const process = this.runningCommands.get(commandId);
        if (process) {
            process.kill();
            this.runningCommands.delete(commandId);
            vscode.window.showInformationMessage(`Killed command: ${commandId}`);
        }
    }

    private showCommandResult(command: string, result: CommandExecutionResult): void {
        const statusIcon = result.success ? '✅' : '❌';
        const duration = (result.duration / 1000).toFixed(1);

        if (result.success) {
            if (result.output) {
                // Show output in a new document for longer outputs
                if (result.output.length > 500) {
                    this.showOutputDocument(command, result);
                } else {
                    vscode.window.showInformationMessage(
                        `${statusIcon} Command completed (${duration}s): ${result.output.slice(0, 100)}...`
                    );
                }
            } else {
                vscode.window.showInformationMessage(
                    `${statusIcon} Command completed successfully (${duration}s)`
                );
            }
        } else {
            vscode.window.showErrorMessage(
                `${statusIcon} Command failed (${duration}s): ${result.error || 'Unknown error'}`,
                'Show Details'
            ).then(selection => {
                if (selection === 'Show Details') {
                    this.showOutputDocument(command, result);
                }
            });
        }
    }

    private async showOutputDocument(command: string, result: CommandExecutionResult): Promise<void> {
        const content = [
            `# Command Execution Result`,
            ``,
            `**Command:** \`${command}\``,
            `**Status:** ${result.success ? '✅ Success' : '❌ Failed'}`,
            `**Duration:** ${(result.duration / 1000).toFixed(1)}s`,
            `**Exit Code:** ${result.exitCode}`,
            ``,
            `## Output`,
            `\`\`\``,
            result.output || '(no output)',
            `\`\`\``,
            ``
        ];

        if (result.error) {
            content.push(
                `## Error`,
                `\`\`\``,
                result.error,
                `\`\`\``
            );
        }

        const doc = await vscode.workspace.openTextDocument({
            content: content.join('\n'),
            language: 'markdown'
        });

        vscode.window.showTextDocument(doc);
    }

    private async showCommandHistory(): Promise<void> {
        // This would show a history of executed commands
        // For now, just show a placeholder
        vscode.window.showInformationMessage('Command history feature coming soon!');
    }

    // Method to check if command execution is available
    async testCommandExecution(): Promise<boolean> {
        try {
            const result = await this.executeSimpleTest();
            return result.success;
        } catch (error) {
            console.error('Command execution test failed:', error);
            return false;
        }
    }

    private async executeSimpleTest(): Promise<CommandExecutionResult> {
        const testCommand = process.platform === 'win32' ? 'echo test' : 'echo test';
        return this.executeCommand(testCommand);
    }
}