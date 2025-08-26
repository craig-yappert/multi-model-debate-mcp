#!/usr/bin/env python3
"""Test posting a message to Mattermost"""

import os
import sys
import io
from dotenv import load_dotenv
from mattermostdriver import Driver

# Fix unicode on Windows
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv()

# Connect as Claude-Research
token = os.getenv("CLAUDE_RESEARCH_BOT_TOKEN")
print(f"Connecting with token: {token[:10]}...")

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
    
    # Get bot info
    user = driver.users.get_user('me')
    bot_id = user['id']
    print(f"✓ Bot: {user['username']} (ID: {bot_id})")
    
    # Find the Multi-Model channel
    teams = driver.teams.get_user_teams(bot_id)
    channel_id = None
    
    for team in teams:
        if 'zeeba' in team['name'].lower():
            print(f"✓ Found team: {team['display_name']}")
            channels = driver.channels.get_channels_for_user(bot_id, team['id'])
            
            for channel in channels:
                if 'multi-model' in channel['name'].lower():
                    channel_id = channel['id']
                    print(f"✓ Found channel: {channel['display_name']} (ID: {channel_id})")
                    break
    
    if channel_id:
        # Post a test message
        post = driver.posts.create_post({
            'channel_id': channel_id,
            'message': "🤖 Claude-Research online! Ready for collaborative discussions."
        })
        print(f"✓ Message posted! (ID: {post['id']})")
    else:
        print("✗ Could not find Multi-Model channel")
    
    driver.logout()
    print("\n✓ Test complete!")
    
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()