#!/usr/bin/env python3
"""
Dynamic Mattermost Bridge for Multi-Model Debate
Loads rules from external YAML file for hot-reloading without rebuild
"""

import os
import sys
import io
import time
import yaml
from datetime import datetime
from dotenv import load_dotenv
from mattermostdriver import Driver
import anthropic

# Fix unicode on Windows
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv()

class DynamicBridge:
    def __init__(self, rules_file="chat_coordination_rules.yaml"):
        self.anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.channel_id = "f9pna31wginu3nuwezi6boeura"  # Multi-Model channel
        self.rules_file = rules_file
        self.rules = {}
        self.rules_last_modified = 0
        self.last_post_time = 0
        self.conversation_history = []
        
        # Load initial rules
        self.load_rules()
        
        # Bot configurations - will be populated from rules
        self.bots = {
            'claude-research': {
                'token': os.getenv("CLAUDE_RESEARCH_BOT_TOKEN"),
                'driver': None,
                'user_id': None,
            },
            'kiro': {
                'token': os.getenv("KIRO_BOT_TOKEN"),
                'driver': None,
                'user_id': None,
            }
        }
    
    def load_rules(self):
        """Load or reload rules from YAML file"""
        try:
            if not os.path.exists(self.rules_file):
                print(f"⚠️  Rules file {self.rules_file} not found, using defaults")
                return
            
            # Check if file was modified
            mod_time = os.path.getmtime(self.rules_file)
            if mod_time <= self.rules_last_modified:
                return  # No changes
            
            with open(self.rules_file, 'r') as f:
                new_rules = yaml.safe_load(f)
            
            if new_rules != self.rules:
                self.rules = new_rules
                self.rules_last_modified = mod_time
                print(f"🔄 Rules reloaded from {self.rules_file}")
                
                if self.rules.get('meta', {}).get('update_notification', True):
                    self.announce_rules_update()
                    
        except Exception as e:
            print(f"❌ Error loading rules: {e}")
    
    def announce_rules_update(self):
        """Announce rules update in chat"""
        if hasattr(self, 'bots') and self.bots.get('kiro', {}).get('driver'):
            try:
                driver = self.bots['kiro']['driver']
                update_msg = f"📋 Rules updated: {self.rules.get('updated_by', 'System')} - {self.rules.get('updated', 'now')}"
                driver.posts.create_post({
                    'channel_id': self.channel_id,
                    'message': update_msg
                })
            except:
                pass  # Ignore if bots not connected yet
    
    def get_persona_prompt(self, bot_name):
        """Generate persona prompt from Kiro's refined rules"""
        persona_config = self.rules.get('personas', {}).get(bot_name.replace('-', '_'), {})
        
        if not persona_config:
            return f"You are {bot_name}, participating in a technical team discussion."
        
        role = persona_config.get('role', bot_name)
        description = persona_config.get('description', 'team participant')
        behaviors = persona_config.get('behavior', [])
        avoid_list = persona_config.get('avoid', [])
        
        # Communication style from rules
        comm_rules = self.rules.get('communication', {})
        message_style = comm_rules.get('message_style', [])
        max_sentences = comm_rules.get('message_length', {}).get('max_sentences', 4)
        
        prompt_parts = [
            f"You are {role} ({persona_config.get('name', bot_name)}) in a technical team discussion.",
            f"Your role: {description}",
            "",
            "What you DO:"
        ]
        
        for behavior in behaviors:
            prompt_parts.append(f"- {behavior}")
        
        if avoid_list:
            prompt_parts.append("\nWhat you AVOID:")
            for avoid_item in avoid_list:
                prompt_parts.append(f"- {avoid_item}")
        
        if message_style:
            prompt_parts.append("\nCommunication style:")
            for style_rule in message_style:
                prompt_parts.append(f"- {style_rule}")
        
        prompt_parts.append(f"\nKeep responses to {max_sentences} sentences or less for chat flow.")
        
        # Add project context
        project_context = self.rules.get('current_project', {})
        if project_context:
            prompt_parts.append(f"\nProject: {project_context.get('name', '')} - {project_context.get('phase', '')}")
        
        return "\n".join(prompt_parts)
    
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
        """Build conversation context based on rules"""
        context_rules = self.rules.get('context', {})
        history_length = self.rules.get('conversation', {}).get('context_history_length', 6)
        
        if len(self.conversation_history) < 2:
            return "This is the start of a new discussion."
        
        context_parts = ["Recent conversation:"]
        
        # Include recent messages based on rules
        recent_history = self.conversation_history[-history_length:]
        for msg in recent_history:
            if context_rules.get('include_user_messages', True) and msg['author'] == 'User':
                context_parts.append(f"- {msg['author']}: {msg['content']}")
            elif context_rules.get('include_bot_responses', True) and msg['author'] != 'User':
                context_parts.append(f"- {msg['author']}: {msg['content']}")
        
        return "\n".join(context_parts)
    
    def generate_response(self, current_message, bot_name):
        """Generate AI response using dynamic rules"""
        try:
            # Reload rules if modified
            self.load_rules()
            
            persona_prompt = self.get_persona_prompt(bot_name)
            context = self.build_context()
            
            max_tokens = self.rules.get('conversation', {}).get('max_response_length', 300)
            
            prompt = f"""{persona_prompt}

{context}

Current message: {current_message}

Respond naturally as a team member. Be conversational and concise."""

            response = self.anthropic_client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=max_tokens,
                temperature=0.7,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            return response.content[0].text
        except Exception as e:
            return f"[Error: {str(e)}]"
    
    def should_bot_respond(self, message, bot_name):
        """Determine if bot should respond based on rules"""
        participation_rules = self.rules.get('participation', {})
        
        # Check for direct mentions
        if participation_rules.get('mention_override', True):
            if f'@{bot_name}' in message.lower():
                return True
        
        # Check default behavior
        default_behavior = participation_rules.get('default_behavior', 'all_respond')
        
        if default_behavior == 'all_respond':
            return True
        elif default_behavior == 'mention_only':
            return f'@{bot_name}' in message.lower()
        
        return False
    
    def add_to_history(self, author, content):
        """Add message to conversation history"""
        self.conversation_history.append({
            'author': author,
            'content': content[:200],  # Truncate long messages
            'timestamp': time.time()
        })
        
        # Keep only recent messages
        max_history = 20
        if len(self.conversation_history) > max_history:
            self.conversation_history = self.conversation_history[-max_history:]
    
    def run(self):
        """Main loop with dynamic rule loading"""
        self.connect()
        print(f"\n✓ Dynamic bridge running! Rules file: {self.rules_file}")
        print("📋 Rules can be updated without restart")
        print("Press Ctrl+C to stop\n")
        
        # Get initial timestamp
        driver = self.bots['claude-research']['driver']
        posts = driver.posts.get_posts_for_channel(self.channel_id)
        if posts['posts']:
            self.last_post_time = max(post['create_at'] for post in posts['posts'].values())
        
        try:
            while True:
                # Check for rules updates
                self.load_rules()
                
                # Check for new messages
                posts = driver.posts.get_posts_for_channel(self.channel_id)
                
                for post_id, post in posts['posts'].items():
                    if post['create_at'] <= self.last_post_time:
                        continue
                    
                    message = post.get('message', '')
                    user_id = post['user_id']
                    
                    # Skip bot messages
                    if user_id in [bot['user_id'] for bot in self.bots.values()]:
                        continue
                    
                    if not message:
                        continue
                    
                    print(f"📨 New message: {message[:80]}...")
                    self.last_post_time = post['create_at']
                    
                    # Add user message to history
                    self.add_to_history("User", message)
                    
                    # Determine which bots should respond
                    responding_bots = []
                    for bot_name in self.bots.keys():
                        if self.should_bot_respond(message, bot_name):
                            responding_bots.append(bot_name)
                    
                    # Generate responses
                    response_delay = self.rules.get('conversation', {}).get('response_delay_seconds', 3)
                    
                    for i, bot_name in enumerate(responding_bots):
                        bot = self.bots[bot_name]
                        
                        print(f"  💭 {bot_name} thinking...")
                        response = self.generate_response(message, bot_name)
                        
                        # Post response
                        bot['driver'].posts.create_post({
                            'channel_id': self.channel_id,
                            'message': response
                        })
                        
                        # Add to history
                        self.add_to_history(bot_name, response)
                        
                        print(f"  ✓ {bot_name}: {response[:50]}...")
                        
                        # Delay between responses
                        if i < len(responding_bots) - 1:
                            time.sleep(response_delay)
                
                # Poll interval
                time.sleep(2)
                
        except KeyboardInterrupt:
            print("\n\n🛑 Shutting down dynamic bridge...")
        finally:
            for bot in self.bots.values():
                if bot['driver']:
                    bot['driver'].logout()
            print("✓ Bridge stopped")

if __name__ == "__main__":
    bridge = DynamicBridge()
    bridge.run()