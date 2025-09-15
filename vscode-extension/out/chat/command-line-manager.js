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
exports.CommandLineManager = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
class CommandLineManager {
    constructor(config) {
        this.config = config;
        this.runningCommands = new Map();
        this.enabled = config.get('enableCommandLineAccess', true);
        this.registerCommands();
    }
    isEnabled() {
        return this.enabled;
    }
    registerCommands() {
        // Register command to execute AI-suggested commands
        vscode.commands.registerCommand('multiModelDebate.executeCommand', async (command) => {
            await this.executeCommandWithConfirmation(command);
        });
        // Register command to show command history
        vscode.commands.registerCommand('multiModelDebate.showCommandHistory', async () => {
            await this.showCommandHistory();
        });
        // Register command to kill running command
        vscode.commands.registerCommand('multiModelDebate.killCommand', async (commandId) => {
            await this.killCommand(commandId);
        });
    }
    async executeCommandWithConfirmation(command) {
        if (!this.enabled) {
            vscode.window.showWarningMessage('Command execution is disabled in settings.');
            return;
        }
        const suggestion = this.analyzeCommand(command);
        const confirmationMessage = this.getConfirmationMessage(suggestion);
        // Show confirmation dialog with risk assessment
        const result = await vscode.window.showWarningMessage(confirmationMessage, { modal: true }, 'Execute', 'Copy to Terminal', 'Cancel');
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
    analyzeCommand(command) {
        const cmd = command.toLowerCase().trim();
        // Determine risk level and category
        let riskLevel = 'low';
        let category = 'other';
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
    isHighRiskCommand(cmd) {
        const highRiskPatterns = [
            /^rm\s+-rf/,
            /^sudo/,
            /^dd\s+/,
            />\s*\/dev\/sd/,
            /^mkfs/,
            /^fdisk/,
            /\|\s*sh$/,
            /curl.*\|\s*bash/,
            /wget.*\|\s*bash/,
            /^chmod\s+777/, // Overly permissive permissions
        ];
        return highRiskPatterns.some(pattern => pattern.test(cmd));
    }
    isMediumRiskCommand(cmd) {
        const mediumRiskPatterns = [
            /^rm\s+/,
            /^mv\s+.*\s+\//,
            /^cp\s+.*\s+\//,
            /^chmod/,
            /^chown/,
            /^npm\s+install\s+-g/,
            /^pip\s+install/,
            /^docker\s+run/,
            /^git\s+reset\s+--hard/,
            /^git\s+clean\s+-fd/, // Git clean force
        ];
        return mediumRiskPatterns.some(pattern => pattern.test(cmd));
    }
    categorizeCommand(cmd) {
        if (cmd.match(/^(npm|yarn|pnpm)/))
            return 'npm';
        if (cmd.match(/^git\s+/))
            return 'git';
        if (cmd.match(/^(pytest|npm\s+test|yarn\s+test|cargo\s+test)/))
            return 'test';
        if (cmd.match(/^(npm\s+run\s+build|yarn\s+build|cargo\s+build|make)/))
            return 'build';
        if (cmd.match(/^(ls|cd|mkdir|rm|cp|mv|pwd)/))
            return 'file';
        return 'other';
    }
    getCommandDescription(cmd) {
        if (cmd.startsWith('npm install'))
            return 'Install npm dependencies';
        if (cmd.startsWith('npm run'))
            return 'Run npm script';
        if (cmd.startsWith('git add'))
            return 'Stage files for commit';
        if (cmd.startsWith('git commit'))
            return 'Create git commit';
        if (cmd.startsWith('git push'))
            return 'Push changes to remote';
        if (cmd.startsWith('pytest'))
            return 'Run Python tests';
        if (cmd.startsWith('ls'))
            return 'List directory contents';
        if (cmd.startsWith('cd'))
            return 'Change directory';
        return 'Execute command';
    }
    getConfirmationMessage(suggestion) {
        const riskEmoji = suggestion.riskLevel === 'high' ? '🚨' : suggestion.riskLevel === 'medium' ? '⚠️' : '✅';
        return `${riskEmoji} Execute this command?\n\nCommand: ${suggestion.command}\nDescription: ${suggestion.description}\nRisk Level: ${suggestion.riskLevel.toUpperCase()}\nCategory: ${suggestion.category}`;
    }
    async executeCommand(command) {
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
                return new Promise((progressResolve) => {
                    const process = (0, child_process_1.spawn)(shell, shellArgs, {
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
                        const result = {
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
    async copyToTerminal(command) {
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
    async killCommand(commandId) {
        const process = this.runningCommands.get(commandId);
        if (process) {
            process.kill();
            this.runningCommands.delete(commandId);
            vscode.window.showInformationMessage(`Killed command: ${commandId}`);
        }
    }
    showCommandResult(command, result) {
        const statusIcon = result.success ? '✅' : '❌';
        const duration = (result.duration / 1000).toFixed(1);
        if (result.success) {
            if (result.output) {
                // Show output in a new document for longer outputs
                if (result.output.length > 500) {
                    this.showOutputDocument(command, result);
                }
                else {
                    vscode.window.showInformationMessage(`${statusIcon} Command completed (${duration}s): ${result.output.slice(0, 100)}...`);
                }
            }
            else {
                vscode.window.showInformationMessage(`${statusIcon} Command completed successfully (${duration}s)`);
            }
        }
        else {
            vscode.window.showErrorMessage(`${statusIcon} Command failed (${duration}s): ${result.error || 'Unknown error'}`, 'Show Details').then(selection => {
                if (selection === 'Show Details') {
                    this.showOutputDocument(command, result);
                }
            });
        }
    }
    async showOutputDocument(command, result) {
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
            content.push(`## Error`, `\`\`\``, result.error, `\`\`\``);
        }
        const doc = await vscode.workspace.openTextDocument({
            content: content.join('\n'),
            language: 'markdown'
        });
        vscode.window.showTextDocument(doc);
    }
    async showCommandHistory() {
        // This would show a history of executed commands
        // For now, just show a placeholder
        vscode.window.showInformationMessage('Command history feature coming soon!');
    }
    // Method to check if command execution is available
    async testCommandExecution() {
        try {
            const result = await this.executeSimpleTest();
            return result.success;
        }
        catch (error) {
            console.error('Command execution test failed:', error);
            return false;
        }
    }
    async executeSimpleTest() {
        const testCommand = process.platform === 'win32' ? 'echo test' : 'echo test';
        return this.executeCommand(testCommand);
    }
}
exports.CommandLineManager = CommandLineManager;
//# sourceMappingURL=command-line-manager.js.map