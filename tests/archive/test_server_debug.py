#!/usr/bin/env python3
"""
Debug script to test MCP server startup
"""

import os
import sys
import asyncio
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

print("=" * 60)
print("MCP SERVER DEBUG TEST")
print("=" * 60)

# Check environment variables
print("\n1. Environment Variables Check:")
print("-" * 40)

api_key = os.getenv("ANTHROPIC_API_KEY")
bot_token = os.getenv("CLAUDE_RESEARCH_BOT_TOKEN")

if api_key:
    print(f"  [OK] ANTHROPIC_API_KEY: {'*' * 10}{api_key[-4:]}")
else:
    print("  [ERROR] ANTHROPIC_API_KEY: Not found")

if bot_token:
    print(f"  [OK] CLAUDE_RESEARCH_BOT_TOKEN: {'*' * 10}{bot_token[-4:]}")
else:
    print("  [WARNING] CLAUDE_RESEARCH_BOT_TOKEN: Not found (optional)")

# Check imports
print("\n2. Python Imports Check:")
print("-" * 40)

try:
    import mcp
    print("  [OK] mcp package imported")
except ImportError as e:
    print(f"  [ERROR] mcp package: {e}")

try:
    import anthropic
    print("  [OK] anthropic package imported")
    print(f"      Version: {anthropic.__version__}")
except ImportError as e:
    print(f"  [ERROR] anthropic package: {e}")

try:
    import mattermostdriver
    print("  [OK] mattermostdriver package imported")
except ImportError as e:
    print(f"  [ERROR] mattermostdriver package: {e}")

try:
    import yaml
    print("  [OK] yaml package imported")
except ImportError as e:
    print(f"  [ERROR] yaml package: {e}")

# Check configuration file
print("\n3. Configuration File Check:")
print("-" * 40)

config_file = "config/chat_coordination_rules.yaml"
if os.path.exists(config_file):
    print(f"  [OK] Configuration file exists: {config_file}")
    try:
        with open(config_file, 'r') as f:
            import yaml
            config = yaml.safe_load(f)
            print(f"      Teams: {list(config.get('teams', {}).keys())}")
            print(f"      Personas: {list(config.get('personas', {}).keys())}")
    except Exception as e:
        print(f"  [ERROR] Failed to load configuration: {e}")
else:
    print(f"  [ERROR] Configuration file not found: {config_file}")

# Try to initialize Anthropic client
print("\n4. Anthropic Client Check:")
print("-" * 40)

if api_key:
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        print("  [OK] Anthropic client initialized")
    except Exception as e:
        print(f"  [ERROR] Failed to initialize Anthropic client: {e}")
else:
    print("  [SKIP] No API key available")

# Try basic server initialization
print("\n5. MCP Server Initialization Check:")
print("-" * 40)

try:
    from mcp.server import Server
    from mcp.types import Tool, TextContent
    server = Server("test-server")
    print("  [OK] MCP Server initialized")
except Exception as e:
    print(f"  [ERROR] Failed to initialize MCP Server: {e}")
    import traceback
    traceback.print_exc()

print("\n6. Full Server Startup Test:")
print("-" * 40)

try:
    # Import the server
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from src.mcp_server import MultiModelMCPServer
    
    print("  [OK] Server module imported")
    
    # Try to create server instance
    server = MultiModelMCPServer()
    print("  [OK] Server instance created")
    
    async def test_run():
        print("  [INFO] Testing server startup (will timeout in 3 seconds)...")
        try:
            # Create a task for the server
            task = asyncio.create_task(server.run())
            # Wait for 3 seconds
            await asyncio.sleep(3)
            # Cancel the task
            task.cancel()
            print("  [OK] Server started successfully")
        except Exception as e:
            print(f"  [ERROR] Server startup failed: {e}")
            import traceback
            traceback.print_exc()
    
    asyncio.run(test_run())
    
except Exception as e:
    print(f"  [ERROR] Failed to import or run server: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("DEBUG TEST COMPLETE")
print("=" * 60)