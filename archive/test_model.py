#!/usr/bin/env python3
"""Test Anthropic API connection"""

import os
import sys
import io
from dotenv import load_dotenv
import anthropic

# Fix unicode on Windows
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv()

api_key = os.getenv("ANTHROPIC_API_KEY")
print(f"Testing with API key: {api_key[:15]}...")

client = anthropic.Anthropic(api_key=api_key)

try:
    # Test with Sonnet
    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=100,
        messages=[{"role": "user", "content": "Say 'Hello from Claude-Research!' and nothing else."}]
    )
    print(f"✓ Sonnet response: {response.content[0].text}")
    
except Exception as e:
    print(f"✗ Error: {e}")