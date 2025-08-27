#!/usr/bin/env python3
"""Test Mattermost connection with bot tokens"""

import os
from dotenv import load_dotenv
from mattermostdriver import Driver

# Load environment
load_dotenv()

def test_mattermost_connection():
    """Test Mattermost connection with both bot tokens"""
    
    tokens = {
        'claude-research': os.getenv("CLAUDE_RESEARCH_BOT_TOKEN"),
        'kiro': os.getenv("KIRO_BOT_TOKEN")
    }
    
    for persona, token in tokens.items():
        if not token or token == "your_mattermost_bot_token_here":
            print(f"[SKIP] {persona}: Token not configured")
            continue
        
        print(f"Testing {persona} (token: {token[:10]}...)")
        
        try:
            # Create driver
            driver = Driver({
                'url': 'localhost',
                'token': token,
                'scheme': 'http',
                'port': 8065,
                'verify': False,
                'auth': 'bearer'
            })
            
            # Test connection
            print(f"  Connecting to http://localhost:8065...")
            # Use the correct API call format
            driver.login()  # Required for bearer token auth
            user = driver.api['users'].get_user('me')
            print(f"  [OK] Connected as: {user.get('username', 'unknown')}")
            print(f"  User ID: {user.get('id', 'unknown')}")
            print(f"  Email: {user.get('email', 'unknown')}")
            
            # Test channel access
            channel_id = "f9pna31wginu3nuwezi6boeura"
            try:
                channel = driver.channels.get_channel(channel_id)
                print(f"  Channel: {channel.get('display_name', 'unknown')}")
            except Exception as e:
                print(f"  [WARN] Channel access failed: {str(e)}")
            
        except Exception as e:
            print(f"  [ERROR] Connection failed: {str(e)}")
        
        print()

if __name__ == "__main__":
    print("Testing Mattermost Bot Connections")
    print("=" * 50)
    test_mattermost_connection()