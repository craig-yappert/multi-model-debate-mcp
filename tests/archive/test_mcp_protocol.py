#!/usr/bin/env python3
"""Test MCP protocol communication with the server"""

import subprocess
import sys
import json
import time

def send_message(proc, message):
    """Send a JSON-RPC message to the server"""
    msg_bytes = json.dumps(message).encode('utf-8')
    header = f"Content-Length: {len(msg_bytes)}\r\n\r\n".encode('utf-8')
    proc.stdin.write(header + msg_bytes)
    proc.stdin.flush()

def read_message(proc, timeout=2):
    """Try to read a message from the server"""
    import select
    
    # Use a simple timeout approach
    start = time.time()
    buffer = b""
    
    while time.time() - start < timeout:
        # Check if data is available
        try:
            chunk = proc.stdout.read1(1024)
            if chunk:
                buffer += chunk
                # Check if we have a complete message
                if b"\r\n\r\n" in buffer:
                    header, body = buffer.split(b"\r\n\r\n", 1)
                    # Parse content length
                    for line in header.split(b"\r\n"):
                        if line.startswith(b"Content-Length:"):
                            length = int(line.split(b":")[1].strip())
                            if len(body) >= length:
                                message = body[:length]
                                return json.loads(message.decode('utf-8'))
        except:
            pass
        time.sleep(0.1)
    
    return None

print("Testing MCP Protocol Communication")
print("=" * 60)

# Start the server
proc = subprocess.Popen(
    [sys.executable, "src/mcp_server.py"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=False
)

try:
    # Test 1: Initialize
    print("\n1. Testing initialize request...")
    init_msg = {
        "jsonrpc": "2.0",
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "clientInfo": {
                "name": "test-client",
                "version": "1.0.0"
            },
            "capabilities": {}
        },
        "id": 1
    }
    
    send_message(proc, init_msg)
    response = read_message(proc)
    
    if response:
        print(f"   Response: {json.dumps(response, indent=2)}")
    else:
        print("   ERROR: No response received")
        # Check stderr
        stderr = proc.stderr.read1(1024).decode('utf-8', errors='replace')
        if stderr:
            print(f"   STDERR: {stderr}")
    
    # Test 2: List tools
    print("\n2. Testing tools/list request...")
    list_msg = {
        "jsonrpc": "2.0",
        "method": "tools/list",
        "params": {},
        "id": 2
    }
    
    send_message(proc, list_msg)
    response = read_message(proc)
    
    if response:
        print(f"   Response: {json.dumps(response, indent=2)}")
    else:
        print("   ERROR: No response received")
    
    # Test 3: Call a tool
    print("\n3. Testing tool call (read_discussion)...")
    call_msg = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "read_discussion",
            "arguments": {"limit": 5}
        },
        "id": 3
    }
    
    send_message(proc, call_msg)
    response = read_message(proc)
    
    if response:
        print(f"   Response: {json.dumps(response, indent=2)}")
    else:
        print("   ERROR: No response received")
    
finally:
    print("\n" + "=" * 60)
    print("Shutting down server...")
    proc.terminate()
    proc.wait(timeout=5)
    
    # Get any remaining stderr
    stderr = proc.stderr.read().decode('utf-8', errors='replace')
    if stderr:
        print("\nServer logs (stderr):")
        print(stderr)

print("\nTest complete")