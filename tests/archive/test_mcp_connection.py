#!/usr/bin/env python3
"""Test MCP server connection and functionality"""

import json
import asyncio
import subprocess
import sys
from typing import Optional

class MCPTester:
    def __init__(self):
        self.process = None
        self.request_id = 0
    
    async def start_server(self):
        """Start the MCP server as a subprocess"""
        self.process = await asyncio.create_subprocess_exec(
            sys.executable, "src/mcp_server.py",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        print("[OK] MCP server started")
        return self.process
    
    async def read_stderr(self):
        """Read stderr messages from the server"""
        while True:
            try:
                line = await self.process.stderr.readline()
                if line:
                    print(f"[SERVER] {line.decode().strip()}")
                else:
                    break
            except:
                break
    
    async def send_request(self, method: str, params: Optional[dict] = None):
        """Send a JSON-RPC request to the server"""
        self.request_id += 1
        request = {
            "jsonrpc": "2.0",
            "method": method,
            "id": self.request_id
        }
        if params:
            request["params"] = params
        
        request_str = json.dumps(request) + "\n"
        self.process.stdin.write(request_str.encode())
        await self.process.stdin.drain()
        
        # Read response
        response_line = await self.process.stdout.readline()
        if response_line:
            return json.loads(response_line.decode())
        return None
    
    async def test_connection(self):
        """Test MCP connection with proper initialization"""
        print("\n=== Testing MCP Server Connection ===\n")
        
        # Start server
        await self.start_server()
        await asyncio.sleep(1)  # Give server time to initialize
        
        # Read any stderr messages
        asyncio.create_task(self.read_stderr())
        
        # Test 1: Initialize  
        print("1. Testing initialize...")
        init_response = await self.send_request("initialize", {
            "protocolVersion": "2025-06-18",  # Use the correct protocol version
            "capabilities": {},
            "clientInfo": {
                "name": "test-client",
                "version": "1.0.0"
            }
        })
        
        if init_response and "result" in init_response:
            print(f"[OK] Initialize successful: {init_response['result'].get('serverInfo', {}).get('name', 'Unknown')}")
        else:
            print(f"[FAIL] Initialize failed: {init_response}")
            return False
        
        # Send initialized notification
        initialized_msg = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": None
        }
        msg_bytes = json.dumps(initialized_msg).encode()
        header = f"Content-Length: {len(msg_bytes)}\r\n\r\n".encode()
        self.process.stdin.write(header + msg_bytes)
        await self.process.stdin.drain()
        
        # Brief pause to ensure notification is processed
        await asyncio.sleep(0.1)
        
        # Test 2: List tools
        print("\n2. Testing tools/list...")
        tools_response = await self.send_request("tools/list")
        
        if tools_response and "result" in tools_response:
            tools = tools_response["result"].get("tools", [])
            print(f"[OK] Found {len(tools)} tools:")
            for tool in tools:
                print(f"   - {tool['name']}: {tool['description'][:50]}...")
        else:
            print(f"[FAIL] List tools failed: {tools_response}")
            return False
        
        # Test 3: Call a tool
        print("\n3. Testing tool call (read_discussion)...")
        tool_response = await self.send_request("tools/call", {
            "name": "read_discussion",
            "arguments": {"limit": 5}
        })
        
        if tool_response and "result" in tool_response:
            content = tool_response["result"].get("content", [])
            if content:
                print(f"[OK] Tool call successful: {content[0].get('text', '')[:100]}...")
            else:
                print("[OK] Tool call successful (no content)")
        else:
            print(f"[FAIL] Tool call failed: {tool_response}")
            return False
        
        print("\n[OK] All tests passed! MCP server is working correctly.")
        return True
    
    async def cleanup(self):
        """Clean up the server process"""
        if self.process:
            self.process.terminate()
            await self.process.wait()
            print("\n[OK] Server stopped")

async def main():
    tester = MCPTester()
    try:
        success = await tester.test_connection()
        if not success:
            print("\n[WARNING] Some tests failed. Check the server configuration.")
            sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Error during testing: {e}")
        sys.exit(1)
    finally:
        await tester.cleanup()

if __name__ == "__main__":
    asyncio.run(main())