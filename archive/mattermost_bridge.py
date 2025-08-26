#!/usr/bin/env python3
"""
Basic Mattermost-MCP Bridge for Multi-Model Debate
This connects AI models to Mattermost for collaborative discussions
"""

import os
import sys
import asyncio
import json
import io
from typing import Dict, Optional
from dotenv import load_dotenv
from mattermostdriver import Driver
import anthropic

# Fix unicode output on Windows
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Load environment variables
load_dotenv()

class AIParticipant:
    """Represents an AI model participant in the discussion"""
    
    def __init__(self, name: str, token: str, model: str, persona: str):
        self.name = name
        self.token = token
        self.model = model
        self.persona = persona
        self.client = None
        
    def initialize_client(self):
        """Initialize the AI client based on model type"""
        if "claude" in self.model.lower():
            self.client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    
    async def generate_response(self, message: str, context: str = "") -> str:
        """Generate a response from this AI participant"""
        if not self.client:
            return f"[{self.name} is not properly configured]"
        
        try:
            # Build the prompt with persona and context
            prompt = f"{self.persona}\n\nContext:\n{context}\n\nMessage to respond to:\n{message}\n\nYour response:"
            
            if isinstance(self.client, anthropic.Anthropic):
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=1000,
                    messages=[{"role": "user", "content": prompt}]
                )
                return response.content[0].text
        except Exception as e:
            return f"[{self.name} encountered an error: {str(e)}]"

class MattermostBridge:
    """Bridge between Mattermost and AI models"""
    
    def __init__(self):
        self.mm_url = os.getenv("MATTERMOST_URL", "http://localhost:8065")
        self.team_name = os.getenv("MATTERMOST_TEAM", "zeeba-consulting")
        self.channel_name = os.getenv("MATTERMOST_CHANNEL", "multi-model")
        
        # Initialize participants
        self.participants = self._initialize_participants()
        
        # Mattermost drivers for each bot
        self.drivers = {}
        self.team_id = None
        self.channel_id = None
        self.bot_user_ids = {}
        
    def _initialize_participants(self) -> Dict[str, AIParticipant]:
        """Initialize AI participants with their personas"""
        participants = {}
        
        # Claude-Research (Opus 4.1)
        if os.getenv("CLAUDE_RESEARCH_BOT_TOKEN"):
            participants["claude-research"] = AIParticipant(
                name="Claude-Research",
                token=os.getenv("CLAUDE_RESEARCH_BOT_TOKEN"),
                model="claude-3-5-sonnet-20241022",  # Using Sonnet for now as Opus may not be available
                persona="""You are Claude-Research, the Research Lead in collaborative discussions.
Your role is to provide deep, analytical perspectives on complex problems.
Consider long-term implications, challenge assumptions, and ask probing questions.
Be thorough but concise. Build on others' points while adding analytical depth."""
            )
        
        # Kiro (Sonnet 4.0)
        if os.getenv("KIRO_BOT_TOKEN"):
            participants["kiro"] = AIParticipant(
                name="Kiro",
                token=os.getenv("KIRO_BOT_TOKEN"),
                model="claude-3-5-sonnet-20241022",
                persona="""You are Kiro, the Execution Reality Check in collaborative discussions.
Your role is to ensure practical feasibility within real-world constraints.
Focus on timeline, resource limitations, and immediate next steps.
Keep discussions grounded in what's actually achievable."""
            )
        
        # Initialize AI clients
        for participant in participants.values():
            participant.initialize_client()
        
        return participants
    
    def connect(self):
        """Connect all bots to Mattermost"""
        print(f"Connecting to Mattermost at {self.mm_url}")
        
        for bot_name, participant in self.participants.items():
            driver = Driver({
                'url': 'localhost',
                'token': participant.token,
                'scheme': 'http',
                'port': 8065,
                'verify': False
            })
            
            driver.login()
            self.drivers[bot_name] = driver
            
            # Get bot user info
            user = driver.users.get_user('me')
            self.bot_user_ids[bot_name] = user['id']
            print(f"Connected {participant.name} (ID: {user['id']})")
        
        # Get team and channel IDs using the first bot
        if self.drivers:
            first_driver = next(iter(self.drivers.values()))
            first_bot_name = next(iter(self.participants.keys()))
            bot_user_id = self.bot_user_ids[first_bot_name]
            
            # Get teams the bot is member of
            teams = first_driver.teams.get_user_teams(bot_user_id)
            for team in teams:
                if team['name'] == self.team_name.replace(' ', '-').lower():
                    self.team_id = team['id']
                    print(f"Found team: {team['display_name']} (ID: {self.team_id})")
                    break
            
            if self.team_id:
                # Get channels for this team
                channels = first_driver.channels.get_channels_for_user(bot_user_id, self.team_id)
                for channel in channels:
                    if channel['name'] == self.channel_name.replace(' ', '-').lower():
                        self.channel_id = channel['id']
                        print(f"Found channel: {channel['display_name']} (ID: {self.channel_id})")
                        break
        
        if not self.team_id or not self.channel_id:
            print(f"Warning: Could not find team '{self.team_name}' or channel '{self.channel_name}'")
    
    async def handle_message(self, message):
        """Handle incoming messages and generate AI responses"""
        # Don't respond to bot's own messages
        if message.get('user_id') in self.bot_user_ids.values():
            return
        
        text = message.get('message', '')
        user_id = message.get('user_id', '')
        
        # Skip if no text
        if not text:
            return
        
        print(f"Received message: {text[:100]}...")
        
        # Check which bots are mentioned or if it's a general message
        mentioned_bots = []
        for bot_name in self.participants:
            if f"@{bot_name}" in text.lower():
                mentioned_bots.append(bot_name)
        
        # If no specific bot mentioned, all bots can respond
        if not mentioned_bots:
            mentioned_bots = list(self.participants.keys())
        
        # Generate responses from mentioned bots
        for bot_name in mentioned_bots:
            participant = self.participants[bot_name]
            driver = self.drivers[bot_name]
            
            # Generate response
            response = await participant.generate_response(text)
            
            # Post response to channel
            driver.posts.create_post({
                'channel_id': self.channel_id,
                'message': response
            })
            
            print(f"{participant.name} responded")
            
            # Small delay between bot responses for readability
            await asyncio.sleep(2)
    
    async def listen(self):
        """Listen for messages in the channel"""
        print(f"Listening for messages in {self.channel_name}...")
        
        # Use websocket for real-time messages
        if not self.drivers:
            print("No drivers connected")
            return
        
        # For now, use polling (websocket integration can be added later)
        last_post_time = 0
        
        while True:
            try:
                # Get recent posts
                driver = next(iter(self.drivers.values()))
                posts = driver.posts.get_posts_for_channel(self.channel_id)
                
                for post_id, post in posts['posts'].items():
                    # Skip old messages
                    if post['create_at'] <= last_post_time:
                        continue
                    
                    # Skip bot messages
                    if post['user_id'] in self.bot_user_ids.values():
                        continue
                    
                    # Update last post time
                    last_post_time = max(last_post_time, post['create_at'])
                    
                    # Handle the message
                    await self.handle_message({
                        'message': post.get('message', ''),
                        'user_id': post.get('user_id', '')
                    })
                
                # Poll every 2 seconds
                await asyncio.sleep(2)
                
            except KeyboardInterrupt:
                print("\nShutting down bridge...")
                break
            except Exception as e:
                print(f"Error in listen loop: {e}")
                await asyncio.sleep(5)
    
    def run(self):
        """Main run loop"""
        try:
            self.connect()
            asyncio.run(self.listen())
        except KeyboardInterrupt:
            print("\nBridge stopped by user")
        finally:
            # Disconnect all drivers
            for driver in self.drivers.values():
                driver.logout()

def main():
    """Main entry point"""
    # Check for required environment variables
    required_vars = ["ANTHROPIC_API_KEY", "CLAUDE_RESEARCH_BOT_TOKEN", "KIRO_BOT_TOKEN"]
    missing = [var for var in required_vars if not os.getenv(var)]
    
    if missing:
        print(f"Missing required environment variables: {', '.join(missing)}")
        print("Please set them in your .env file")
        sys.exit(1)
    
    # Create and run bridge
    bridge = MattermostBridge()
    bridge.run()

if __name__ == "__main__":
    main()