#!/usr/bin/env python3
"""Minimal MCP server for testing"""

import asyncio
import logging
import sys
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.server.models import InitializationOptions
from mcp.types import Tool, TextContent, ServerCapabilities

# Configure logging to stderr
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stderr)]
)
logger = logging.getLogger(__name__)

async def main():
    """Run a minimal MCP server"""
    server = Server("simple-test-server")
    
    @server.list_tools()
    async def list_tools() -> list[Tool]:
        """List available tools"""
        return [
            Tool(
                name="test_tool",
                description="A simple test tool",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "Test message"
                        }
                    }
                }
            )
        ]
    
    @server.call_tool()
    async def test_tool(arguments: dict) -> list[TextContent]:
        """Simple test tool"""
        message = arguments.get("message", "no message")
        return [TextContent(type="text", text=f"Echo: {message}")]
    
    logger.info("Starting simple MCP server...")
    
    async with stdio_server() as (read_stream, write_stream):
        init_options = InitializationOptions(
            server_name="simple-test-server",
            server_version="1.0.0",
            capabilities=ServerCapabilities(tools={})
        )
        await server.run(read_stream, write_stream, init_options)

if __name__ == "__main__":
    asyncio.run(main())