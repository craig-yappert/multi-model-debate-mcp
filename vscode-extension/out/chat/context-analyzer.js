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
exports.ContextAnalyzer = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
class ContextAnalyzer {
    constructor(config) {
        this.config = config;
        this.maxContextSize = config.get('maxContextSize', 8000);
        this.enabled = config.get('contextGatheringEnabled', true);
    }
    async gatherContext() {
        if (!this.enabled) {
            return {
                diagnostics: [],
                timestamp: new Date().toISOString()
            };
        }
        const context = {
            timestamp: new Date().toISOString(),
            diagnostics: []
        };
        try {
            // Gather all context in parallel for performance
            await Promise.allSettled([
                this.gatherActiveFileContext(context),
                this.gatherWorkspaceContext(context),
                this.gatherGitContext(context),
                this.gatherDiagnosticContext(context),
                this.gatherDebuggingContext(context),
                this.gatherTerminalContext(context)
            ]);
        }
        catch (error) {
            console.warn('Error gathering VS Code context:', error);
        }
        return context;
    }
    async gatherActiveFileContext(context) {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }
        const document = activeEditor.document;
        let content = document.getText();
        // Truncate content if too large
        if (content.length > this.maxContextSize) {
            // Try to get content around cursor position
            const cursorLine = activeEditor.selection.active.line;
            const totalLines = document.lineCount;
            const startLine = Math.max(0, cursorLine - 50);
            const endLine = Math.min(totalLines, cursorLine + 50);
            const range = new vscode.Range(startLine, 0, endLine, 0);
            content = document.getText(range);
            if (content.length > this.maxContextSize) {
                content = content.substring(0, this.maxContextSize) + '\n... (truncated)';
            }
        }
        context.activeFile = {
            path: document.fileName,
            content: content,
            selectedText: document.getText(activeEditor.selection),
            cursorPosition: activeEditor.selection.active,
            language: document.languageId,
            lineCount: document.lineCount
        };
    }
    async gatherWorkspaceContext(context) {
        const workspace = vscode.workspace;
        if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
            return;
        }
        const openFiles = vscode.workspace.textDocuments
            .map(doc => doc.fileName)
            .filter(path => !path.includes('extension-output'))
            .slice(0, 20); // Limit to avoid overwhelming context
        // Get recently opened files from VS Code's recent list
        const recentFiles = await this.getRecentFiles();
        context.workspace = {
            name: workspace.name || 'Unknown',
            rootPath: workspace.workspaceFolders[0].uri.fsPath,
            openFiles,
            recentFiles
        };
    }
    async getRecentFiles() {
        // This is a simplified version - VS Code doesn't expose recent files directly
        // In practice, we might track this ourselves or use workspace file changes
        return vscode.workspace.textDocuments
            .filter(doc => doc.isDirty || doc.isUntitled)
            .map(doc => doc.fileName)
            .slice(0, 10);
    }
    async gatherGitContext(context) {
        try {
            const workspace = vscode.workspace.workspaceFolders?.[0];
            if (!workspace) {
                return;
            }
            const gitInfo = await Promise.all([
                this.executeGitCommand('branch --show-current', workspace.uri.fsPath),
                this.executeGitCommand('status --porcelain', workspace.uri.fsPath),
                this.executeGitCommand('log --oneline -5', workspace.uri.fsPath)
            ]);
            context.git = {
                branch: gitInfo[0].trim() || 'unknown',
                hasChanges: gitInfo[1].trim().length > 0,
                status: gitInfo[1].trim(),
                recentCommits: gitInfo[2].split('\n').filter(line => line.trim())
            };
        }
        catch (error) {
            console.warn('Error gathering git context:', error);
            context.git = {
                branch: 'unknown',
                hasChanges: false,
                status: '',
                recentCommits: []
            };
        }
    }
    async executeGitCommand(command, cwd) {
        return new Promise((resolve, reject) => {
            const process = (0, child_process_1.spawn)('git', command.split(' '), { cwd, shell: true });
            let stdout = '';
            let stderr = '';
            process.stdout?.on('data', (data) => {
                stdout += data.toString();
            });
            process.stderr?.on('data', (data) => {
                stderr += data.toString();
            });
            process.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                }
                else {
                    reject(new Error(`Git command failed: ${stderr}`));
                }
            });
            process.on('error', (error) => {
                reject(error);
            });
            // Timeout after 5 seconds
            setTimeout(() => {
                process.kill();
                reject(new Error('Git command timed out'));
            }, 5000);
        });
    }
    async gatherDiagnosticContext(context) {
        const diagnostics = [];
        // Get diagnostics for all open documents
        for (const document of vscode.workspace.textDocuments) {
            const docDiagnostics = vscode.languages.getDiagnostics(document.uri);
            for (const diagnostic of docDiagnostics) {
                diagnostics.push({
                    file: document.fileName,
                    severity: this.getSeverityString(diagnostic.severity),
                    message: diagnostic.message,
                    line: diagnostic.range.start.line + 1,
                    source: diagnostic.source || 'unknown'
                });
            }
        }
        // Limit diagnostics to avoid overwhelming context
        context.diagnostics = diagnostics.slice(0, 20);
    }
    getSeverityString(severity) {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error:
                return 'error';
            case vscode.DiagnosticSeverity.Warning:
                return 'warning';
            case vscode.DiagnosticSeverity.Information:
                return 'info';
            case vscode.DiagnosticSeverity.Hint:
                return 'hint';
            default:
                return 'unknown';
        }
    }
    async gatherDebuggingContext(context) {
        const debugSession = vscode.debug.activeDebugSession;
        context.debugging = {
            isActive: !!debugSession,
            breakpoints: vscode.debug.breakpoints.length
        };
        if (debugSession) {
            try {
                // Try to get some debugging information
                // Note: Access to variables and call stack is limited in VS Code API
                context.debugging.variables = ['Debug session active - variables not accessible'];
                context.debugging.callStack = ['Debug session active - call stack not accessible'];
            }
            catch (error) {
                console.warn('Error gathering debugging context:', error);
            }
        }
    }
    async gatherTerminalContext(context) {
        // VS Code doesn't provide direct access to terminal output
        // This would need to be implemented through terminal integration
        // For now, we'll just indicate if terminals are active
        context.terminal = {
            recentOutput: 'Terminal output not accessible via API',
            activeShell: process.platform === 'win32' ? 'cmd/powershell' : 'bash/zsh'
        };
    }
    // Utility method to format context for debugging
    formatContextSummary(context) {
        const parts = [];
        if (context.activeFile) {
            parts.push(`📄 File: ${context.activeFile.path} (${context.activeFile.language})`);
        }
        if (context.workspace) {
            parts.push(`📁 Workspace: ${context.workspace.name}`);
        }
        if (context.git) {
            parts.push(`🔀 Git: ${context.git.branch} ${context.git.hasChanges ? '(changes)' : '(clean)'}`);
        }
        if (context.diagnostics.length > 0) {
            const errors = context.diagnostics.filter(d => d.severity === 'error').length;
            const warnings = context.diagnostics.filter(d => d.severity === 'warning').length;
            parts.push(`⚠️ Issues: ${errors} errors, ${warnings} warnings`);
        }
        if (context.debugging?.isActive) {
            parts.push(`🐛 Debugging: Active (${context.debugging.breakpoints} breakpoints)`);
        }
        return parts.join(' | ');
    }
}
exports.ContextAnalyzer = ContextAnalyzer;
//# sourceMappingURL=context-analyzer.js.map