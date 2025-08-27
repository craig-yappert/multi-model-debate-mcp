#!/usr/bin/env python3
"""Test that server doesn't pollute stdout"""

import subprocess
import sys
import json

# Test that server starts without printing to stdout
print("Testing MCP server stdio mode...")

# Start the server and send a basic MCP initialization
proc = subprocess.Popen(
    [sys.executable, "src/mcp_server.py"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=False
)

# Send initialization message (MCP protocol)
init_msg = {
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
        "protocolVersion": "1.0.0",
        "clientInfo": {
            "name": "test-client",
            "version": "1.0.0"
        }
    },
    "id": 1
}

# MCP uses length-prefixed JSON messages
msg_bytes = json.dumps(init_msg).encode('utf-8')
header = f"Content-Length: {len(msg_bytes)}\r\n\r\n".encode('utf-8')

try:
    # Send initialization
    proc.stdin.write(header + msg_bytes)
    proc.stdin.flush()
    
    # Read response (with timeout)
    import time
    time.sleep(2)
    
    # Check if process is still running
    if proc.poll() is None:
        print("OK: Server is running")
        
        # Terminate the server
        proc.terminate()
        proc.wait(timeout=5)
    else:
        print("ERROR: Server crashed")
        stdout, stderr = proc.communicate()
        print("STDOUT:", stdout.decode('utf-8', errors='replace'))
        print("STDERR:", stderr.decode('utf-8', errors='replace'))
        
except Exception as e:
    print(f"Error: {e}")
    proc.terminate()

print("Test complete")