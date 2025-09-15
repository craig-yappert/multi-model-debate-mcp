# Unified VS Code Chat MCP Architecture

## Executive Summary

Replace the current dual-server setup (Mattermost + VS Code) with a single, unified MCP server that directly integrates with VS Code's chat interface. This enables Claude Code (and other MCP clients) to participate directly as chat participants, creating a seamless planning-to-execution pipeline.

## Current Architecture Problems

1. **Dual Server Complexity**: Maintaining both Mattermost and VS Code bridges
2. **Context Loss**: Messages must be manually bridged between systems
3. **Limited Integration**: Claude Code can't directly see VS Code chat
4. **File Access Issues**: Chat participants can't access files not explicitly shared

## Proposed Unified Architecture

### Core Components

```typescript
// vscode-extension/src/mcp/unified-server.ts
export class UnifiedChatMCPServer {
    // Single server handling all chat operations
    private chatAPI: vscode.ChatAPI;
    private executionGates: ExecutionGates;
    private auditLog: AuditLog;

    // Available to all MCP clients including Claude Code
    tools = {
        // Chat Operations
        'chat_read_messages': this.readChatMessages,
        'chat_send_message': this.sendChatMessage,
        'chat_get_context': this.getChatContext,
        'chat_list_participants': this.listParticipants,

        // Execution Operations (with gates)
        'execute_file_operation': this.executeFileOp,
        'execute_code_generation': this.generateCode,
        'execute_test_run': this.runTests,

        // Collaboration Features
        'request_human_approval': this.requestApproval,
        'report_completion': this.reportCompletion,
        'share_analysis': this.shareAnalysis
    };
}
```

## Implementation Plan

### Phase 1: MCP Server Creation (Week 1)

#### 1. Basic Chat Integration

```typescript
// Tools for reading/writing to VS Code chat
interface ChatTools {
    chat_read_messages(params: {
        participant?: string;
        limit?: number;
        since?: string;
    }): ChatMessage[];

    chat_send_message(params: {
        message: string;
        participant: 'claude-code';  // MCP clients post as claude-code
        replyTo?: string;
        attachments?: FileReference[];
    }): MessageResult;

    chat_get_context(params: {
        conversationId: string;
    }): ConversationContext;
}
```

#### 2. Register Claude Code as Chat Participant

```typescript
// vscode-extension/src/chat/participants.ts
export function registerClaudeCodeParticipant() {
    vscode.chat.createChatParticipant('claude-code', {
        description: 'Execution engine with full file access',
        icon: 'robot',
        handler: async (request, context, response, token) => {
            // Bridge to MCP server
            const mcpResponse = await unifiedServer.handleChatRequest(request);
            response.markdown(mcpResponse);
        }
    });
}
```

### Phase 2: Execution Controls (Week 1-2)

#### Safety Gates System

```typescript
interface ExecutionGate {
    // Require explicit keywords
    requiresApproval: string[];  // ["EXECUTE:", "APPROVED:", "RUN:"]

    // Operation limits
    maxFilesPerOperation: number;  // 10
    maxLinesPerFile: number;       // 1000
    prohibitedPaths: string[];     // ["/etc", "/system", ".git/config"]

    // Approval mechanisms
    approvalTimeout: number;        // 30 seconds
    requireHumanForDestructive: boolean;  // true
}

class ExecutionController {
    async validateExecution(request: ExecutionRequest): Promise<ValidationResult> {
        // Check for approval keywords
        if (!this.hasApprovalKeyword(request)) {
            return { allowed: false, reason: "Missing approval keyword" };
        }

        // Check scope limits
        if (request.files.length > this.gates.maxFilesPerOperation) {
            return { allowed: false, reason: "Too many files" };
        }

        // Check for destructive operations
        if (this.isDestructive(request) && !request.humanApproved) {
            return {
                allowed: false,
                reason: "Destructive operation requires human approval",
                requestApproval: true
            };
        }

        return { allowed: true };
    }
}
```

### Phase 3: Communication Flow (Week 2)

#### Unified Message Flow

```
1. Chat Planning Phase:
   @claude-research: "We need to refactor the auth module"
   @kiro: "I see three files that need updates"
   @copilot: "I can implement the changes"

2. Execution Request:
   @copilot: "EXECUTE: Refactor auth module as discussed"

3. Claude Code Receives (via MCP):
   - Full conversation context
   - Specific execution request
   - File references from discussion

4. Claude Code Executes:
   - Validates request against gates
   - Performs operations
   - Reports back to chat

5. Feedback Loop:
   @claude-code: "Completed: Refactored 3 files, all tests pass"
   @kiro: "Let me review the changes..."
```

### Phase 4: Advanced Features (Week 2-3)

#### 1. Context Preservation

```typescript
interface ConversationMemory {
    // Maintain context across sessions
    decisions: Decision[];
    fileModifications: FileChange[];
    testResults: TestResult[];

    // Enable intelligent handoffs
    getCurrentTask(): Task;
    getNextSteps(): Step[];
    getPendingApprovals(): Approval[];
}
```

#### 2. Intelligent Routing

```typescript
class TaskRouter {
    routeToParticipant(task: Task): Participant {
        if (task.type === 'execution') return 'claude-code';
        if (task.type === 'review') return 'kiro';
        if (task.type === 'design') return 'claude-research';
        if (task.type === 'implementation') return 'copilot';
    }
}
```

## Benefits of Unified Architecture

### Immediate Benefits

1. **Single Source of Truth**: All conversation in VS Code chat
2. **Direct Execution**: Claude Code acts immediately on team decisions
3. **Full Context**: No message bridging or context loss
4. **Simplified Setup**: One MCP server instead of two

### Long-term Benefits

1. **Scalability**: Easy to add new participants/capabilities
2. **Auditability**: Complete conversation and execution history
3. **Flexibility**: Can add new execution gates/controls as needed
4. **Integration**: Native VS Code experience

## Migration Path

### Step 1: Build Parallel System

- Create new unified MCP server alongside existing
- Test with limited functionality
- Validate execution gates work properly

### Step 2: Gradual Migration

- Move read operations first
- Add write operations with strict gates
- Migrate execution capabilities incrementally

### Step 3: Deprecate Old System

- Once stable, remove Mattermost dependency
- Consolidate all functionality in unified server
- Document new workflow for users

## Security Considerations

### Execution Boundaries

```typescript
const EXECUTION_BOUNDARIES = {
    // Never allow
    forbidden: [
        'rm -rf',
        'format',
        'del /f',
        'git push --force',
        'DROP TABLE',
        'DELETE FROM'
    ],

    // Always require human
    requireHuman: [
        'git commit',
        'git push',
        'npm publish',
        'deploy',
        'migration'
    ],

    // Rate limits
    limits: {
        filesPerMinute: 10,
        linesPerMinute: 1000,
        operationsPerHour: 100
    }
};
```

### Audit Trail

```typescript
interface AuditEntry {
    timestamp: Date;
    participant: string;
    operation: string;
    files: string[];
    result: 'success' | 'failure' | 'blocked';
    humanApproval: boolean;
    conversationContext: string;
}
```

## Success Metrics

1. **Response Time**: < 2s for chat operations
2. **Execution Safety**: 0 unauthorized operations
3. **Context Preservation**: 100% conversation visibility
4. **User Satisfaction**: Reduced friction in AI collaboration

## Next Steps

1. [ ] Review and approve architecture
2. [ ] Begin Phase 1 implementation
3. [ ] Create test scenarios
4. [ ] Deploy to limited beta users
5. [ ] Iterate based on feedback

---

This unified architecture eliminates the complexity of multiple servers while providing better integration, safety, and user experience. The key insight is that VS Code chat becomes the single coordination point, with Claude Code as a full participant rather than an external tool.
