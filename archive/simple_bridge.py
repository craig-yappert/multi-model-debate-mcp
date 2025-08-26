#!/usr/bin/env python3
"""
Simple Mattermost Bridge for Multi-Model Debate
A working bridge that connects AI models to Mattermost
"""

import os
import sys
import io
import time
from dotenv import load_dotenv
from mattermostdriver import Driver
import anthropic

# Fix unicode on Windows
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv()

class SimpleBridge:
    def __init__(self):
        self.anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.channel_id = "f9pna31wginu3nuwezi6boeura"  # Multi-Model channel
        self.last_post_time = 0
        
        # Bot configurations
        self.mattermost_url = os.getenv("MATTERMOST_URL", "http://mattermost:8065")  # Use container name
        self.bots = {
            'claude-research': {
                'token': os.getenv("CLAUDE_RESEARCH_BOT_TOKEN"),
                'driver': None,
                'user_id': None,
                'persona': "You are Claude-Research, providing deep analytical perspectives. Be concise but thorough."
            },
            'kiro': {
                'token': os.getenv("KIRO_BOT_TOKEN"),
                'driver': None,
                'user_id': None,
                'persona': "You are Kiro, focusing on practical execution and feasibility. Keep it real and actionable."
            }
        }
    
    def connect(self):
        """Connect all bots to Mattermost"""
        for bot_name, bot_config in self.bots.items():
            # Parse URL for container networking
            url_parts = self.mattermost_url.replace('http://', '').split(':')
            host = url_parts[0]
            port = int(url_parts[1]) if len(url_parts) > 1 else 8065
            
            driver = Driver({
                'url': host,
                'token': bot_config['token'],
                'scheme': 'http',
                'port': port,
                'verify': False
            })
            
            driver.login()
            user = driver.users.get_user('me')
            
            bot_config['driver'] = driver
            bot_config['user_id'] = user['id']
            
            print(f"✓ {bot_name} connected (ID: {user['id']})")
    
    def generate_response(self, message, persona):
        """Generate AI response using Anthropic"""
        try:
            response = self.anthropic_client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=500,
                messages=[
                    {"role": "user", "content": f"{persona}\n\nRespond to this message: {message}"}
                ]
            )
            return response.content[0].text
        except Exception as e:
            return f"[Error generating response: {str(e)}]"
    
    def run(self):
        """Main loop - poll for new messages and respond"""
        self.connect()
        print(f"\n✓ Bridge running! Listening in Multi-Model channel...")
        print("Press Ctrl+C to stop\n")
        
        # Get initial timestamp
        driver = self.bots['claude-research']['driver']
        posts = driver.posts.get_posts_for_channel(self.channel_id)
        if posts['posts']:
            self.last_post_time = max(post['create_at'] for post in posts['posts'].values())
        
        try:
            while True:
                # Check for new messages
                posts = driver.posts.get_posts_for_channel(self.channel_id)
                
                for post_id, post in posts['posts'].items():
                    # Skip old messages
                    if post['create_at'] <= self.last_post_time:
                        continue
                    
                    # Skip bot messages
                    if post['user_id'] in [bot['user_id'] for bot in self.bots.values()]:
                        continue
                    
                    # New user message!
                    message = post.get('message', '')
                    if not message:
                        continue
                    
                    print(f"📨 New message: {message[:100]}...")
                    self.last_post_time = post['create_at']
                    
                    # Determine which bot(s) should respond
                    respond_bots = []
                    
                    # Check if specific bots are mentioned
                    if '@claude-research' in message.lower():
                        respond_bots.append('claude-research')
                    if '@kiro' in message.lower():
                        respond_bots.append('kiro')
                    
                    # If no specific mention, both respond
                    if not respond_bots:
                        respond_bots = ['claude-research', 'kiro']
                    
                    # Generate and post responses
                    for bot_name in respond_bots:
                        bot = self.bots[bot_name]
                        
                        print(f"  💭 {bot_name} thinking...")
                        response = self.generate_response(message, bot['persona'])
                        
                        # Post response
                        bot['driver'].posts.create_post({
                            'channel_id': self.channel_id,
                            'message': response
                        })
                        
                        print(f"  ✓ {bot_name} responded")
                        
                        # Small delay between responses
                        if len(respond_bots) > 1:
                            time.sleep(2)
                
                # Poll every 2 seconds
                time.sleep(2)
                
        except KeyboardInterrupt:
            print("\n\nShutting down bridge...")
        finally:
            # Logout all bots
            for bot in self.bots.values():
                if bot['driver']:
                    bot['driver'].logout()
            print("✓ Bridge stopped")

if __name__ == "__main__":
    bridge = SimpleBridge()
    bridge.run()