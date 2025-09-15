# AI Team Discussion: VS Code Extension Evolution

## TL;DR - What We're Proposing

**Transform our proven Mattermost AI collaboration into a VS Code extension** that brings `@claude-research` and `@kiro` directly into the IDE with full code context awareness.

## The Problem We're Solving

**Current State**: Our AI personas debate in Mattermost, but developers work in VS Code
- ❌ **Context Gap**: AI doesn't see the actual code being discussed
- ❌ **Platform Switching**: Developers alt-tab between VS Code and Mattermost
- ❌ **Manual Context**: Developers must explain what they're working on

**Proposed State**: AI personas collaborate directly in VS Code with full awareness
- ✅ **Rich Context**: AI sees current file, errors, debugging state, git branch
- ✅ **Workflow Integration**: No platform switching, natural @mentions in VS Code chat
- ✅ **Immediate Applicability**: AI suggestions can be directly applied to code

## What We Keep vs. What We Gain

### Keep (90% Reuse) ✅
- **Proven MCP Server**: `src/mcp_server.py` works as-is with minor enhancements
- **Refined Personas**: claude-research and kiro personas transfer completely
- **Coordination Rules**: `chat_coordination_rules.yaml` prevents AI spam
- **Claude API Integration**: All existing AI response generation logic

### Gain 🚀
- **Code Context**: AI sees actual files, functions, errors, debugging sessions
- **Zero Context Switching**: Everything happens in VS Code where developers live
- **Actionable Suggestions**: AI can provide specific code changes and diffs
- **Real-time Error Awareness**: AI sees actual diagnostics and terminal output

## Implementation Approach

### Architecture
```
VS Code Extension → Existing MCP Server → Claude API
     ↑                    ↑                   ↑
Chat Participants    90% Reused Code    Same Personas
+ Rich Context      + Minor Enhancements  + Enhanced Prompts
```

### Timeline
- **Week 1-2**: Basic VS Code extension with chat participants
- **Week 3**: Rich context integration (files, errors, debugging)  
- **Week 4**: Conversation persistence and workspace awareness
- **Week 5-6**: Advanced collaboration features and polish

### Risk Assessment: **LOW**
- ✅ **Technical Risk**: Low - VS Code Chat API is stable, MCP server proven
- ✅ **Implementation Risk**: Low - 90% code reuse, well-defined interfaces
- ✅ **Adoption Risk**: Low - Same AI personas, better workflow integration

## Example Usage Scenarios

### Scenario 1: Code Review
```
Developer: "@claude-research what do you think about this auth function?"
          (while viewing auth.js:45-60)

@claude-research: "Looking at lines 45-60, this function has 4 responsibilities. 
                  The password validation is mixed with hashing logic. Consider 
                  extracting validation to a separate pure function..."

@kiro: "Function works fine for our 10K users. I see error handling that 
       swallows exceptions at line 52. Let's fix that first - less risk."
```

### Scenario 2: Debugging
```
Developer: "@kiro this test is failing"

@kiro: "I see the test failure in your terminal. Line 23 expects 'success' 
       but got 'undefined'. The issue is in auth.js:67 - you're not 
       returning the response object. Quick fix: add 'return' before 
       'response.data'."
```

## Technical Implementation Details

### Minimal MCP Server Changes
```python
# Add 5 lines to existing handle_contribute()
async def handle_contribute(self, arguments: dict):
    message = arguments.get("message", "")
    persona = arguments.get("persona", "claude_research")  
    vscode_context = arguments.get("vscode_context", {})  # 🆕 NEW
    
    context = await self.build_vscode_context(persona, vscode_context)  # 🆕 ENHANCED
    # ... rest of existing logic unchanged
```

### VS Code Extension Structure
```typescript
// Chat participants using existing personas
const claudeResearch = vscode.chat.createChatParticipant('claude-research', handler);
const kiro = vscode.chat.createChatParticipant('kiro', handler);

// Rich context gathering
const context = {
  activeFile: vscode.window.activeTextEditor?.document,
  diagnostics: vscode.languages.getDiagnostics(),
  debugging: vscode.debug.activeDebugSession,
  gitBranch: await getGitBranch()
};
```

## Decision Points for Team Discussion

### 1. **Priority vs. Current Roadmap**
- How does this fit with other development priorities?
- Should we pause other features to focus on this evolution?

### 2. **Team Capacity**
- Who has VS Code extension development experience?
- Can we dedicate 1 developer for 4-6 weeks?

### 3. **User Testing Approach**
- Start with internal team testing?
- Which development workflows should we test first?

### 4. **Success Metrics**
- How do we measure if this improves developer productivity?
- What would constitute successful adoption?

### 5. **Deployment Strategy**
- Internal VS Code marketplace first?
- How do we handle the transition from Mattermost?

## Next Steps if Approved

### This Week
1. Set up VS Code extension development environment
2. Create basic extension scaffold with Chat API
3. Test connection to existing MCP server
4. Prototype basic @claude-research and @kiro participants

### Sprint 1 (Week 1)
- Working VS Code extension with basic AI responses
- Basic file context gathering
- Simple conversation persistence

### Sprint 2 (Week 2-3)  
- Rich context integration (debugging, errors, git)
- Enhanced AI prompts with code awareness
- Workspace-scoped conversation history

## Questions for Discussion

1. **Does this align with our vision of AI-assisted development?**
2. **Are we comfortable with the implementation complexity?**
3. **What concerns do you have about user adoption?**
4. **How should we handle the Mattermost → VS Code transition?**
5. **What success metrics matter most to you?**

---

## Full Documentation

**Detailed Proposal**: [`docs/proposals/VS_CODE_AI_COLLABORATION_PROPOSAL.md`](VS_CODE_AI_COLLABORATION_PROPOSAL.md)  
**Technical Guide**: [`docs/proposals/MCP_TO_VSCODE_MIGRATION_GUIDE.md`](MCP_TO_VSCODE_MIGRATION_GUIDE.md)  
**Project Status**: [`docs/current/STATUS.md`](../current/STATUS.md)

---

*This represents a natural evolution of our multi-model debate system - bringing proven AI collaboration directly into the developer workflow where it can be most impactful.*
