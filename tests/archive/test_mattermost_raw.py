#!/usr/bin/env python3
"""Test Mattermost connection using direct API calls"""

import os
import requests
from dotenv import load_dotenv

# Load environment
load_dotenv()

def test_direct_api():
    """Test Mattermost API directly with bot tokens"""
    
    base_url = "http://localhost:8065/api/v4"
    tokens = {
        'claude-research': os.getenv("CLAUDE_RESEARCH_BOT_TOKEN"),
        'kiro': os.getenv("KIRO_BOT_TOKEN")
    }
    
    for persona, token in tokens.items():
        if not token or token == "your_mattermost_bot_token_here":
            print(f"[SKIP] {persona}: Token not configured")
            continue
        
        print(f"Testing {persona} (token: {token[:10]}...)")
        
        # Test getting user info
        headers = {
            "Authorization": f"Bearer {token}"
        }
        
        try:
            # Get current user
            response = requests.get(f"{base_url}/users/me", headers=headers)
            if response.status_code == 200:
                user = response.json()
                print(f"  [OK] Connected as: {user.get('username', 'unknown')}")
                print(f"  User ID: {user.get('id', 'unknown')}")
                print(f"  Bot: {user.get('is_bot', False)}")
            else:
                print(f"  [ERROR] Failed to get user: {response.status_code} - {response.text}")
            
            # Test channel access
            channel_id = "f9pna31wginu3nuwezi6boeura"
            response = requests.get(f"{base_url}/channels/{channel_id}", headers=headers)
            if response.status_code == 200:
                channel = response.json()
                print(f"  [OK] Channel: {channel.get('display_name', 'unknown')}")
            else:
                print(f"  [ERROR] Channel access failed: {response.status_code}")
            
            # Test posting a message
            post_data = {
                "channel_id": channel_id,
                "message": f"Test message from {persona} bot via MCP"
            }
            response = requests.post(f"{base_url}/posts", json=post_data, headers=headers)
            if response.status_code == 201:
                print(f"  [OK] Successfully posted test message")
            else:
                print(f"  [ERROR] Failed to post: {response.status_code}")
                
        except Exception as e:
            print(f"  [ERROR] Connection failed: {str(e)}")
        
        print()

if __name__ == "__main__":
    print("Testing Mattermost Direct API")
    print("=" * 50)
    test_direct_api()