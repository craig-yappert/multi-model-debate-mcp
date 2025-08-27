#!/usr/bin/env python3
"""
Multi-Model Debate MCP Server
Main entry point
"""

import sys
import asyncio
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from mcp_server import MultiModelMCPServer

async def main():
    """Main entry point"""
    print("Starting Multi-Model Debate MCP Server...")
    server = MultiModelMCPServer()
    await server.run()

if __name__ == "__main__":
    asyncio.run(main())