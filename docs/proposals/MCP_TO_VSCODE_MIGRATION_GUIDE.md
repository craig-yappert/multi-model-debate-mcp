# MCP-to-VSCode Migration Technical Guide

## Component Mapping: Current System → VS Code Extension

### 1. Architecture Comparison

```
CURRENT: Mattermost Integration
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Claude Code │ → │ MCP Server  │ → │ Mattermost  │
│   (Client)  │    │  (Python)   │    │   (Chat)    │
└─────────────┘    └─────────────┘    └─────────────┘

PROPOSED: VS Code Integration  
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  VS Code    │ → │ MCP Server  │ → │ Claude API  │
│ Extension   │    │  (Reused)   │    │ (Enhanced)  │
└─────────────┘    └─────────────┘    └─────────────┘
```

### 2. Direct Component Reuse (90%)

| Component | Current Usage | VS Code Usage | Changes Required |
|-----------|--------------|---------------|------------------|
| **MCP Server** | `src/mcp_server.py` | Same file | Add VS Code context handling |
| **Personas** | claude-research, kiro | Same personas | No changes |
| **Coordination Rules** | `chat_coordination_rules.yaml` | Same file | No changes |
| **Claude API** | Anthropic client | Same client | Enhanced prompts |
| **Conversation Context** | ConversationContext class | Same class | Add code context |

### 3. Code Migration Examples

#### A. MCP Server Enhancement (5 lines added)
```python
# CURRENT: src/mcp_server.py handle_contribute()
async def handle_contribute(self, arguments: dict) -> List[TextContent]:
    message = arguments.get("message", "")
    persona = arguments.get("persona", "claude_research")
    
    context = await self.build_context(persona)
    ai_response = await self.generate_response(message, persona_config, context)
    return [TextContent(type="text", text=ai_response)]

# ENHANCED: Add VS Code context support
async def handle_contribute(self, arguments: dict) -> List[TextContent]:
    message = arguments.get("message", "")
    persona = arguments.get("persona", "claude_research")
    vscode_context = arguments.get("vscode_context", {})  # 🆕 NEW
    
    context = await self.build_vscode_context(persona, vscode_context)  # 🆕 ENHANCED
    ai_response = await self.generate_response(message, persona_config, context)
    return [TextContent(type="text", text=ai_response)]
```

#### B. Context Builder Enhancement 
```python
# 🆕 NEW METHOD: Add to existing MultiModelMCPServer class
async def build_vscode_context(self, persona: str, vscode_context: dict) -> str:
    # Reuse existing conversation context
    base_context = self.conversation_context.get_context_for_persona(persona)
    
    # Add VS Code-specific context
    if vscode_context:
        code_info = f"""
Current Development Context:
- File: {vscode_context.get('activeFile', {}).get('path', 'Unknown')}
- Function: {vscode_context.get('currentFunction', 'Unknown')}
- Selected Code: {vscode_context.get('selectedText', 'None')}
- Git Branch: {vscode_context.get('gitBranch', 'Unknown')}
- Debug Session: {vscode_context.get('debugActive', False)}
- Errors: {len(vscode_context.get('diagnostics', []))} issues
- Terminal Output: {vscode_context.get('terminalOutput', 'None')[-200:]}
        """
        return f"{base_context}\n\n{code_info}"
    
    # Fallback to existing behavior
    return base_context
```

### 4. VS Code Extension Implementation

#### A. Package.json Configuration
```json
{
  "name": "multi-model-debate-vscode",
  "displayName": "Multi-Model AI Collaboration", 
  "version": "1.0.0",
  "engines": { "vscode": "^1.74.0" },
  "categories": ["Chat", "Other"],
  "contributes": {
    "chatParticipants": [
      {
        "id": "claude-research",
        "name": "Claude Research", 
        "description": "Deep analytical thinking and strategic perspective"
      },
      {
        "id": "kiro",
        "name": "Kiro",
        "description": "Practical execution and implementation focus"
      }
    ]
  }
}
```

#### B. Extension Entry Point
```typescript
// src/extension.ts
export function activate(context: vscode.ExtensionContext) {
  // Initialize MCP connection to existing server
  const mcpClient = new MCPClient('./src/mcp_server.py');
  
  // Register chat participants using existing personas
  registerChatParticipants(context, mcpClient);
  
  // Set up workspace conversation persistence
  const conversationStore = new WorkspaceConversationStore(context);
  
  console.log('Multi-Model AI Collaboration extension activated');
}

function registerChatParticipants(context: vscode.ExtensionContext, mcpClient: MCPClient) {
  // claude-research participant
  const claudeResearch = vscode.chat.createChatParticipant(
    'claude-research',
    async (request, context, stream, token) => {
      const codeContext = await gatherCodeContext();
      const response = await mcpClient.contribute(request.prompt, 'claude-research', codeContext);
      stream.markdown(response);
    }
  );
  
  // kiro participant  
  const kiro = vscode.chat.createChatParticipant(
    'kiro',
    async (request, context, stream, token) => {
      const codeContext = await gatherCodeContext();
      const response = await mcpClient.contribute(request.prompt, 'kiro', codeContext);
      stream.markdown(response);
    }
  );
  
  context.subscriptions.push(claudeResearch, kiro);
}
```

#### C. Context Gathering
```typescript
// src/context-analyzer.ts
async function gatherCodeContext(): Promise<VSCodeContext> {
  const activeEditor = vscode.window.activeTextEditor;
  const workspace = vscode.workspace;
  
  return {
    // Current file context
    activeFile: {
      path: activeEditor?.document.fileName || 'None',
      content: activeEditor?.document.getText() || '',
      selectedText: activeEditor?.document.getText(activeEditor.selection) || '',
      language: activeEditor?.document.languageId || 'unknown'
    },
    
    // Git context
    gitBranch: await getGitBranch(),
    recentCommits: await getRecentCommits(3),
    
    // Error context
    diagnostics: vscode.languages.getDiagnostics(),
    
    // Debug context
    debugging: {
      isActive: !!vscode.debug.activeDebugSession,
      breakpoints: vscode.debug.breakpoints.length
    },
    
    // Terminal context
    terminalOutput: getRecentTerminalOutput(),
    
    // Workspace context
    workspace: {
      name: workspace.name || 'Unknown',
      rootPath: workspace.rootPath || '',
      openFiles: workspace.textDocuments.map(doc => doc.fileName)
    }
  };
}
```

### 5. Conversation Persistence

#### A. Workspace Storage
```typescript
// src/storage/conversation-store.ts
class WorkspaceConversationStore {
  constructor(private context: vscode.ExtensionContext) {}
  
  async saveConversation(
    persona: string, 
    message: string, 
    response: string, 
    context: VSCodeContext
  ) {
    const conversations = this.context.workspaceState.get('ai-conversations', []);
    
    conversations.push({
      timestamp: new Date().toISOString(),
      persona,
      message,
      response,
      fileContext: context.activeFile.path,
      gitBranch: context.gitBranch
    });
    
    // Keep last 100 conversations
    if (conversations.length > 100) {
      conversations.splice(0, conversations.length - 100);
    }
    
    await this.context.workspaceState.update('ai-conversations', conversations);
  }
  
  getConversationHistory(limit: number = 10): ConversationEntry[] {
    const conversations = this.context.workspaceState.get('ai-conversations', []);
    return conversations.slice(-limit);
  }
}
```

### 6. Testing Strategy

#### A. Unit Tests for Context Gathering
```typescript
// test/context-analyzer.test.ts
describe('Context Analyzer', () => {
  test('gathers basic file context', async () => {
    // Mock VS Code API
    const mockEditor = createMockEditor('test.js', 'function test() {}');
    vscode.window.activeTextEditor = mockEditor;
    
    const context = await gatherCodeContext();
    
    expect(context.activeFile.path).toContain('test.js');
    expect(context.activeFile.content).toBe('function test() {}');
  });
  
  test('handles no active editor', async () => {
    vscode.window.activeTextEditor = undefined;
    
    const context = await gatherCodeContext();
    
    expect(context.activeFile.path).toBe('None');
    expect(context.activeFile.content).toBe('');
  });
});
```

#### B. Integration Tests with MCP Server
```typescript
// test/mcp-integration.test.ts
describe('MCP Integration', () => {
  test('connects to existing MCP server', async () => {
    const mcpClient = new MCPClient('./src/mcp_server.py');
    await mcpClient.connect();
    
    expect(mcpClient.isConnected()).toBe(true);
  });
  
  test('claude-research responds with enhanced context', async () => {
    const mcpClient = new MCPClient('./src/mcp_server.py');
    const mockContext = createMockVSCodeContext();
    
    const response = await mcpClient.contribute(
      'What do you think about this function?',
      'claude-research', 
      mockContext
    );
    
    expect(response).toContain('Looking at');
    expect(response.length).toBeGreaterThan(50);
  });
});
```

### 7. Deployment Checklist

#### Week 1: Foundation
- [ ] Create VS Code extension scaffold
- [ ] Test connection to existing MCP server
- [ ] Implement basic chat participants
- [ ] Add minimal context gathering

#### Week 2: Enhanced Context  
- [ ] Implement comprehensive context gathering
- [ ] Add debugging and error context
- [ ] Test with real development scenarios
- [ ] Add conversation persistence

#### Week 3: Polish & Deploy
- [ ] Add workspace-scoped conversation history
- [ ] Implement error handling and edge cases
- [ ] Create user documentation
- [ ] Package and deploy to VS Code marketplace

### 8. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|---------|------------|
| MCP server connection issues | Medium | High | Fallback to basic chat without MCP |
| VS Code API limitations | Low | Medium | Graceful degradation of features |
| Performance with large files | Medium | Low | Context size limits and filtering |
| User adoption resistance | Low | Medium | Start with team alpha testing |

### 9. Success Metrics

**Week 1 Success**: Basic @claude-research and @kiro responses in VS Code chat
**Week 2 Success**: AI understands current file and provides contextual suggestions  
**Week 3 Success**: Team actively uses AI collaboration during development sessions

---

## Summary

This migration leverages **90% of existing MCP architecture** while adding the missing piece: **code context awareness**. The result is AI collaboration that finally understands what developers are actually working on.

**Key Benefits:**
- ✅ Reuse proven persona logic and coordination rules
- ✅ Maintain conversation quality and AI behavior
- ✅ Add immediate code context awareness  
- ✅ Eliminate platform switching
- ✅ Enable direct code suggestions and application

**Implementation Complexity: LOW** - Most work is VS Code extension development, not AI system redesign.
