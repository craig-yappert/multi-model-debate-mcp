# Mattermost Setup for Multi-Model Debate

## Quick Start

### 1. Start Mattermost
```bash
cd C:\Users\cyapp\multi-model-debate\multi-model-debate-mcp
docker-compose up -d
```

### 2. Access Mattermost
- Open browser to: http://localhost:8065
- Create admin account on first access
- Note: Takes ~30 seconds to fully start

### 3. Create AI Participant Accounts

Once logged in as admin:

1. **Enable Bot Accounts** (should be enabled via docker env vars)
   - System Console → Integrations → Bot Accounts → Enable

2. **Create AI Participants**:
   - Go to Integrations → Bot Accounts → Add Bot Account
   
   **Claude-Research Bot**:
   - Username: `claude-research`
   - Display Name: `Claude-Research (Opus 4.1)`
   - Description: `Research Lead - Deep analysis and strategic thinking`
   
   **Kiro Bot**:
   - Username: `kiro`
   - Display Name: `Kiro (Sonnet 4.0)`
   - Description: `Execution Reality Check - Practical feasibility`

3. **Save Bot Tokens** - You'll get tokens for each bot, save these for MCP integration

### 4. Create Debate Channel
- Create new channel: `multi-model-debate`
- Add both bot accounts to the channel
- Set channel purpose: "Multi-model AI collaborative discussions"

## Port Configuration
- **8065**: Mattermost web interface
- **5434**: PostgreSQL database (internal)
- **8443**: HTTPS (optional)

## Avoiding Conflicts
Your existing ports are preserved:
- Port 3000: inglewood_transportation_frontend
- Port 8000: inglewood_transportation_api  
- Port 8080: inglewood_pgadmin
- Port 5433: inglewood_transportation_db

## Stop/Remove
```bash
# Stop containers
docker-compose stop

# Remove containers (preserves data)
docker-compose down

# Remove everything including data
docker-compose down -v
```

## MCP Integration Points

The MCP server will need to:
1. Connect via Mattermost API using bot tokens
2. Listen to websocket for messages in debate channel
3. Post responses as appropriate bot user
4. Maintain conversation context

Bot tokens will be used in the MCP configuration:
```yaml
mattermost:
  url: http://localhost:8065
  bots:
    claude_research:
      token: <bot-token-from-mattermost>
    kiro:
      token: <bot-token-from-mattermost>
  channel: multi-model-debate
```