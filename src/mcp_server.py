#!/usr/bin/env python3
"""
Multi-Model Debate MCP Server
MVP implementation for single-team collaborative AI discussions
"""

import os
import sys
import asyncio
import yaml
import time
import random
import logging
from typing import List, Dict, Optional, Any, Callable
from datetime import datetime

# Set up logging to stderr to avoid interfering with stdio
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stderr)]
)
logger = logging.getLogger(__name__)

# MCP imports
from mcp.server import Server
from mcp.server.models import InitializationOptions
from mcp.types import Tool, TextContent, ServerCapabilities

class RetryHandler:
    """Handles exponential backoff and retry logic for API calls"""
    
    def __init__(self, max_retries: int = 3, base_delay: float = 1.0, max_delay: float = 60.0):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
    
    async def retry_with_backoff(self, func: Callable, *args, **kwargs):
        """Execute function with exponential backoff retry"""
        last_exception = None
        
        for attempt in range(self.max_retries + 1):
            try:
                if asyncio.iscoroutinefunction(func):
                    return await func(*args, **kwargs)
                else:
                    return func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                
                if attempt == self.max_retries:
                    break
                
                # Calculate delay with exponential backoff + jitter
                delay = min(
                    self.base_delay * (2 ** attempt) + random.uniform(0, 1),
                    self.max_delay
                )
                
                logger.warning(f"API call failed (attempt {attempt + 1}/{self.max_retries + 1}), retrying in {delay:.2f}s: {str(e)}")
                await asyncio.sleep(delay)
        
        raise last_exception

class MessageCache:
    """Caches messages with timestamp-based invalidation"""
    
    def __init__(self, cache_duration_seconds: int = 300):  # 5 minutes default
        self.cache = {}
        self.cache_duration = cache_duration_seconds
        self.last_fetch_times = {}
    
    def is_cache_valid(self, key: str) -> bool:
        """Check if cache entry is still valid"""
        if key not in self.last_fetch_times:
            return False
        
        elapsed = time.time() - self.last_fetch_times[key]
        return elapsed < self.cache_duration
    
    def get_cached_messages(self, key: str) -> Optional[Dict]:
        """Get cached messages if valid"""
        if self.is_cache_valid(key):
            return self.cache.get(key)
        return None
    
    def cache_messages(self, key: str, messages: Dict):
        """Cache messages with timestamp"""
        self.cache[key] = messages
        self.last_fetch_times[key] = time.time()
    
    def invalidate_cache(self, key: str = None):
        """Invalidate specific key or all cache"""
        if key:
            self.cache.pop(key, None)
            self.last_fetch_times.pop(key, None)
        else:
            self.cache.clear()
            self.last_fetch_times.clear()

class ConversationContext:
    """Manages conversation history and context for team discussions"""
    
    def __init__(self, team: str, channel: str, max_context: int = 50):
        self.team = team
        self.channel = channel
        self.messages: List[Dict[str, Any]] = []
        self.max_context = max_context
        
    def add_message(self, author: str, content: str, timestamp: datetime = None):
        """Add message with automatic truncation"""
        if timestamp is None:
            timestamp = datetime.now()
            
        self.messages.append({
            'author': author,
            'content': content[:200],  # Truncate long messages
            'timestamp': timestamp
        })
        
        # Keep only recent messages
        if len(self.messages) > self.max_context:
            self.messages = self.messages[-self.max_context:]
    
    def get_context_for_persona(self, persona: str) -> str:
        """Return formatted context with persona-specific filtering"""
        if len(self.messages) < 2:
            return "This is the start of a new discussion."
        
        context_parts = [f"Recent conversation in {self.team}/{self.channel}:"]
        
        # Include last 6 messages for context
        for msg in self.messages[-6:]:
            timestamp_str = msg['timestamp'].strftime('%H:%M')
            context_parts.append(f"[{timestamp_str}] {msg['author']}: {msg['content']}")
        
        return "\n".join(context_parts)
    
    def get_recent_messages(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent messages for analysis"""
        return self.messages[-limit:] if self.messages else []

# Mattermost integration
from mattermostdriver import Driver
import anthropic

# Load environment
from dotenv import load_dotenv
load_dotenv()

class MultiModelMCPServer:
    def __init__(self, config_file: str = "config/chat_coordination_rules.yaml"):
        """Initialize MCP server with configuration"""
        self.config_file = config_file
        self.config = {}
        self.mattermost = None
        
        # Initialize Anthropic client with better error handling
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if api_key and api_key != "your_anthropic_api_key_here":
            try:
                self.anthropic_client = anthropic.Anthropic(api_key=api_key)
            except Exception as e:
                logger.warning(f"Failed to initialize Anthropic client: {e}")
                self.anthropic_client = None
        else:
            logger.warning("ANTHROPIC_API_KEY not configured - AI responses will be disabled")
            self.anthropic_client = None
        
        # Use ConversationContext instead of simple list
        self.conversation_context = ConversationContext("multi-model-debate", "general")
        
        # Autonomous collaboration tracking
        self.autonomous_exchanges = {}  # Track AI-to-AI conversations
        self.collaboration_rules = {}
        
        # Retry handler for API calls
        self.retry_handler = RetryHandler(max_retries=3, base_delay=1.0, max_delay=60.0)
        
        # Message caching for better performance
        self.message_cache = MessageCache(cache_duration_seconds=300)  # 5 minute cache
        
        # MCP Server setup
        self.server = Server("multi-model-debate")
        
        # Load configuration
        self.load_config()
        
        # Initialize Mattermost connection (optional in Docker mode)
        try:
            self.init_mattermost()
        except Exception as e:
            logger.warning(f"Mattermost connection failed, running in offline mode: {e}")
            self.mattermost = None
        
        # Register MCP tools
        self.register_tools()
    
    def load_config(self):
        """Load configuration from YAML file"""
        try:
            with open(self.config_file, 'r') as f:
                self.config = yaml.safe_load(f)
                
                # Load autonomous collaboration rules
                self.collaboration_rules = self.config.get('autonomous_collaboration', {})
                logger.info(f"Configuration loaded from {self.config_file}")
                logger.info(f"Autonomous collaboration: {self.collaboration_rules.get('enabled', False)}")
                
        except Exception as e:
            print(f"ERROR: Error loading config: {e}")
            # Use minimal default config
            self.config = {
                'personas': {
                    'claude_research': {
                        'name': 'Claude-Research',
                        'role': 'Research Lead',
                        'description': 'Deep analytical thinking and strategic perspective'
                    }
                },
                'autonomous_collaboration': {
                    'enabled': False,
                    'max_exchanges': 3
                }
            }
            self.collaboration_rules = self.config.get('autonomous_collaboration', {})
    
    def init_mattermost(self):
        """Initialize Mattermost connection using bot token"""
        try:
            # Use Claude-Research token for MCP server connection
            token = os.getenv("CLAUDE_RESEARCH_BOT_TOKEN")
            if not token or token == "your_mattermost_bot_token_here":
                logger.info("CLAUDE_RESEARCH_BOT_TOKEN not configured - Mattermost integration disabled")
                self.mattermost = None
                return
            
            # Get Mattermost connection settings from environment
            mm_url = os.getenv("MATTERMOST_URL", "localhost")
            mm_port = int(os.getenv("MATTERMOST_PORT", "8065"))
            mm_scheme = os.getenv("MATTERMOST_SCHEME", "http")
            
            # Store connection details for direct API calls
            self.mattermost_base_url = f"{mm_scheme}://{mm_url}:{mm_port}/api/v4"
            self.mattermost_token = token
            self.mattermost = True  # Flag to indicate Mattermost is configured
            
            logger.info(f"Attempting to connect to Mattermost at {self.mattermost_base_url}")
            
            # Test connection with direct API call
            import requests
            headers = {"Authorization": f"Bearer {token}"}
            response = requests.get(f"{self.mattermost_base_url}/users/me", headers=headers)
            
            if response.status_code == 200:
                user = response.json()
                logger.info(f"Connected to Mattermost as {user['username']}")
            else:
                raise Exception(f"Authentication failed: {response.status_code}")
            
            # Get channel ID (hardcoded for MVP)
            self.channel_id = "f9pna31wginu3nuwezi6boeura"  # Multi-Model channel
            
        except Exception as e:
            # Check if it's a login error
            if "Invalid or expired session" in str(e) or "401" in str(e):
                logger.warning("Mattermost authentication failed - check bot token")
            elif "Connection refused" in str(e) or "Failed to establish" in str(e):
                logger.warning("Cannot connect to Mattermost server - is it running?")
            else:
                logger.warning(f"Mattermost connection disabled: {str(e)[:100]}")
            self.mattermost = None
    
    def register_tools(self):
        """Register MCP tools for multi-model collaboration"""
        
        @self.server.list_tools()
        async def list_tools() -> List[Tool]:
            """List available MCP tools"""
            return [
                Tool(
                    name="read_discussion",
                    description="Read recent team discussion from the debate channel",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "limit": {
                                "type": "integer",
                                "description": "Number of recent messages to retrieve",
                                "default": 10
                            }
                        }
                    }
                ),
                Tool(
                    name="contribute",
                    description="Contribute to team discussion as a specific persona",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "message": {
                                "type": "string",
                                "description": "The message to post"
                            },
                            "persona": {
                                "type": "string",
                                "description": "The persona to use (e.g., 'claude-research', 'kiro')",
                                "default": "claude_research"
                            },
                            "autonomous": {
                                "type": "boolean",
                                "description": "Whether this is an autonomous AI-to-AI contribution",
                                "default": False
                            }
                        },
                        "required": ["message"]
                    }
                ),
                Tool(
                    name="get_conversation_context",
                    description="Get structured conversation context and summary",
                    inputSchema={
                        "type": "object",
                        "properties": {}
                    }
                )
            ]
        
        @self.server.call_tool()
        async def read_discussion(name: str, arguments: dict) -> List[TextContent]:
            """Read recent team discussion from Mattermost channel"""
            limit = arguments.get("limit", 10)
            
            if not self.mattermost:
                # Demo mode - return conversation history
                if self.conversation_context.messages:
                    demo_messages = []
                    for msg in self.conversation_context.messages[-limit:]:
                        demo_messages.append(f"[{msg['timestamp']}] {msg['author']}: {msg['content']}")
                    return [TextContent(type="text", text="[DEMO MODE] Recent discussion:\n" + "\n".join(demo_messages))]
                else:
                    return [TextContent(type="text", text="[DEMO MODE] No discussion history yet. Use 'contribute' to start.")]
            
            try:
                # Check cache first
                cache_key = f"channel_{self.channel_id}_limit_{limit}"
                cached_result = self.message_cache.get_cached_messages(cache_key)
                
                if cached_result:
                    return [TextContent(type="text", text=cached_result)]
                
                # Get recent posts from channel with retry
                posts = await self.retry_handler.retry_with_backoff(
                    self.mattermost.posts.get_posts_for_channel, self.channel_id
                )
                
                messages = []
                post_list = sorted(posts['posts'].items(), 
                                 key=lambda x: x[1]['create_at'], 
                                 reverse=True)[:limit]
                
                for post_id, post in post_list:
                    user_id = post['user_id']
                    message = post.get('message', '')
                    
                    # Get username for display with retry
                    try:
                        user = await self.retry_handler.retry_with_backoff(
                            self.mattermost.users.get_user, user_id
                        )
                        username = user.get('username', 'unknown')
                    except:
                        username = 'unknown'
                    
                    timestamp = datetime.fromtimestamp(post['create_at'] / 1000)
                    messages.append(f"[{timestamp.strftime('%H:%M')}] {username}: {message}")
                
                # Reverse to show chronological order
                messages.reverse()
                result = "\n".join(messages) if messages else "No recent messages found"
                
                # Cache the result
                self.message_cache.cache_messages(cache_key, result)
                
                return [TextContent(type="text", text=result)]
                
            except Exception as e:
                return [TextContent(type="text", text=f"ERROR: Error reading discussion: {str(e)}")]
        
        @self.server.call_tool()
        async def call_tool_handler(name: str, arguments: dict) -> List[TextContent]:
            """Universal tool handler that routes to specific implementations"""
            logger.info(f"Tool called: name={name}, arguments={arguments}")
            
            if name == "read_discussion":
                return await self.handle_read_discussion(arguments)
            elif name == "contribute":
                return await self.handle_contribute(arguments)
            elif name == "get_conversation_context":
                return await self.handle_get_conversation_context(arguments)
            else:
                return [TextContent(type="text", text=f"ERROR: Unknown tool {name}")]
    
    async def handle_read_discussion(self, arguments: dict) -> List[TextContent]:
        """Handle read_discussion tool calls"""
        limit = arguments.get("limit", 10)
        
        if not self.mattermost:
            # Demo mode - return conversation history
            if self.conversation_context.messages:
                demo_messages = []
                for msg in self.conversation_context.messages[-limit:]:
                    demo_messages.append(f"[{msg['timestamp']}] {msg['author']}: {msg['content']}")
                return [TextContent(type="text", text="[DEMO MODE] Recent discussion:\n" + "\n".join(demo_messages))]
            else:
                return [TextContent(type="text", text="[DEMO MODE] No discussion history yet. Use 'contribute' to start.")]
        
        try:
            # Check cache first
            cache_key = f"channel_{self.channel_id}_limit_{limit}"
            cached_result = self.message_cache.get_cached_messages(cache_key)
            
            if cached_result:
                return [TextContent(type="text", text=cached_result)]
            
            # Get recent posts from channel with retry
            posts = await self.retry_handler.retry_with_backoff(
                self.mattermost.posts.get_posts_for_channel, self.channel_id
            )
            
            messages = []
            post_list = sorted(posts['posts'].items(), 
                             key=lambda x: x[1]['create_at'], 
                             reverse=True)[:limit]
            
            for post_id, post in post_list:
                user_id = post['user_id']
                message = post.get('message', '')
                
                # Get username for display with retry
                try:
                    user = await self.retry_handler.retry_with_backoff(
                        self.mattermost.users.get_user, user_id
                    )
                    username = user.get('username', 'unknown')
                except:
                    username = 'unknown'
                
                timestamp = post['create_at']
                messages.append(f"[{timestamp}] {username}: {message}")
            
            # Cache the result
            result_text = "Recent team discussion:\n" + "\n".join(messages)
            self.message_cache.cache_messages(cache_key, result_text)
            
            return [TextContent(type="text", text=result_text)]
            
        except Exception as e:
            return [TextContent(type="text", text=f"ERROR: Error reading discussion: {str(e)}")]
    
    async def handle_contribute(self, arguments: dict) -> List[TextContent]:
        """Handle contribute tool calls"""
        message = arguments.get("message", "")
        persona = arguments.get("persona", "claude_research")
        autonomous = arguments.get("autonomous", False)
        
        if not message:
            return [TextContent(type="text", text="ERROR: Message cannot be empty")]
        
        if not self.mattermost:
            # Demo mode when Mattermost is not connected
            # Still generate AI response but don't post to Mattermost
            persona_config = self.config.get('personas', {}).get(persona, {})
            context = await self.build_context(persona)
            
            # Add the user's message to history first
            self.add_to_history("User", message)
            
            # Generate AI response
            response = await self.generate_response(message, persona_config, context)
            
            # Add AI response to history
            self.add_to_history(persona_config.get('name', persona), response)
            
            return [TextContent(type="text", text=f"[DEMO MODE - {persona_config.get('name', persona)}]:\n{response}")]
        
        # Check autonomous collaboration rules
        if autonomous and not self.should_allow_autonomous_contribution(persona):
            return [TextContent(type="text", text="PAUSED: Autonomous contribution limit reached. Waiting for human input.")]
        
        try:
            # Get persona configuration
            persona_config = self.config.get('personas', {}).get(persona, {})
            
            # Generate contextual response using existing logic
            context = await self.build_context(persona)
            
            # Add autonomous context if applicable
            if autonomous:
                autonomous_status = self.get_autonomous_context()
                context += f"\n\nAutonomous collaboration status: {autonomous_status}"
            
            response = await self.generate_response(message, persona_config, context)
            
            # Post to Mattermost with retry using direct API
            import requests
            
            # Use the appropriate bot token based on persona
            if persona.lower() == 'kiro':
                bot_token = os.getenv("KIRO_BOT_TOKEN", self.mattermost_token)
            else:
                bot_token = self.mattermost_token  # Default to Claude-Research token
                
            headers = {"Authorization": f"Bearer {bot_token}"}
            post_data = {
                'channel_id': self.channel_id,
                'message': response
            }
            
            post_result = await self.retry_handler.retry_with_backoff(
                requests.post,
                f"{self.mattermost_base_url}/posts",
                json=post_data,
                headers=headers
            )
            
            # Add to conversation history  
            self.add_to_history(persona_config.get('name', persona), response)
            
            # Invalidate message cache since we posted a new message
            self.message_cache.invalidate_cache()
            
            return [TextContent(type="text", text=f"OK: Posted as {persona_config.get('name', persona)}: {response[:100]}...")]
            
        except Exception as e:
            return [TextContent(type="text", text=f"ERROR: Error contributing: {str(e)}")]
    
    async def handle_get_conversation_context(self, arguments: dict) -> List[TextContent]:
        """Handle get_conversation_context tool calls"""
        if not self.mattermost:
            # Demo mode - return conversation summary
            if self.conversation_context.messages:
                recent = self.conversation_context.get_recent_messages(limit=5)
                summary = "Recent conversation:\n"
                for msg in recent:
                    summary += f"- {msg['author']}: {msg['content'][:100]}...\n"
                return [TextContent(type="text", text=f"[DEMO MODE] Conversation Context:\n{summary}")]
            else:
                return [TextContent(type="text", text="[DEMO MODE] No conversation context yet.")]
        
        try:
            # Get recent discussion
            posts = self.mattermost.posts.get_posts_for_channel(self.channel_id)
            context_summary = await self.analyze_conversation_context(posts)
            
            return [TextContent(type="text", text=f"Conversation Context Analysis:\n{context_summary}")]
            
        except Exception as e:
            return [TextContent(type="text", text=f"ERROR: Error analyzing conversation context: {str(e)}")]
    
    async def build_context(self, persona: str = "claude_research") -> str:
        """Build conversation context from ConversationContext"""
        return self.conversation_context.get_context_for_persona(persona)
    
    def add_to_history(self, author: str, content: str):
        """Add message to conversation history using ConversationContext"""
        self.conversation_context.add_message(author, content)
        
        # Track autonomous collaboration if enabled
        if self.collaboration_rules.get('enabled', False):
            self.update_autonomous_tracking(author, content)
    
    def update_autonomous_tracking(self, author: str, content: str):
        """Update autonomous collaboration tracking"""
        # Check if this is an AI participant
        ai_participants = ['Claude-Research', 'Kiro', 'claude_research', 'kiro']
        
        if author in ai_participants:
            conversation_id = f"{self.conversation_context.team}_{self.conversation_context.channel}"
            
            if conversation_id not in self.autonomous_exchanges:
                self.autonomous_exchanges[conversation_id] = {
                    'exchanges': 0,
                    'last_human_message_time': datetime.now(),
                    'participants': set()
                }
            
            # Track AI exchange
            self.autonomous_exchanges[conversation_id]['exchanges'] += 1
            self.autonomous_exchanges[conversation_id]['participants'].add(author)
        else:
            # Reset autonomous tracking on human message
            conversation_id = f"{self.conversation_context.team}_{self.conversation_context.channel}"
            if conversation_id in self.autonomous_exchanges:
                self.autonomous_exchanges[conversation_id]['last_human_message_time'] = datetime.now()
                # Don't reset exchanges here, just mark human activity
    
    def should_allow_autonomous_contribution(self, persona: str) -> bool:
        """Check if autonomous collaboration is allowed"""
        if not self.collaboration_rules.get('enabled', False):
            return True
        
        conversation_id = f"{self.conversation_context.team}_{self.conversation_context.channel}"
        max_exchanges = self.collaboration_rules.get('max_consecutive_ai_exchanges', 3)
        
        if conversation_id not in self.autonomous_exchanges:
            return True
        
        tracking = self.autonomous_exchanges[conversation_id]
        
        # Check if too many AI exchanges without human input
        if tracking['exchanges'] >= max_exchanges:
            return False
        
        return True
    
    def get_autonomous_context(self) -> str:
        """Get autonomous collaboration context for prompts"""
        conversation_id = f"{self.conversation_context.team}_{self.conversation_context.channel}"
        max_exchanges = self.collaboration_rules.get('max_consecutive_ai_exchanges', 3)
        
        if conversation_id not in self.autonomous_exchanges:
            return f"Autonomous exchanges: 0/{max_exchanges}, Participants: none"
        
        tracking = self.autonomous_exchanges[conversation_id]
        
        return f"Autonomous exchanges: {tracking['exchanges']}/{max_exchanges}, Participants: {', '.join(tracking['participants'])}"
    
    async def generate_response(self, message: str, persona_config: dict, context: str) -> str:
        """Generate AI response using persona and context"""
        # Check if Anthropic client is available
        if not self.anthropic_client:
            return f"I'm {persona_config.get('name', 'Assistant')} but I don't have access to AI generation right now. Here's a basic response to: {message}"
        
        try:
            # Build the persona prompt
            prompt = self.build_persona_prompt(
                persona_config.get('role', 'AI Assistant'),
                persona_config.get('description', 'Helpful AI assistant'),
                persona_config.get('behaviors', []),
                persona_config.get('avoid', [])
            )
            
            # Add context
            full_prompt = f"{prompt}\n\nContext:\n{context}\n\nUser message: {message}\n\nResponse:"
            
            # Generate response using Claude
            response = self.anthropic_client.messages.create(
                model="claude-3-haiku-20240307",  # Using fastest model for demo
                max_tokens=300,
                messages=[{"role": "user", "content": full_prompt}]
            )
            
            return response.content[0].text
            
        except Exception as e:
            logger.error(f"Error generating response: {e}")
            return f"I'm {persona_config.get('name', 'Assistant')} but I encountered an error generating a response: {str(e)}"
    
    def build_persona_prompt(self, role: str, description: str, behaviors: list, avoid_list: list) -> str:
        """Build persona-specific prompt from configuration"""
        prompt_parts = [
            f"You are the {role} in a technical team discussion.",
            f"Your role: {description}",
            ""
        ]
        
        if behaviors:
            prompt_parts.append("What you DO:")
            for behavior in behaviors:
                prompt_parts.append(f"- {behavior}")
        
        if avoid_list:
            prompt_parts.append("\nWhat you AVOID:")
            for avoid_item in avoid_list:
                prompt_parts.append(f"- {avoid_item}")
        
        # Add communication style from config
        comm_rules = self.config.get('communication', {})
        message_style = comm_rules.get('message_style', [])
        if message_style:
            prompt_parts.append("\nCommunication style:")
            for style_rule in message_style:
                prompt_parts.append(f"- {style_rule}")
        
        return "\n".join(prompt_parts)
    
    async def analyze_conversation_context(self, posts: dict) -> str:
        """Analyze conversation for context summary"""
        # Simple implementation for MVP - just return recent key topics
        try:
            recent_messages = []
            post_list = sorted(posts['posts'].items(), 
                             key=lambda x: x[1]['create_at'], 
                             reverse=True)[:10]
            
            for post_id, post in post_list:
                message = post.get('message', '')
                if message:
                    recent_messages.append(message)
            
            if not recent_messages:
                return "No recent discussion context available."
            
            # For MVP, return simple summary
            return f"Recent discussion summary:\n" + "\n".join(f"- {msg[:100]}..." for msg in recent_messages[:5])
            
        except Exception as e:
            return f"Error analyzing context: {str(e)}"
    
    async def run(self):
        """Run the MCP server"""
        try:
            logger.info("Multi-Model Debate MCP Server starting...")
            logger.info(f"Configuration: {self.config_file}")
            logger.info(f"Personas loaded: {list(self.config.get('personas', {}).keys())}")
            logger.info("Ready for MCP client connections!")
            
            # For now, run in stdio mode for Claude Code integration
            from mcp.server.stdio import stdio_server
            async with stdio_server() as (read_stream, write_stream):
                # Create proper initialization options
                init_options = InitializationOptions(
                    server_name="multi-model-debate",
                    server_version="1.0.0",
                    capabilities=ServerCapabilities(
                        tools={}  # Tools are registered via decorators
                    )
                )
                await self.server.run(read_stream, write_stream, init_options)
                
        except Exception as e:
            logger.error(f"Server error: {e}")
            raise

async def main():
    """Main entry point"""
    server = MultiModelMCPServer()
    await server.run()

if __name__ == "__main__":
    asyncio.run(main())
