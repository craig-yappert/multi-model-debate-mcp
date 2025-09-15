#!/usr/bin/env node

/**
 * Test proper MCP initialization sequence
 */

const { spawn } = require('child_process');

console.log('🧪 Testing Proper MCP Initialization Sequence\n');

async function testProperMCP() {
    const mcpServerPath = '../src/mcp_server.py';

    console.log(`Starting MCP server: python ${mcpServerPath}`);

    const serverProcess = spawn('python', [mcpServerPath], {
        cwd: __dirname,
        stdio: 'pipe',
        shell: true
    });

    // Wait for server startup
    await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 3000);

        serverProcess.stderr.on('data', (data) => {
            const output = data.toString();
            console.log('📥 Server:', output.trim());
            if (output.includes('Ready for MCP client connections')) {
                clearTimeout(timeout);
                resolve();
            }
        });
    });

    console.log('✅ Server started, beginning proper MCP sequence...\n');

    try {
        // Step 1: Initialize
        console.log('🔌 Step 1: Initialize');
        const initRequest = {
            jsonrpc: "2.0",
            id: "init",
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: {
                    name: "vscode-test",
                    version: "0.1.0"
                }
            }
        };

        const initResponse = await sendRequest(serverProcess, initRequest);
        console.log('✅ Init response:', initResponse.result?.serverInfo);

        // Step 2: Initialized notification
        console.log('\n📢 Step 2: Send initialized notification');
        const initializedNotification = {
            jsonrpc: "2.0",
            method: "notifications/initialized",
            params: {}
        };

        sendNotification(serverProcess, initializedNotification);
        await new Promise(resolve => setTimeout(resolve, 200)); // Wait a bit

        console.log('✅ Initialized notification sent');

        // Step 3: List tools
        console.log('\n🛠️ Step 3: List available tools');
        const toolsRequest = {
            jsonrpc: "2.0",
            id: "tools",
            method: "tools/list",
            params: {}
        };

        const toolsResponse = await sendRequest(serverProcess, toolsRequest);
        console.log('✅ Available tools:', toolsResponse.result?.tools?.map(t => t.name));

        // Step 4: Test a tool call
        console.log('\n💬 Step 4: Test read_discussion tool');
        const readRequest = {
            jsonrpc: "2.0",
            id: "read",
            method: "tools/call",
            params: {
                name: "read_discussion",
                arguments: { limit: 1 }
            }
        };

        const readResponse = await sendRequest(serverProcess, readRequest);
        console.log('✅ Tool call response:', readResponse.result?.content?.[0]?.text?.slice(0, 100) + '...');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        serverProcess.kill();
        console.log('\n🛑 Server stopped');
    }
}

function sendRequest(serverProcess, request) {
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
                    } catch (e) {
                        // Continue
                    }
                }
            }
        };

        serverProcess.stdout.on('data', onData);

        const requestLine = JSON.stringify(request) + '\n';
        console.log(`📤 Sending: ${request.method}`);
        serverProcess.stdin.write(requestLine);
    });
}

function sendNotification(serverProcess, notification) {
    const notificationLine = JSON.stringify(notification) + '\n';
    console.log(`📤 Sending notification: ${notification.method}`);
    serverProcess.stdin.write(notificationLine);
}

testProperMCP().catch(console.error);