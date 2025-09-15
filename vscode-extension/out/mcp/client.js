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
exports.MCPClient = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
class MCPClient {
    constructor(serverPath, config) {
        this.config = config;
        this.serverProcess = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.serverPort = 0; // Will be assigned dynamically
        this.serverPath = this.resolveMCPServerPath(serverPath);
    }
    resolveMCPServerPath(path) {
        // If path is relative, resolve from workspace root
        if (!path.startsWith('/') && !path.includes(':')) {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceRoot) {
                return `${workspaceRoot}/${path}`.replace(/\\/g, '/');
            }
        }
        return path;
    }
    async connect() {
        if (this.isConnected && this.serverProcess) {
            return true;
        }
        try {
            console.log(`Attempting to connect to MCP server: ${this.serverPath}`);
            // Start the MCP server process
            await this.startMCPServer();
            // Test the connection
            const connectionTest = await this.testConnection();
            if (connectionTest) {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                console.log('MCP server connected successfully');
                return true;
            }
            else {
                throw new Error('Connection test failed');
            }
        }
        catch (error) {
            console.error('Failed to connect to MCP server:', error);
            this.isConnected = false;
            // Try to reconnect if attempts remain
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                // Wait a bit before retrying
                await new Promise(resolve => setTimeout(resolve, 2000));
                return this.connect();
            }
            return false;
        }
    }
    async startMCPServer() {
        return new Promise((resolve, reject) => {
            // Kill existing process if any
            if (this.serverProcess) {
                this.serverProcess.kill();
            }
            // Determine the correct Python command
            const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
            // Start the MCP server
            console.log(`Starting MCP server: ${pythonCmd} ${this.serverPath}`);
            this.serverProcess = (0, child_process_1.spawn)(pythonCmd, [this.serverPath], {
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
                shell: true,
                stdio: 'pipe'
            });
            let startupOutput = '';
            let startupError = '';
            this.serverProcess.stdout?.on('data', (data) => {
                const output = data.toString();
                startupOutput += output;
                console.log('MCP Server stdout:', output);
                // Look for server ready indication
                if (output.includes('Ready for MCP client connections')) {
                    // Server is ready, now initialize the MCP protocol
                    this.initializeMCPProtocol().then(() => resolve()).catch(reject);
                }
            });
            this.serverProcess.stderr?.on('data', (data) => {
                const error = data.toString();
                startupError += error;
                console.log('MCP Server stderr:', error);
            });
            this.serverProcess.on('error', (error) => {
                console.error('MCP Server process error:', error);
                reject(error);
            });
            this.serverProcess.on('close', (code) => {
                console.log(`MCP Server process exited with code ${code}`);
                this.isConnected = false;
                this.serverProcess = null;
                if (code !== 0 && startupError) {
                    reject(new Error(`MCP Server failed to start: ${startupError}`));
                }
            });
            // Timeout after 10 seconds if no ready signal
            setTimeout(() => {
                if (this.serverProcess && !this.isConnected) {
                    console.log('MCP Server startup timeout, attempting initialization anyway');
                    this.initializeMCPProtocol().then(() => resolve()).catch(reject);
                }
            }, 10000);
        });
    }
    async initializeMCPProtocol() {
        if (!this.serverProcess) {
            throw new Error('No server process to initialize');
        }
        console.log('Initializing MCP protocol...');
        // Step 1: Send initialize request
        const initRequest = {
            jsonrpc: "2.0",
            id: "init",
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: {
                    name: "vscode-extension",
                    version: "0.1.0"
                }
            }
        };
        try {
            const initResponse = await this.sendRawMCPRequest(initRequest);
            console.log('MCP initialization response:', initResponse);
            if (initResponse.error) {
                throw new Error(`MCP initialization failed: ${initResponse.error.message}`);
            }
            // Step 2: Send initialized notification
            const initializedNotification = {
                jsonrpc: "2.0",
                method: "notifications/initialized",
                params: {}
            };
            await this.sendMCPNotification(initializedNotification);
            console.log('MCP protocol initialized successfully');
        }
        catch (error) {
            throw new Error(`MCP protocol initialization failed: ${error}`);
        }
    }
    async sendRawMCPRequest(request) {
        return new Promise((resolve, reject) => {
            if (!this.serverProcess) {
                reject(new Error('MCP server not running'));
                return;
            }
            const requestId = request.id;
            let responseData = '';
            let timeoutHandle;
            const cleanup = () => {
                if (timeoutHandle)
                    clearTimeout(timeoutHandle);
                this.serverProcess?.stdout?.off('data', onData);
            };
            timeoutHandle = setTimeout(() => {
                cleanup();
                reject(new Error(`MCP request timeout: ${requestId}`));
            }, 10000);
            const onData = (data) => {
                const chunk = data.toString();
                responseData += chunk;
                const lines = responseData.split('\n');
                for (const line of lines) {
                    if (line.trim() && line.includes(requestId)) {
                        try {
                            const response = JSON.parse(line);
                            if (response.id === requestId) {
                                cleanup();
                                resolve(response);
                                return;
                            }
                        }
                        catch (parseError) {
                            // Continue looking
                        }
                    }
                }
            };
            this.serverProcess.stdout?.on('data', onData);
            const requestLine = JSON.stringify(request) + '\n';
            console.log('Sending MCP request:', requestLine.trim());
            this.serverProcess.stdin?.write(requestLine);
        });
    }
    async sendMCPNotification(notification) {
        if (!this.serverProcess) {
            throw new Error('MCP server not running');
        }
        const notificationLine = JSON.stringify(notification) + '\n';
        console.log('Sending MCP notification:', notificationLine.trim());
        this.serverProcess.stdin?.write(notificationLine);
        // Small delay to ensure notification is processed
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    async testConnection() {
        try {
            if (!this.serverProcess) {
                return false;
            }
            // Check if process is still running
            if (this.serverProcess.exitCode !== null) {
                return false;
            }
            // Try to send a simple MCP request to test connectivity
            try {
                await this.sendMCPRequest('read_discussion', { limit: 1 });
                return true;
            }
            catch (error) {
                console.log('MCP server process running but not responding to requests:', error);
                // Process is running but might still be starting up
                return this.serverProcess.exitCode === null;
            }
        }
        catch (error) {
            console.error('MCP connection test failed:', error);
            return false;
        }
    }
    async contribute(request) {
        if (!this.isConnected) {
            const connected = await this.connect();
            if (!connected) {
                throw new Error('Could not connect to MCP server');
            }
        }
        try {
            // For the prototype, we'll use a simplified approach
            // In a real implementation, this would use the MCP protocol
            const response = await this.sendMCPRequest('contribute', request);
            return response;
        }
        catch (error) {
            console.error('MCP contribute request failed:', error);
            // Try to reconnect and retry once
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.isConnected = false;
                const reconnected = await this.connect();
                if (reconnected) {
                    return this.sendMCPRequest('contribute', request);
                }
            }
            throw new Error(`MCP request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async sendAIToAIMessage(request) {
        if (!this.isConnected) {
            const connected = await this.connect();
            if (!connected) {
                throw new Error('Could not connect to MCP server');
            }
        }
        try {
            // Create an enhanced request for AI-to-AI communication
            const enhancedRequest = {
                message: `[AI-to-AI Communication] From: ${request.fromPersona} | To: ${request.toPersona} | Type: ${request.interactionType}\n\nContext from conversation thread:\n${this.formatConversationContext(request.conversationContext)}\n\nMessage: ${request.message}`,
                persona: request.toPersona,
                vscode_context: this.createMinimalContext(),
                conversation_history: request.conversationContext,
                workspace: vscode.workspace.name,
                timestamp: new Date().toISOString()
            };
            const response = await this.sendMCPRequest('contribute', enhancedRequest);
            return response;
        }
        catch (error) {
            console.error('AI-to-AI MCP request failed:', error);
            throw new Error(`AI-to-AI communication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    formatConversationContext(context) {
        if (!context || context.length === 0) {
            return "No previous conversation context.";
        }
        return context.map(entry => `${entry.persona}: ${entry.message}\nResponse: ${entry.response}`).join('\n\n');
    }
    createMinimalContext() {
        // Create a minimal context for AI-to-AI communication
        // This avoids overwhelming the AI with irrelevant VS Code context
        return {
            activeFile: undefined,
            workspace: {
                name: vscode.workspace.name || 'Unknown',
                rootPath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
                openFiles: [],
                recentFiles: []
            },
            git: undefined,
            diagnostics: [],
            debugging: undefined,
            terminal: undefined,
            timestamp: new Date().toISOString()
        };
    }
    async sendMCPRequest(method, params) {
        const requestId = Math.random().toString(36).substr(2, 9);
        const mcpRequest = {
            jsonrpc: "2.0",
            id: requestId,
            method: `tools/call`,
            params: {
                name: method,
                arguments: params
            }
        };
        try {
            const response = await this.sendRawMCPRequest(mcpRequest);
            if (response.error) {
                throw new Error(`MCP Error: ${response.error.message}`);
            }
            if (response.result) {
                // Extract text content from MCP response
                const content = response.result.content;
                if (Array.isArray(content) && content[0]?.text) {
                    return content[0].text;
                }
                else {
                    return JSON.stringify(response.result);
                }
            }
            return 'No response content';
        }
        catch (error) {
            throw new Error(`MCP request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    extractResponseFromOutput(output) {
        // Simple extraction logic for prototype
        // In real implementation, would parse MCP JSON-RPC responses
        const lines = output.split('\n');
        const responseLines = [];
        let capturing = false;
        for (const line of lines) {
            if (line.includes('AI_RESPONSE_START')) {
                capturing = true;
                continue;
            }
            if (line.includes('AI_RESPONSE_END')) {
                capturing = false;
                break;
            }
            if (capturing) {
                responseLines.push(line);
            }
        }
        if (responseLines.length > 0) {
            return responseLines.join('\n').trim();
        }
        // Fallback: look for any substantial text in the output
        const meaningfulLines = lines.filter(line => line.trim().length > 10 &&
            !line.includes('DEBUG') &&
            !line.includes('INFO') &&
            !line.includes('MCP Server'));
        if (meaningfulLines.length > 0) {
            return meaningfulLines.join('\n').trim();
        }
        return 'Response received but could not be parsed';
    }
    async readDiscussion() {
        if (!this.isConnected) {
            await this.connect();
        }
        try {
            const response = await this.sendMCPRequest('read_discussion', { limit: 10 });
            // Parse response to extract messages
            return [response];
        }
        catch (error) {
            console.error('Failed to read discussion:', error);
            return [];
        }
    }
    async getConversationContext() {
        if (!this.isConnected) {
            await this.connect();
        }
        try {
            const response = await this.sendMCPRequest('get_conversation_context', {});
            return JSON.parse(response);
        }
        catch (error) {
            console.error('Failed to get conversation context:', error);
            return {};
        }
    }
    disconnect() {
        if (this.serverProcess) {
            console.log('Disconnecting from MCP server');
            this.serverProcess.kill();
            this.serverProcess = null;
        }
        this.isConnected = false;
        this.reconnectAttempts = 0;
    }
    // Utility method for fallback behavior
    async getHealthStatus() {
        const serverRunning = this.serverProcess !== null && this.serverProcess.exitCode === null;
        const connected = this.isConnected && serverRunning;
        return {
            connected,
            serverRunning,
            lastError: connected ? undefined : 'MCP server not available'
        };
    }
    // Method to check if Mattermost fallback should be used
    shouldUseMattermostFallback() {
        const fallbackEnabled = this.config.get('enableMattermostFallback', true);
        return fallbackEnabled && !this.isConnected;
    }
}
exports.MCPClient = MCPClient;
//# sourceMappingURL=client.js.map