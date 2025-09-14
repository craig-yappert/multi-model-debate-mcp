# Claude Code MCP Server Setup Guide

## 🚀 Quick Setup

The MCP server is ready! Follow these steps to connect it to Claude Code:

### Step 1: Add MCP Server to Claude Code

1. **Open Claude Code Settings**
   - Click the gear icon ⚙️ in Claude Code
   - Go to "MCP Servers" section

2. **Add New MCP Server**
   - Click "Add Server"
   - Copy and paste this configuration:

```json
{
  "command": "python",
  "args": ["src/mcp_server.py"],
  "cwd": "C:\\Users\\cyapp\\multi-model-debate\\multi-model-debate-mcp",
  "env": {
    "PYTHONPATH": "C:\\Users\\cyapp\\multi-model-debate\\multi-model-debate-mcp"
  }
}
```

3. **Name the server**: `multi-model-debate`

### Step 2: Set Environment Variables (Optional)

If you want full Mattermost integration, add these to the env section:
```json
"env": {
  "PYTHONPATH": "C:\\Users\\cyapp\\multi-model-debate\\multi-model-debate-mcp",
  "ANTHROPIC_API_KEY": "your_anthropic_api_key_here",
  "CLAUDE_RESEARCH_BOT_TOKEN": "your_mattermost_bot_token_here"
}
```

### Step 3: Restart Claude Code

Close and reopen Claude Code to load the new MCP server.

### Step 4: Test Connection

In Claude Code, you should now see these new tools available:
- 📖 `read_discussion` - Read recent Mattermost messages
- 💬 `contribute` - Post as different personas (claude_research, kiro)
- 🧠 `get_conversation_context` - Analyze team discussion

## 🔧 Available Tools

### `read_discussion`
Reads recent messages from the Mattermost channel.
- **Parameters**: `limit` (number of messages, default: 10)

### `contribute`
Posts a message as a specific persona.
- **Parameters**: 
  - `message` (required): The message content
  - `persona` (optional): "claude_research" or "kiro", default: "claude_research"
  - `autonomous` (optional): Enable autonomous collaboration mode

### `get_conversation_context`
Analyzes the current discussion for context and key topics.
- **Parameters**: None

## 🎭 Available Personas

- **claude-research**: Deep analytical thinking, strategic perspective
- **kiro**: Practical feasibility, implementation focus, action-oriented

## ✅ Success Indicators

When working correctly, you should be able to:
1. Use `read_discussion` to see recent Mattermost messages in Claude Code
2. Use `contribute` to post messages to Mattermost as different personas
3. See real-time collaboration between IDE and team chat

## 🔄 Testing

1. In Claude Code, try: "Use read_discussion to see recent team messages"
2. Try: "Use contribute to post a message as claude_research saying 'MCP integration test successful!'"
3. Check your Mattermost channel for the message

## 🐛 Troubleshooting

**Server won't start**: 
- Check Python is in PATH
- Verify the working directory path is correct
- Check Claude Code logs for detailed error messages

**Can't connect to Mattermost**:
- Server will work in offline mode for testing
- Add environment variables for full integration

**Tools not showing**:
- Restart Claude Code
- Check MCP server logs in Claude Code settings