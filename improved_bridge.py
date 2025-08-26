#!/usr/bin/env python3
"""
Improved Mattermost Bridge for Multi-Model Debate
Addresses context passing and persona issues
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

class ImprovedBridge:
    def __init__(self):
        self.anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.channel_id = "f9pna31wginu3nuwezi6boeura"  # Multi-Model channel
        self.last_post_time = 0
        self.conversation_history = []  # Store conversation context
        
        # Bot configurations with improved personas
        self.bots = {
            'claude-research': {
                'token': os.getenv("CLAUDE_RESEARCH_BOT_TOKEN"),
                'driver': None,
                'user_id': None,
                'persona': """You are a research analyst participating in a team discussion about technical topics. Your communication style is:

- Analytical and thorough, but conversational
- You reference previous points made by teammates
- You ask strategic questions to drive deeper thinking
- You're collaborative, not lecturing
- You speak as part of the team, not as an AI assistant

Focus on research, long-term implications, and systematic analysis. Be direct and natural in your responses."""
            },
            'kiro': {
                'token': os.getenv("KIRO_BOT_TOKEN"),
                'driver': None,
                'user_id': None,
                'persona': """You are an execution-focused team member in a technical discussion. Your communication style is:

- Practical and reality-focused
- You bring up implementation constraints and timeline concerns  
- You're direct about what will and won't work
- You build on others' ideas with practical considerations
- You speak as a teammate, not an AI assistant

Keep discussions grounded in what's actually achievable and focus on next steps."""
            }
        }
    
    def connect(self):
        """Connect all bots to Mattermost"""
        for bot_name, bot_config in self.bots.items():
            driver = Driver({
                'url': 'localhost',
                'token': bot_config['token'],
                'scheme': 'http',
                'port': 8065,
                'verify': False
            })
            
            driver.login()
            user = driver.users.get_user('me')
            
            bot_config['driver'] = driver
            bot_config['user_id'] = user['id']
            
            print(f"✓ {bot_name} connected (ID: {user['id']})")
    
    def build_context(self):
        """Build conversation context from recent history"""
        if len(self.conversation_history) < 2:
            return "This is the start of a new discussion."
        
        context_parts = ["Recent conversation:"]
        # Include last 6 messages for context
        for msg in self.conversation_history[-6:]:
            context_parts.append(f"- {msg['author']}: {msg['content']}")
        
        return "\n".join(context_parts)
    
    def generate_response(self, current_message, persona, bot_name):
        """Generate AI response with conversation context"""
        try:
            context = self.build_context()
            
            prompt = f"""{persona}

{context}

Current message: {current_message}

Respond naturally as a team member. Reference previous points if relevant. Keep it conversational and under 3 sentences."""

            response = self.anthropic_client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=300,
                temperature=0.7,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            return response.content[0].text
        except Exception as e:
            return f"[Error: {str(e)}]"
    
    def add_to_history(self, author, content):
        """Add message to conversation history"""
        self.conversation_history.append({
            'author': author,
            'content': content[:200],  # Truncate long messages
            'timestamp': time.time()
        })
        
        # Keep only last 20 messages
        if len(self.conversation_history) > 20:
            self.conversation_history = self.conversation_history[-20:]
    
    def run(self):
        """Main loop - poll for new messages and respond"""
        self.connect()
        print(f"\n✓ Improved bridge running! Listening in Multi-Model channel...")
        print("Context passing enabled, improved personas loaded")
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
                    
                    message = post.get('message', '')
                    user_id = post['user_id']
                    
                    # Skip bot messages
                    if user_id in [bot['user_id'] for bot in self.bots.values()]:
                        continue
                    
                    if not message:
                        continue
                    
                    print(f"📨 New message: {message[:100]}...")
                    self.last_post_time = post['create_at']
                    
                    # Add user message to history
                    self.add_to_history("User", message)
                    
                    # Determine which bot(s) should respond
                    respond_bots = []
                    
                    if '@claude-research' in message.lower():
                        respond_bots.append('claude-research')
                    if '@kiro' in message.lower():
                        respond_bots.append('kiro')
                    
                    # If no specific mention, both respond (but with delay)
                    if not respond_bots:
                        respond_bots = ['claude-research', 'kiro']
                    
                    # Generate and post responses
                    for i, bot_name in enumerate(respond_bots):
                        bot = self.bots[bot_name]
                        
                        print(f"  💭 {bot_name} thinking...")
                        response = self.generate_response(message, bot['persona'], bot_name)
                        
                        # Post response
                        bot['driver'].posts.create_post({
                            'channel_id': self.channel_id,
                            'message': response
                        })
                        
                        # Add bot response to history
                        self.add_to_history(bot_name, response)
                        
                        print(f"  ✓ {bot_name} responded: {response[:50]}...")
                        
                        # Delay between responses if multiple bots
                        if len(respond_bots) > 1 and i < len(respond_bots) - 1:
                            time.sleep(3)
                
                # Poll every 2 seconds
                time.sleep(2)
                
        except KeyboardInterrupt:
            print("\n\nShutting down improved bridge...")
        finally:
            # Logout all bots
            for bot in self.bots.values():
                if bot['driver']:
                    bot['driver'].logout()
            print("✓ Bridge stopped")

if __name__ == "__main__":
    bridge = ImprovedBridge()
    bridge.run()