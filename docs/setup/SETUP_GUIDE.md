# 🛠️ Complete Setup Guide

## Prerequisites

Before you begin, ensure you have:

- **Python 3.10+** installed
- **Git** for cloning the repository
- **Mattermost server** (local Docker or hosted instance)
- **Anthropic API account** with available credits
- **Claude Code** or another MCP-compatible client

## Step 1: Repository Setup

```bash
# Clone the repository
git clone <your-repository-url>
cd multi-model-debate-mcp

# Create virtual environment (recommended)
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Step 2: Mattermost Server Setup

### Option A: Docker (Recommended for Testing)

```bash
# Start Mattermost with Docker
cd deployment
docker-compose up -d

# Wait for startup (30-60 seconds)
# Access Mattermost at http://localhost:8065
```

**Detailed Setup**: See [`MATTERMOST_SETUP.md`](MATTERMOST_SETUP.md) for complete Mattermost configuration including bot creation steps.

### Option B: Existing Mattermost Server

If you have an existing Mattermost instance, ensure:
- You have admin access to create bot accounts
- Server is accessible from your development machine
- WebSocket connections are allowed

## Step 3: Mattermost Bot Configuration

1. **Create System Admin Account** (if using Docker setup)
   - Go to http://localhost:8065
   - Create your admin account
   - Complete initial setup

2. **Create Bot Accounts**

   **For claude-research bot:**
   - Go to System Console → Integrations → Bot Accounts
   - Click "Create Bot Account"
   - Name: `claude-research`
   - Username: `claude-research`
   - Role: User (not admin)
   - Copy the generated token

   **For kiro bot (optional):**
   - Repeat process with name/username: `kiro`
   - Copy the generated token

3. **Create Team and Channel**
   - Create a team (e.g., "Multi-Model Debate")
   - Create a channel (e.g., "general")
   - Add both bots to the team and channel
   - Note the channel ID from the URL

## Step 4: Environment Configuration

1. **Copy environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` file with your credentials:**
   ```bash
   # Anthropic API (REQUIRED)
   ANTHROPIC_API_KEY=sk-ant-your-api-key-here

   # Mattermost Bot Tokens (REQUIRED)
   CLAUDE_RESEARCH_BOT_TOKEN=your-claude-research-bot-token-here
   KIRO_BOT_TOKEN=your-kiro-bot-token-here

   # Mattermost Server Settings
   MATTERMOST_URL=localhost          # Change if using hosted server
   MATTERMOST_PORT=8065             # Change if using different port
   MATTERMOST_SCHEME=http           # Change to https for production
   ```

## Step 5: Configuration File

The server uses `config/chat_coordination_rules.yaml` for persona definitions. The default configuration should work, but you can customize:

```yaml
personas:
  claude_research:
    name: "Claude-Research"
    role: "Research Lead"
    description: "Deep analytical thinking and strategic perspective"
  kiro:
    name: "Kiro"
    role: "Execution Expert"
    description: "Practical solutions and implementation focus"

team:
  name: "multi-model-debate"
  channel: "general"

autonomous_collaboration:
  enabled: true
  max_exchanges: 3
  trigger_keywords: ["@all", "everyone", "team"]
```

## Step 6: Test the Server

```bash
# Test basic server startup
python src/mcp_server.py

# Expected output:
# INFO - Configuration loaded from config/chat_coordination_rules.yaml
# INFO - Connected to Mattermost as claude-research
# MCP server started successfully

# Stop with Ctrl+C
```

## Step 7: Claude Code Integration

1. **Find your Claude Code config file:**
   - Windows: `%APPDATA%\Claude Code\mcp_config.json`
   - macOS: `~/Library/Application Support/Claude Code/mcp_config.json`
   - Linux: `~/.config/claude-code/mcp_config.json`

2. **Add MCP server configuration:**
   ```json
   {
     "mcpServers": {
       "multi-model-debate": {
         "command": "python",
         "args": ["src/mcp_server.py"],
         "cwd": "/full/path/to/multi-model-debate-mcp",
         "env": {
           "PYTHONUNBUFFERED": "1"
         }
       }
     }
   }
   ```

3. **Restart Claude Code**

4. **Verify MCP Tools Available**
   - Look for tools prefixed with `mcp__multi-model-debate__`
   - Should see: `read_discussion`, `contribute`, `get_conversation_context`, `subscribe_notifications`, `unsubscribe_notifications`

## Step 8: First Test

In Claude Code, test the integration:

1. **Subscribe to notifications:**
   ```
   Use tool: mcp__multi-model-debate__subscribe_notifications
   ```

2. **Post a test message:**
   ```
   Use tool: mcp__multi-model-debate__contribute
   Message: "Testing the multi-model debate system!"
   Persona: claude_research
   ```

3. **Read the discussion:**
   ```
   Use tool: mcp__multi-model-debate__read_discussion
   Limit: 5
   ```

You should see your test message and an AI response in the Mattermost channel.

## Troubleshooting

### Server Won't Start

**"Configuration file not found":**
```bash
# Ensure you're in the correct directory
pwd
# Should end with: multi-model-debate-mcp

# Check if config file exists
ls config/chat_coordination_rules.yaml
```

**"Anthropic API key not configured":**
```bash
# Check .env file
cat .env | grep ANTHROPIC_API_KEY
# Should show: ANTHROPIC_API_KEY=sk-ant-...
```

### Mattermost Connection Failed

**"Cannot connect to Mattermost server":**
- Verify Mattermost is running: http://localhost:8065
- Check Docker containers: `docker-compose ps`
- Review server logs: `docker-compose logs mattermost`

**"Authentication failed":**
- Verify bot token is correct in `.env`
- Check that bot account exists in Mattermost
- Ensure bot has access to the team/channel

### Claude Code Integration

**"MCP tools not appearing":**
- Verify server starts without errors
- Check Claude Code MCP configuration path
- Restart Claude Code completely
- Check Claude Code logs for connection errors

**"Permission denied" or "Command not found":**
- Use absolute paths in MCP configuration
- Ensure Python is in system PATH
- Verify virtual environment is activated if using one

### API Issues

**"Anthropic API rate limit":**
- Check your API usage at console.anthropic.com
- Verify you have available credits
- Consider implementing rate limiting in config

**"Message posting failed":**
- Verify bot has permission to post in channel
- Check channel ID matches your Mattermost setup
- Review server error logs for details

## Advanced Configuration

### Custom Channel ID

To use a different Mattermost channel:

1. Navigate to your channel in Mattermost
2. Note the channel ID from the URL: `/channels/{channel-id}`
3. Update `src/mcp_server.py` line with channel ID (search for `self.channel_id`)

### Production Deployment

For production use:
- Use HTTPS for Mattermost (`MATTERMOST_SCHEME=https`)
- Set up proper SSL certificates
- Configure firewall rules
- Use environment variables instead of .env file
- Set up monitoring and logging
- Consider Docker deployment with `deployment/docker-compose.yml`

### Multiple Teams

To support multiple teams, you'll need to:
- Modify server to accept channel/team parameters
- Create separate bot accounts per team
- Update configuration to support multi-team setup

---

## Quick Reference

**Start server:** `python src/mcp_server.py`
**Test tools:** Use Claude Code MCP tools
**View logs:** Server outputs to stderr
**Mattermost admin:** http://localhost:8065 → System Console
**Stop Docker:** `docker-compose down`

**Support:** Check `../current/STATUS.md` for common issues and solutions.