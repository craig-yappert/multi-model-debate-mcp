#!/usr/bin/env python3
"""Quick MCP server test - check if server starts properly"""

import subprocess
import sys
import json
import time

def send_message(proc, message):
    """Send JSON-RPC message to server"""
    msg_bytes = json.dumps(message).encode()
    header = f"Content-Length: {len(msg_bytes)}\r\n\r\n".encode()
    proc.stdin.write(header + msg_bytes)
    proc.stdin.flush()

def read_response(proc, timeout=2):
    """Try to read response"""
    import select
    if sys.platform == "win32":
        # Windows doesn't support select on pipes, just wait briefly
        time.sleep(0.5)
        return None
    
    ready, _, _ = select.select([proc.stdout], [], [], timeout)
    if ready:
        # Read Content-Length header
        header_line = proc.stdout.readline()
        if header_line.startswith(b"Content-Length:"):
            length = int(header_line.split(b":")[1].strip())
            proc.stdout.readline()  # Empty line
            response_data = proc.stdout.read(length)
            return json.loads(response_data)
    return None

print("Testing MCP Server Quick Start...")
print("=" * 60)

# Start the server
proc = subprocess.Popen(
    [sys.executable, "main.py"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=False
)

try:
    # Wait a moment for server to start
    time.sleep(1)
    
    # Send initialization
    init_msg = {
        "jsonrpc": "2.0",
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {
                "name": "test-client",
                "version": "1.0.0"
            }
        },
        "id": 1
    }
    
    print("1. Sending initialize request...")
    send_message(proc, init_msg)
    
    # Send initialized notification
    initialized_msg = {
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
        "params": None
    }
    
    print("2. Sending initialized notification...")
    send_message(proc, initialized_msg)
    
    # Try to list tools
    list_msg = {
        "jsonrpc": "2.0",
        "method": "tools/list",
        "params": {},
        "id": 2
    }
    
    print("3. Sending tools/list request...")
    send_message(proc, list_msg)
    
    # Give server time to process
    time.sleep(1)
    
    print("\nServer appears to be running!")
    print("\nYou can now reconnect from Claude Code.")
    
finally:
    print("\nStopping server...")
    proc.terminate()
    proc.wait(timeout=2)
    
    # Print any stderr output
    stderr = proc.stderr.read()
    if stderr:
        print("\nServer logs:")
        print(stderr.decode('utf-8', errors='ignore'))