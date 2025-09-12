# MCP Integration Guide for IDE Development

## MCP Protocol Overview

The Model Context Protocol (MCP) enables communication between IDEs and AI services through a standardized JSON-RPC interface over stdio.

## Integration Architecture

```
┌─────────────┐     stdio      ┌──────────────┐     HTTP      ┌────────────┐
│     IDE     │ <───────────>  │  MCP Server  │ <──────────>  │ Mattermost │
│   (Client)  │   JSON-RPC     │   (Python)   │    REST API   │   Server   │
└─────────────┘                └──────────────┘               └────────────┘
                                       │
                                       │ HTTP
                                       v
                                ┌──────────────┐
                                │Anthropic API │
                                └──────────────┘
```

## MCP Client Implementation

### 1. Initialization Sequence

```typescript
// Step 1: Send initialization request
const initRequest = {
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    protocolVersion: "2024-11-01",
    capabilities: {},
    clientInfo: {
      name: "your-ide",
      version: "1.0.0"
    }
  },
  id: 1
};

// Step 2: Send initialized notification (after receiving response)
const initializedNotification = {
  jsonrpc: "2.0",
  method: "notifications/initialized",
  params: {}
};

// Step 3: List available tools
const listToolsRequest = {
  jsonrpc: "2.0",
  method: "tools/list",
  params: {},
  id: 2
};
```

### 2. Tool Invocation

```typescript
interface ToolCallParams {
  name: string;
  arguments: Record<string, any>;
}

// Example: Contribute to discussion
const contributeRequest = {
  jsonrpc: "2.0",
  method: "tools/call",
  params: {
    name: "contribute",
    arguments: {
      message: "Your message here",
      persona: "claude-research" // or "kiro"
    }
  },
  id: 3
};

// Example: Read recent discussion
const readRequest = {
  jsonrpc: "2.0",
  method: "tools/call",
  params: {
    name: "read_discussion",
    arguments: {
      limit: 10
    }
  },
  id: 4
};

// Example: Get conversation context
const contextRequest = {
  jsonrpc: "2.0",
  method: "tools/call",
  params: {
    name: "get_conversation_context",
    arguments: {}
  },
  id: 5
};
```

## IDE Integration Components

### 1. MCP Client Manager

```typescript
class MCPClientManager {
  private process: ChildProcess;
  private messageQueue: Map<number, Promise<any>>;
  
  async connect(serverConfig: MCPServerConfig) {
    // Spawn MCP server process
    this.process = spawn(serverConfig.command, serverConfig.args, {
      cwd: serverConfig.cwd,
      env: process.env
    });
    
    // Setup stdio pipes
    this.setupMessageHandlers();
    
    // Initialize connection
    await this.initialize();
  }
  
  async callTool(toolName: string, args: any): Promise<any> {
    const id = this.nextId++;
    const request = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolName, arguments: args },
      id
    };
    
    return this.sendRequest(request);
  }
}
```

### 2. UI Components

```typescript
// Debate Panel Component
interface DebatePanelProps {
  messages: Message[];
  personas: string[];
  onSendMessage: (text: string, persona: string) => void;
}

// Message Display Component  
interface Message {
  author: string;
  content: string;
  timestamp: Date;
  persona?: string;
}

// Persona Selector
interface PersonaSelector {
  available: string[];
  selected: string;
  onChange: (persona: string) => void;
}
```

### 3. Command Palette Integration

```typescript
// Register commands for quick access
registerCommand('multimodel.contribute', async () => {
  const message = await showInputBox('Enter your message');
  const persona = await showQuickPick(['claude-research', 'kiro']);
  
  await mcpClient.callTool('contribute', {
    message,
    persona
  });
});

registerCommand('multimodel.readDiscussion', async () => {
  const result = await mcpClient.callTool('read_discussion', {
    limit: 20
  });
  
  showDebatePanel(result);
});
```

## Error Handling

### Connection Errors
```typescript
try {
  await mcpClient.connect(config);
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    showError('MCP server not running');
  } else if (error.code === 'EPIPE') {
    showError('MCP server crashed');
  }
}
```

### Protocol Errors
```typescript
// Handle JSON-RPC errors
if (response.error) {
  switch (response.error.code) {
    case -32602: // Invalid params
      showError(`Invalid parameters: ${response.error.message}`);
      break;
    case -32601: // Method not found
      showError(`Unknown method: ${response.error.message}`);
      break;
  }
}
```

## Configuration Schema

### IDE Settings
```json
{
  "multimodel.debate": {
    "serverPath": "path/to/main.py",
    "defaultPersona": "kiro",
    "autoRefresh": true,
    "refreshInterval": 5000,
    "showNotifications": true
  }
}
```

### MCP Server Config
```json
{
  "name": "multi-model-debate",
  "command": "python",
  "args": ["main.py"],
  "cwd": "C:/Users/cyapp/multi-model-debate/multi-model-debate-mcp",
  "env": {
    "PYTHONUNBUFFERED": "1"
  }
}
```

## Testing Your Integration

### 1. Unit Tests
```typescript
describe('MCP Client', () => {
  test('should initialize connection', async () => {
    const client = new MCPClient();
    await client.connect(testConfig);
    
    expect(client.isConnected()).toBe(true);
    expect(client.getTools()).toContain('contribute');
  });
  
  test('should call tools successfully', async () => {
    const result = await client.callTool('contribute', {
      message: 'Test message',
      persona: 'kiro'
    });
    
    expect(result).toMatch(/OK: Posted as/);
  });
});
```

### 2. Integration Tests
```typescript
// Test full flow
async function testDebateFlow() {
  // 1. Connect to server
  await mcpClient.connect(config);
  
  // 2. Post initial message
  await mcpClient.callTool('contribute', {
    message: 'Starting a test debate',
    persona: 'claude-research'
  });
  
  // 3. Read discussion
  const messages = await mcpClient.callTool('read_discussion', {
    limit: 5
  });
  
  // 4. Verify message appears
  expect(messages).toContain('Starting a test debate');
  
  // 5. Get context
  const context = await mcpClient.callTool('get_conversation_context', {});
  expect(context).toBeDefined();
}
```

## Performance Considerations

1. **Message Buffering**: Buffer rapid tool calls to avoid overwhelming the server
2. **Caching**: Cache recent discussions locally to reduce API calls
3. **Lazy Loading**: Load conversation history on-demand
4. **Debouncing**: Debounce user input for auto-suggestions

## Security Considerations

1. **Token Management**: Never expose API tokens in IDE settings
2. **Input Validation**: Validate and sanitize user input before sending
3. **Process Isolation**: Run MCP server in isolated process
4. **Rate Limiting**: Implement client-side rate limiting

## Debugging Tips

### Enable Debug Logging
```typescript
if (process.env.DEBUG) {
  mcpClient.on('send', msg => console.log('→', msg));
  mcpClient.on('receive', msg => console.log('←', msg));
}
```

### Common Issues
- **No response**: Check if server process is running
- **Protocol errors**: Verify JSON-RPC format
- **Authentication fails**: Check .env configuration
- **Wrong persona**: Verify persona names match config

## Resources

- [MCP Specification](https://modelcontextprotocol.io)
- [JSON-RPC 2.0 Spec](https://www.jsonrpc.org/specification)
- Server Implementation: `src/mcp_server.py`
- Test Client: `test_mcp_connection.py`