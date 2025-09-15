#!/usr/bin/env node

/**
 * Direct test of MCP server communication to debug the connection issue
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing Direct MCP Server Communication\n');

async function testMCPServer() {
    const mcpServerPath = '../src/mcp_server.py';

    console.log(`Starting MCP server: python ${mcpServerPath}`);

    const serverProcess = spawn('python', [mcpServerPath], {
        cwd: __dirname,
        stdio: 'pipe',
        shell: true
    });

    let startupOutput = '';
    let errorOutput = '';

    // Collect initial output
    const startupPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            console.log('✅ Server started (timeout reached)');
            resolve(true);
        }, 5000);

        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            startupOutput += output;
            console.log('📤 Server stdout:', output.trim());

            if (output.includes('Server started') || output.includes('MCP Server running')) {
                clearTimeout(timeout);
                resolve(true);
            }
        });

        serverProcess.stderr.on('data', (data) => {
            const error = data.toString();
            errorOutput += error;
            console.log('📥 Server stderr:', error.trim());
        });

        serverProcess.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });

        serverProcess.on('close', (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
                reject(new Error(`Server exited with code ${code}: ${errorOutput}`));
            }
        });
    });

    try {
        await startupPromise;
        console.log('✅ MCP Server appears to be running');

        // Test MCP initialization
        console.log('\n🔌 Testing MCP initialization...');

        const initRequest = {
            jsonrpc: "2.0",
            id: "init-1",
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: {
                    name: "vscode-extension-test",
                    version: "0.1.0"
                }
            }
        };

        const testResponse = await sendMCPRequest(serverProcess, initRequest);
        console.log('📋 Init response:', testResponse);

        // Test tools list
        console.log('\n🛠️ Testing tools list...');

        const toolsRequest = {
            jsonrpc: "2.0",
            id: "tools-1",
            method: "tools/list",
            params: {}
        };

        const toolsResponse = await sendMCPRequest(serverProcess, toolsRequest);
        console.log('📋 Tools response:', toolsResponse);

        // Test a tool call
        console.log('\n💬 Testing read_discussion tool...');

        const readRequest = {
            jsonrpc: "2.0",
            id: "read-1",
            method: "tools/call",
            params: {
                name: "read_discussion",
                arguments: { limit: 1 }
            }
        };

        const readResponse = await sendMCPRequest(serverProcess, readRequest);
        console.log('📋 Read response:', readResponse);

    } catch (error) {
        console.error('❌ Error testing MCP server:', error);
    } finally {
        console.log('\n🛑 Stopping server...');
        serverProcess.kill();
    }
}

function sendMCPRequest(serverProcess, request) {
    return new Promise((resolve, reject) => {
        const requestId = request.id;
        let responseData = '';

        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error(`Request ${requestId} timed out`));
        }, 10000);

        const cleanup = () => {
            clearTimeout(timeout);
            serverProcess.stdout.off('data', onData);
        };

        const onData = (data) => {
            const chunk = data.toString();
            responseData += chunk;
            console.log(`📨 Raw response chunk: ${chunk.trim()}`);

            // Look for complete JSON response
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
                    } catch (parseError) {
                        // Continue looking
                    }
                }
            }
        };

        serverProcess.stdout.on('data', onData);

        // Send request
        const requestLine = JSON.stringify(request) + '\n';
        console.log(`📤 Sending request: ${requestLine.trim()}`);
        serverProcess.stdin.write(requestLine);
    });
}

// Run the test
testMCPServer().catch(console.error);