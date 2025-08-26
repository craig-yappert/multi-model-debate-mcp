#!/usr/bin/env python3
"""Test Mattermost bot access to teams and channels"""

import os
import sys
from dotenv import load_dotenv
from mattermostdriver import Driver

# Fix unicode output on Windows
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv()

def test_bot_access(bot_name, token):
    print(f"\n{'='*50}")
    print(f"Testing {bot_name}")
    print(f"Token: {token[:10]}...")
    
    driver = Driver({
        'url': 'localhost',
        'token': token,
        'scheme': 'http',
        'port': 8065,
        'verify': False
    })
    
    try:
        driver.login()
        print("✓ Login successful")
        
        # Get bot user info
        user = driver.users.get_user('me')
        print(f"✓ Bot username: {user.get('username')}")
        print(f"✓ Bot ID: {user.get('id')}")
        
        # Get teams the bot is a member of
        teams = driver.teams.get_user_teams(user['id'])
        print(f"\nTeams bot is member of: {len(teams)}")
        
        for team in teams:
            print(f"\n  Team: {team['display_name']} ({team['name']})")
            team_id = team['id']
            
            # Get channels in this team
            channels = driver.channels.get_channels_for_user(user['id'], team_id)
            print(f"  Channels in team: {len(channels)}")
            
            for channel in channels:
                print(f"    - {channel['display_name']} ({channel['name']}, type: {channel['type']})")
                
                # Check if this is the multi-model channel
                if 'multi-model' in channel['name'].lower() or 'multi-model' in channel['display_name'].lower():
                    print(f"    ✓ Found Multi-Model channel! ID: {channel['id']}")
        
        driver.logout()
        print(f"\n✓ {bot_name} test complete")
        
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()

# Test Claude-Research bot
if os.getenv("CLAUDE_RESEARCH_BOT_TOKEN"):
    test_bot_access("Claude-Research", os.getenv("CLAUDE_RESEARCH_BOT_TOKEN"))

# Test Kiro bot  
if os.getenv("KIRO_BOT_TOKEN"):
    test_bot_access("Kiro", os.getenv("KIRO_BOT_TOKEN"))

print(f"\n{'='*50}")
print("Access test complete")