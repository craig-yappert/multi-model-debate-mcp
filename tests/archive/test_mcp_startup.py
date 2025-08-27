#!/usr/bin/env python3
"""Test MCP server startup messages"""

import sys
import os
import asyncio
from dotenv import load_dotenv

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load environment
load_dotenv()

print("Testing MCP Server Startup...")
print("-" * 60)

# Import and initialize server
from src.mcp_server import MultiModelMCPServer

try:
    server = MultiModelMCPServer()
    print("\n[SUCCESS] MCP Server initialized successfully!")
    print(f"- Configuration loaded: {server.config_file}")
    print(f"- Personas available: {list(server.config.get('personas', {}).keys())}")
    print(f"- Anthropic client: {'Ready' if server.anthropic_client else 'Not configured (Demo mode)'}")
    print(f"- Mattermost connection: {'Connected' if server.mattermost else 'Not connected (Demo mode)'}")
    print(f"- Server is ready to accept MCP client connections")
    
except Exception as e:
    print(f"\n[ERROR] Failed to initialize server: {e}")
    import traceback
    traceback.print_exc()