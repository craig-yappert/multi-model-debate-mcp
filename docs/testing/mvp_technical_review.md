# Testing: MVP Technical Review & Testing Strategy

**Created:** 2025-08-25  
**Last Updated:** 2025-08-25  
**Status:** Active ✏️  
**Contributors:** Kiro  
**Related:** `../design/mcp_design.md`, `autonomous_collaboration_testing.md`

---

## Technical Architecture Review

### MVP Scope Definition
**Goal:** Replace current bridge with proper MCP server for single-team coordination

**Core Requirements:**
- MCP server with 4 essential tools
- Single team support (multi-model-debate-mcp)
- Persona-based responses using existing rules
- Bidirectional IDE ↔ Chat coordination

### Technical Stack Assessment

**MCP Server Framework:**
- **Language:** Python (matches existing bridge code)
- **MCP Library:** `mcp` package for tool registration
- **Dependencies:** `anthropic`, `httpx`, `pyyaml`, `asyncio`
- **Architecture:** Single-process server with async tool handlers

**Integration Points:**
- **Mattermost API:** Webhook/REST API for message posting/reading
- **Model APIs:** Anthropic (Claude), OpenAI (future), Google (future)
- **Configuration:** YAML-based persona and team settings
- **IDE Integration:** File-based status updates or webhook callbacks

### Critical Technical Decisions

**1. Message Context Management**
```python
class ConversationContext:
    def __init__(self, team: str, channel: str):
        self.messages: List[Message] = []
        self.max_context = 50  # Configurable
        
    def add_message(self, message: Message):
        # Add with automatic truncation
        
    def get_context_for_persona(self, persona: str) -> str:
        # Return formatted context with persona-specific filtering
```

**2. Persona State Management**
```python
class PersonaManager:
    def __init__(self, rules_file: str):
        self.rules = self.load_rules(rules_file)
        self.active_personas: Dict[str, PersonaState] = {}
        
    async def generate_response(self, persona: str, context: str, message: str) -> str:
        # Apply persona rules and generate response
```

**3. Tool Implementation Priority**
1. `read_discussion` - Essential for context
2. `contribute` - Core functionality  
3. `announce_work` - IDE integration
4. `join_project_team` - Skip for MVP (single team)

## Testing Strategy

### Test Categories

**1. Unit Tests**
```python
# Test persona rule application
def test_persona_response_formatting():
    assert kiro_response.is_direct()
    assert kiro_response.word_count() <= 100
    assert "great idea" not in kiro_response.text.lower()

# Test context management
def test_context_truncation():
    context = ConversationContext("test", "general")
    # Add 100 messages, verify only last 50 retained
    
# Test MCP tool registration
def test_mcp_tools_registered():
    server = MCPServer()
    assert "read_discussion" in server.tools
    assert "contribute" in server.tools
```

**2. Integration Tests**
```python
# Test Mattermost API integration
async def test_mattermost_message_posting():
    response = await mcp_server.contribute("test-team", "general", "Test message", "kiro")
    assert response.success
    
# Test persona consistency
async def test_persona_maintains_character():
    responses = []
    for i in range(5):
        response = await generate_persona_response("kiro", context, f"Question {i}")
        responses.append(response)
    
    assert all(is_execution_focused(r) for r in responses)
```

**3. Coordination Tests**
```python
# Test IDE ↔ Chat sync
async def test_work_announcement_flow():
    # Simulate IDE work start
    await mcp_server.announce_work("test-team", "started", "Update requirements.md")
    
    # Verify message posted to chat
    messages = await mcp_server.read_discussion("test-team", "general", 1)
    assert "Working on Update requirements.md" in messages[0]
    
    # Simulate work completion
    await mcp_server.announce_work("test-team", "completed", "Update requirements.md")
    
    # Verify completion message
    messages = await mcp_server.read_discussion("test-team", "general", 1)
    assert "✅ Completed Update requirements.md" in messages[0]
```

### Test Environment Setup

**1. Mock Mattermost Instance**
```python
class MockMattermost:
    def __init__(self):
        self.channels = {"general": []}
        
    async def post_message(self, channel: str, message: str):
        self.channels[channel].append(message)
        
    async def get_messages(self, channel: str, limit: int):
        return self.channels[channel][-limit:]
```

**2. Test Configuration**
```yaml
# test_config.yaml
teams:
  test-team:
    mattermost_url: "http://localhost:8065"
    default_channel: "general"
    personas: ["claude-research", "kiro"]
    
personas:
  kiro:
    max_response_length: 100
    directness_level: high
    focus: execution
```

**3. Automated Test Suite**
```bash
# Run all tests
pytest tests/ -v

# Run specific test categories
pytest tests/unit/ -v
pytest tests/integration/ -v
pytest tests/coordination/ -v

# Run with coverage
pytest tests/ --cov=mcp_server --cov-report=html
```

## Implementation Validation

### Success Criteria
1. **MCP Tools Work** - All 3 core tools respond correctly
2. **Personas Maintained** - Responses match persona characteristics
3. **Context Preserved** - Conversation history flows properly
4. **IDE Integration** - Work announcements sync bidirectionally
5. **Performance** - Response time < 3 seconds per tool call

### Risk Mitigation
- **API Rate Limits** - Implement exponential backoff
- **Context Overflow** - Automatic message truncation
- **Persona Drift** - Regular rule compliance checking
- **Network Issues** - Retry logic with fallback responses

### Deployment Testing
1. **Local Development** - Docker compose with mock Mattermost
2. **Staging** - Real Mattermost instance, test team
3. **Production** - Gradual rollout with bridge fallback

## Next Steps

1. **Set up test environment** - Mock Mattermost + test configuration
2. **Implement core MCP server** - Basic tool registration and handlers
3. **Add persona management** - Rule loading and response generation
4. **Build integration tests** - Validate coordination flows
5. **Deploy and validate** - Replace bridge with MCP server

**Estimated Timeline:** 2-3 days for MVP implementation + testing

## Change Log

**2025-08-25 - Kiro**
- Initial technical review and testing strategy creation
- Defined MVP scope and technical stack decisions
- Created comprehensive testing approach with success criteria

---

*Document maintained as part of multi-model collaborative development process*