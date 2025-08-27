#!/usr/bin/env python3
"""
Test suite for Multi-Model Debate MCP Server
"""

import pytest
import asyncio
import os
import sys
from unittest.mock import Mock, AsyncMock, patch, MagicMock

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.mcp_server import MultiModelMCPServer, RetryHandler, MessageCache, ConversationContext


class TestConversationContext:
    """Test ConversationContext functionality"""
    
    def test_initialization(self):
        """Test ConversationContext initialization"""
        context = ConversationContext("test-team", "test-channel", max_context=10)
        assert context.team == "test-team"
        assert context.channel == "test-channel"
        assert context.max_context == 10
        assert len(context.messages) == 0
    
    def test_add_message(self):
        """Test adding messages to context"""
        context = ConversationContext("test", "channel")
        context.add_message("user1", "Hello world")
        
        assert len(context.messages) == 1
        assert context.messages[0]['author'] == "user1"
        assert context.messages[0]['content'] == "Hello world"
        assert 'timestamp' in context.messages[0]
    
    def test_message_truncation(self):
        """Test that long messages are truncated"""
        context = ConversationContext("test", "channel")
        long_message = "x" * 300  # Longer than 200 chars
        context.add_message("user1", long_message)
        
        assert len(context.messages[0]['content']) == 200
    
    def test_context_limit(self):
        """Test that context is limited to max_context messages"""
        context = ConversationContext("test", "channel", max_context=3)
        
        for i in range(5):
            context.add_message(f"user{i}", f"message {i}")
        
        assert len(context.messages) == 3
        # Should keep the last 3 messages
        assert context.messages[0]['content'] == "message 2"
        assert context.messages[2]['content'] == "message 4"


class TestRetryHandler:
    """Test RetryHandler functionality"""
    
    @pytest.mark.asyncio
    async def test_successful_retry(self):
        """Test successful function execution without retry"""
        handler = RetryHandler(max_retries=3)
        
        async def success_func():
            return "success"
        
        result = await handler.retry_with_backoff(success_func)
        assert result == "success"
    
    @pytest.mark.asyncio
    async def test_retry_with_eventual_success(self):
        """Test retry mechanism with eventual success"""
        handler = RetryHandler(max_retries=3, base_delay=0.01)
        call_count = 0
        
        async def eventually_success():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise Exception("Temporary failure")
            return "success"
        
        result = await handler.retry_with_backoff(eventually_success)
        assert result == "success"
        assert call_count == 3
    
    @pytest.mark.asyncio
    async def test_retry_exhaustion(self):
        """Test that retry eventually fails after max attempts"""
        handler = RetryHandler(max_retries=2, base_delay=0.01)
        
        async def always_fail():
            raise Exception("Always fails")
        
        with pytest.raises(Exception, match="Always fails"):
            await handler.retry_with_backoff(always_fail)


class TestMessageCache:
    """Test MessageCache functionality"""
    
    def test_cache_initialization(self):
        """Test MessageCache initialization"""
        cache = MessageCache(cache_duration_seconds=60)
        assert cache.cache_duration == 60
        assert len(cache.cache) == 0
    
    def test_cache_operations(self):
        """Test basic cache operations"""
        cache = MessageCache(cache_duration_seconds=60)
        
        # Test cache miss
        assert cache.get_cached_messages("key1") is None
        assert not cache.is_cache_valid("key1")
        
        # Test cache set and hit
        test_data = {"messages": ["msg1", "msg2"]}
        cache.cache_messages("key1", test_data)
        
        assert cache.is_cache_valid("key1")
        assert cache.get_cached_messages("key1") == test_data
    
    def test_cache_invalidation(self):
        """Test cache invalidation"""
        cache = MessageCache(cache_duration_seconds=60)
        
        cache.cache_messages("key1", {"data": "test1"})
        cache.cache_messages("key2", {"data": "test2"})
        
        # Test specific key invalidation
        cache.invalidate_cache("key1")
        assert cache.get_cached_messages("key1") is None
        assert cache.get_cached_messages("key2") is not None
        
        # Test full cache clear
        cache.invalidate_cache()
        assert cache.get_cached_messages("key2") is None


class TestMultiModelMCPServer:
    """Test MultiModelMCPServer functionality"""
    
    @pytest.fixture
    def mock_env(self):
        """Mock environment variables"""
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'test-key'}, clear=False):
            yield
    
    @pytest.fixture
    def server(self, mock_env):
        """Create a test server instance"""
        with patch('src.mcp_server.MultiModelMCPServer.init_mattermost'):
            server = MultiModelMCPServer()
            return server
    
    def test_server_initialization(self, server):
        """Test server initialization"""
        assert server is not None
        assert server.config is not None
        assert hasattr(server, 'anthropic_client')
        assert hasattr(server, 'conversation_context')
        assert hasattr(server, 'retry_handler')
        assert hasattr(server, 'message_cache')
    
    def test_config_loading(self, server):
        """Test configuration loading"""
        assert 'personas' in server.config
        assert 'claude-research' in server.config['personas']
        # autonomous_collaboration is nested under communication
        assert 'communication' in server.config
        assert 'autonomous_collaboration' in server.config['communication']
    
    def test_conversation_context_management(self, server):
        """Test conversation context management"""
        server.add_to_history("test-user", "test message")
        
        messages = server.conversation_context.get_recent_messages(1)
        assert len(messages) == 1
        assert messages[0]['author'] == "test-user"
        assert messages[0]['content'] == "test message"
    
    def test_persona_prompt_building(self, server):
        """Test persona prompt building"""
        persona_config = {
            'role': 'Test Role',
            'description': 'Test description',
            'behavior': ['Do this', 'Do that'],
            'avoid': ['Avoid this']
        }
        
        prompt = server.build_persona_prompt(persona_config)
        
        assert 'Test Role' in prompt
        assert 'Test description' in prompt
        assert 'Do this' in prompt
        assert 'Avoid this' in prompt
    
    def test_autonomous_collaboration_tracking(self, server):
        """Test autonomous collaboration tracking"""
        server.collaboration_rules = {'enabled': True, 'max_exchanges': 3}
        
        # Test initial state
        assert server.should_allow_autonomous_contribution("claude_research")
        
        # Add AI messages to trigger tracking (under limit)
        server.add_to_history("Claude-Research", "AI message 1")
        server.add_to_history("Kiro", "AI message 2")
        
        # Should still allow (2 < 3)
        assert server.should_allow_autonomous_contribution("claude_research")
        
        # Add one more to reach limit
        server.add_to_history("Claude-Research", "AI message 3")
        
        # Should not allow (3 >= 3)
        assert not server.should_allow_autonomous_contribution("claude_research")
        
        # Human message should reset
        server.add_to_history("human-user", "Human message")
        assert server.should_allow_autonomous_contribution("claude_research")


@pytest.mark.asyncio
async def test_mcp_tools_registration():
    """Test that MCP tools are properly registered"""
    with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'test-key'}, clear=False):
        with patch('src.mcp_server.MultiModelMCPServer.init_mattermost'):
            server = MultiModelMCPServer()
            
            # Check that server has tools registered
            assert server.server is not None
            # Note: We can't easily test the actual tool functions without a full MCP setup
            # but we can verify the server was created successfully


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])