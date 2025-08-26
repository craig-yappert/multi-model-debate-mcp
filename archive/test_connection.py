#!/usr/bin/env python3
"""Test Mattermost connection"""

import os
from dotenv import load_dotenv
from mattermostdriver import Driver

load_dotenv()

# Test with Claude-Research token
token = os.getenv("CLAUDE_RESEARCH_BOT_TOKEN")
print(f"Testing with token: {token[:10]}...")

driver = Driver({
    'url': 'localhost',
    'token': token,
    'scheme': 'http',
    'port': 8065,
    'verify': False
})

try:
    driver.login()
    print("Login successful!")
    
    # Get user info
    user = driver.users.get_user('me')
    print(f"Bot name: {user.get('username')}")
    print(f"Bot ID: {user.get('id')}")
    
    # Get teams
    teams = driver.teams.get_teams()
    print(f"\nTeams found: {len(teams)}")
    for team in teams:
        print(f"  - {team['display_name']} ({team['name']})")
    
    # Get all teams (not just the bot's teams)
    all_teams = driver.teams.get_all_teams()
    print(f"\nAll teams in system: {len(all_teams)}")
    for team in all_teams:
        print(f"  - {team['display_name']} ({team['name']})")
    
    driver.logout()
    print("\nConnection test successful!")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()