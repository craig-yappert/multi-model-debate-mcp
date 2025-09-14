# 🔧 Technical Reference

## MCP Server Architecture

### Core Components

```python
# Main server class
class MultiModelDebateMCPServer:
    def __init__(self):
        self.server = Server("multi-model-debate")
        self.config = {}  # Loaded from YAML
        self.mattermost = None  # HTTP API connection
        self.claude_api_key = None  # Anthropic API
        self.retry_handler = RetryHandler()
        self.message_cache = MessageCache()
```

### MCP Tools Implementation

#### 1. read_discussion
- **Purpose**: Retrieve recent messages from Mattermost channel
- **Parameters**: `limit` (integer, default 10)
- **Returns**: Formatted message list with timestamps and authors
- **Implementation**: Direct HTTP GET to Mattermost API with caching

#### 2. contribute
- **Purpose**: Post message as AI persona with generated response
- **Parameters**: `message` (string), `persona` (claude_research|kiro), `autonomous` (boolean)
- **Returns**: Confirmation with generated AI response preview
- **Implementation**: Posts to Mattermost → generates Claude response → posts AI response

#### 3. get_conversation_context
- **Purpose**: Provide structured conversation summary
- **Parameters**: None
- **Returns**: Formatted context with recent discussion summary
- **Implementation**: Fetches recent messages and creates summary

#### 4. subscribe_notifications
- **Purpose**: Enable real-time message notifications via WebSocket
- **Parameters**: `channel_id` (optional, defaults to configured channel)
- **Returns**: Subscription confirmation
- **Implementation**: WebSocket connection to Mattermost

#### 5. unsubscribe_notifications
- **Purpose**: Disable real-time notifications
- **Parameters**: None
- **Returns**: Unsubscription confirmation
- **Implementation**: Close WebSocket connection

### API Integrations

#### Mattermost HTTP API
```python
# Direct HTTP requests (not mattermostdriver)
base_url = f"{scheme}://{url}:{port}/api/v4"
headers = {"Authorization": f"Bearer {bot_token}"}

# Get messages
response = requests.get(f"{base_url}/channels/{channel_id}/posts",
                       headers=headers, timeout=10)

# Post message
post_data = {"channel_id": channel_id, "message": message}
response = requests.post(f"{base_url}/posts",
                        json=post_data, headers=headers, timeout=10)
```

#### Anthropic Claude API
```python
# AI response generation
import anthropic
client = anthropic.Anthropic(api_key=api_key)

response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    messages=[
        {"role": "user", "content": prompt}
    ],
    max_tokens=1000
)
```

### Configuration System

#### Environment Variables (.env)
```bash
# Required
ANTHROPIC_API_KEY=sk-ant-your-key-here
CLAUDE_RESEARCH_BOT_TOKEN=your-mattermost-bot-token

# Optional
KIRO_BOT_TOKEN=second-bot-token
MATTERMOST_URL=localhost
MATTERMOST_PORT=8065
MATTERMOST_SCHEME=http
```

#### YAML Configuration (config/chat_coordination_rules.yaml)
```yaml
personas:
  claude_research:
    name: "Claude-Research"
    role: "Research Lead"
    description: "Deep analytical thinking and strategic perspective"
    prompt_template: |
      You are Claude-Research, the analytical research lead in this team discussion.
      Focus on strategic thinking, thorough analysis, and asking probing questions.

team:
  name: "multi-model-debate"
  channel: "general"

autonomous_collaboration:
  enabled: true
  max_exchanges: 3
  trigger_keywords: ["@all", "everyone", "team"]
```

### Error Handling & Resilience

#### Retry Logic
```python
class RetryHandler:
    def __init__(self, max_retries=3, base_delay=1.0, max_delay=60.0):
        # Exponential backoff with jitter
        delay = min(base_delay * (2 ** attempt) + random.uniform(0, 1), max_delay)
```

#### Graceful Degradation
- Server continues running without Mattermost connection
- Returns error messages instead of crashing
- Caches messages to reduce API load
- Handles authentication failures gracefully

#### Message Caching
```python
class MessageCache:
    def __init__(self, cache_duration_seconds=300):  # 5 minutes
        # Timestamp-based cache invalidation
        # Automatic cleanup on new messages
```

### Performance Characteristics

| Operation | Typical Response Time | Notes |
|-----------|----------------------|-------|
| read_discussion | 100-500ms | Cached, direct HTTP |
| contribute | 2-3 seconds | Includes AI generation |
| get_conversation_context | 200-800ms | Processes recent messages |
| subscribe_notifications | 100ms | WebSocket setup |
| Real-time notifications | <100ms | WebSocket delivery |

### Security Considerations

#### API Key Management
- Environment variables only (never in code)
- Bot tokens with minimal required permissions
- No API keys exposed in logs

#### Input Validation
- Message content sanitization
- Persona validation against allowed list
- Length limits on user inputs

#### Network Security
- HTTPS support for production
- Timeout configurations on all requests
- No credentials in error messages

### Logging & Monitoring

#### Log Output
```python
# All logs to stderr to avoid MCP protocol interference
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stderr)]
)
```

#### Health Checks
- Startup connection validation
- API key verification
- Mattermost connectivity test
- Tool registration confirmation

### Database & State Management

**Current Implementation**: Stateless
- No persistent database
- Conversation state in Mattermost
- Configuration from YAML files
- Cache in memory only

**Future Considerations**:
- SQLite for local state
- Redis for distributed caching
- PostgreSQL for production scale

### Development & Testing

#### Local Development
```bash
# Run server directly
python src/mcp_server.py

# With debug logging
DEBUG=1 python src/mcp_server.py

# Test specific tool
python -c "
import asyncio
from src.mcp_server import MultiModelDebateMCPServer
# ... test code
"
```

#### MCP Protocol Testing
```bash
# Test JSON-RPC communication
echo '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' | \
python src/mcp_server.py
```

### Common Integration Patterns

#### Claude Code MCP Configuration
```json
{
  "mcpServers": {
    "multi-model-debate": {
      "command": "python",
      "args": ["src/mcp_server.py"],
      "cwd": "/absolute/path/to/project",
      "env": {"PYTHONUNBUFFERED": "1"}
    }
  }
}
```

#### Error Recovery Patterns
```python
# Typical error handling in tools
try:
    result = await self.call_api()
    return [TextContent(type="text", text=result)]
except Exception as e:
    error_msg = f"ERROR: {str(e)}"
    return [TextContent(type="text", text=error_msg)]
```

### Extending the System

#### Adding New Personas
1. Update `config/chat_coordination_rules.yaml`
2. Create corresponding Mattermost bot account
3. Add bot token to `.env`
4. Update persona validation in server code

#### Adding New MCP Tools
```python
# Register new tool
Tool(
    name="new_tool",
    description="Description of what it does",
    inputSchema={
        "type": "object",
        "properties": {
            "param": {"type": "string", "description": "Parameter description"}
        }
    }
)

# Implement handler
@self.server.call_tool()
async def handle_tool_call(name: str, arguments: dict) -> List[TextContent]:
    if name == "new_tool":
        # Implementation here
        return [TextContent(type="text", text="Result")]
```

---

**Implementation Status**: All documented features are currently working
**Last Updated**: 2025-09-13
**Code Location**: `src/mcp_server.py`