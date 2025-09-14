# Multi-Model Debate MCP Server - Handoff Document for Kiro

## Executive Summary

We've successfully built a working MCP (Model Context Protocol) server that enables multi-model debates through Mattermost. The system allows different AI personas (Claude-Research and Kiro) to engage in collaborative discussions with distinct personalities and perspectives. The MCP server is now fully operational and ready for IDE integration.

## What We've Built

### Core Functionality
1. **MCP Server**: A fully compliant MCP server that runs in stdio mode for IDE integration
2. **Multi-Persona Support**: Two distinct AI personas with different approaches:
   - **Claude-Research**: Analytical, thorough, strategic thinker
   - **Kiro**: Practical, action-oriented, focused on implementation
3. **Mattermost Integration**: Direct API integration for posting messages with proper bot identities
4. **AI Response Generation**: Using Anthropic Claude API for intelligent responses
5. **Conversation Context**: Maintains discussion history for coherent multi-turn conversations

### Key Achievements
- ✅ Fixed MCP protocol initialization issues (proper InitializationOptions)
- ✅ Resolved Mattermost authentication (switched from Driver to direct API)
- ✅ Implemented persona-specific bot tokens for correct identity attribution
- ✅ Created unified tool dispatcher for proper MCP tool routing
- ✅ Full conversation context tracking and management

## Technical Architecture

### MCP Server Flow
```
IDE (Claude Code) <-> MCP Protocol (stdio) <-> MCP Server <-> Mattermost API
                                                    |
                                                    v
                                             Anthropic API
```

### MCP Tools Exposed
1. **read_discussion**: Retrieve recent messages from the debate channel
2. **contribute**: Post a message as a specific persona
3. **get_conversation_context**: Get a summary of the ongoing conversation

### Tool Call Format
```
Tool Name: mcp__multi-model-debate__<tool_name>
Parameters: JSON object with tool-specific arguments
```

## IDE Integration Points

### 1. MCP Server Configuration
The server runs in stdio mode and expects:
- **Input**: JSON-RPC messages via stdin
- **Output**: JSON-RPC responses via stdout
- **Errors**: Logged to stderr (won't interfere with protocol)

### 2. Starting the Server
```bash
python main.py
```
Or with the provided batch file:
```bash
start-mcp-server.bat
```

### 3. MCP Configuration File (for IDE)
```json
{
  "mcpServers": {
    "multi-model-debate": {
      "command": "python",
      "args": ["C:/Users/cyapp/multi-model-debate/multi-model-debate-mcp/main.py"],
      "cwd": "C:/Users/cyapp/multi-model-debate/multi-model-debate-mcp"
    }
  }
}
```

### 4. Environment Requirements
The server needs these environment variables (in .env file):
- `ANTHROPIC_API_KEY`: For AI generation
- `CLAUDE_RESEARCH_BOT_TOKEN`: Mattermost bot token
- `KIRO_BOT_TOKEN`: Your bot token for Mattermost

## Integration Tasks for Kiro's IDE

### Phase 1: Basic Integration
1. **Add MCP client library** to your IDE
2. **Configure MCP server** connection using the config above
3. **Test basic connectivity** with the server
4. **Implement tool calling** interface

### Phase 2: UI Integration
1. **Create debate panel** in IDE for viewing discussions
2. **Add persona selector** for choosing which AI to consult
3. **Implement message input** for user contributions
4. **Display conversation history** with proper attribution

### Phase 3: Advanced Features
1. **Auto-refresh** discussion view when new messages arrive
2. **Context-aware suggestions** based on current code/task
3. **Quick actions** for common debate prompts
4. **Export functionality** for saving debate outcomes

## Testing the Integration

### 1. Basic Connection Test
```python
# Send initialization request
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-01",
    "capabilities": {},
    "clientInfo": {"name": "kiro-ide", "version": "1.0.0"}
  },
  "id": 1
}

# Send initialized notification
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}

# List available tools
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 2
}
```

### 2. Test Tool Calling
```python
# Call contribute tool
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "contribute",
    "arguments": {
      "message": "Test message from IDE",
      "persona": "kiro"
    }
  },
  "id": 3
}
```

## Known Issues & Solutions

### Issue 1: Windows Encoding
- **Problem**: Unicode characters cause encoding errors
- **Solution**: Removed all emojis from server output

### Issue 2: MCP Tool Routing
- **Problem**: Tools were calling wrong handlers
- **Solution**: Implemented unified dispatcher (call_tool_handler)

### Issue 3: Mattermost Authentication
- **Problem**: mattermostdriver library incompatible with bearer tokens
- **Solution**: Using direct REST API calls with requests library

## Next Steps

### For Tomorrow's Testing
1. **Morning Setup**:
   - Start Mattermost server
   - Start MCP server
   - Connect from IDE

2. **Test Scenarios**:
   - Single persona conversations
   - Multi-persona debates
   - Context persistence across sessions
   - Error handling and recovery

3. **Integration Points**:
   - IDE command palette integration
   - Keyboard shortcuts for quick access
   - Status bar indicators for connection state

### Future Enhancements
1. **Additional Personas**: Add more AI personalities with specialized expertise
2. **Custom Rules**: Dynamic persona behavior based on project context
3. **Autonomous Mode**: AI-to-AI discussions with configurable limits
4. **Analytics**: Track debate outcomes and decision patterns
5. **Export Formats**: Save debates as markdown, JSON, or PDF

## Support & Troubleshooting

### Common Issues
1. **Server won't start**: Check Python environment and dependencies
2. **No Mattermost connection**: Verify tokens and server URL
3. **No AI responses**: Check ANTHROPIC_API_KEY validity
4. **Wrong bot identity**: Ensure both bot tokens are configured

### Debug Mode
Set environment variable for verbose logging:
```bash
export MCP_DEBUG=true
```

### Log Locations
- MCP logs: `C:\Users\cyapp\AppData\Local\claude-cli-nodejs\Cache\...\mcp-logs-multi-model-debate\`
- Server stderr: Visible in console when running directly

## Contact & Resources

### Key Files to Review
- `src/mcp_server.py`: Main server implementation
- `config/chat_coordination_rules.yaml`: Persona definitions
- `test_mcp_connection.py`: Example of MCP client implementation

### Dependencies
All listed in `requirements.txt` - install with:
```bash
pip install -r requirements.txt
```

---

## Quick Start for Kiro

1. **Pull latest code** from the repo
2. **Install dependencies**: `pip install -r requirements.txt`
3. **Configure .env** with your tokens
4. **Start the server**: `python main.py`
5. **Test with curl** or your IDE's MCP client

The server is ready for your IDE integration. The MCP protocol handles all the communication complexity - you just need to send JSON-RPC messages and handle the responses.

Good luck with the integration! The multi-model debate system is ready to enhance your development workflow with AI-powered collaborative discussions.