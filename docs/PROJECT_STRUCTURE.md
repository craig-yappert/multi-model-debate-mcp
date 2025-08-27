# Multi-Model Debate MCP Server - Project Structure

## Directory Layout

```
multi-model-debate-mcp/
├── src/                          # Source code
│   └── mcp_server.py            # Main MCP server implementation
│
├── config/                       # Configuration files
│   └── chat_coordination_rules.yaml  # Personas and collaboration rules
│
├── tests/                        # Test files
│   ├── archive/                 # Archived test scripts
│   └── test_mcp_server.py      # Unit tests
│
├── deployment/                   # Deployment configurations
│   ├── docker-compose.yml      # Docker orchestration
│   └── Dockerfile              # Container definition
│
├── docs/                        # Documentation
│   └── (handoff documents)
│
├── main.py                      # Entry point for MCP server
├── requirements.txt             # Python dependencies
├── .env                        # Environment variables (API keys, tokens)
├── .env.example                # Template for environment variables
└── README.md                   # Project documentation
```

## Key Files

### Core Server
- `main.py`: Entry point that initializes and runs the MCP server
- `src/mcp_server.py`: Complete MCP server implementation with:
  - MCP protocol handling
  - Mattermost integration (direct API)
  - AI response generation (Anthropic)
  - Conversation context management
  - Multiple persona support

### Configuration
- `config/chat_coordination_rules.yaml`: Defines AI personas and their behaviors
- `.env`: Contains sensitive configuration (API keys, bot tokens)

### Deployment
- `docker-compose.yml`: Orchestrates the MCP server with Mattermost
- `Dockerfile`: Builds the MCP server container

## Environment Variables

Required in `.env`:
- `ANTHROPIC_API_KEY`: For AI response generation
- `CLAUDE_RESEARCH_BOT_TOKEN`: Mattermost bot token for Claude-Research
- `KIRO_BOT_TOKEN`: Mattermost bot token for Kiro
- `MATTERMOST_URL`: Mattermost server (default: localhost)
- `MATTERMOST_PORT`: Mattermost port (default: 8065)
- `MATTERMOST_SCHEME`: HTTP or HTTPS (default: http)