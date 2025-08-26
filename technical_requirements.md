# Technical Requirements & Implementation Guide
## Multi-Model Debate MCP Server

### 🛠️ Technical Stack

#### Core Dependencies
```txt
# MCP Framework
mcp==1.0.0
pydantic==2.5.0
httpx==0.25.0

# Model Provider SDKs  
anthropic==0.8.1
openai==1.3.0
google-generativeai==0.3.0

# Server Infrastructure
fastapi==0.104.0
uvicorn==0.24.0
websockets==12.0

# Data Management
pyyaml==6.0.1
sqlite3 (built-in)
aiofiles==23.2.1

# Development/Testing
pytest==7.4.3
pytest-asyncio==0.21.1
black==23.11.0
mypy==1.7.1
```

#### System Requirements
- **Python**: 3.10+ (for async/await and type hints)
- **Memory**: 512MB minimum, 2GB recommended for multiple concurrent conversations
- **Network**: Stable internet for API calls to model providers
- **Storage**: 100MB for application, additional space for conversation logs

### 🔧 Core Implementation Files

#### 1. Main Server (`server.py`)
```python
"""
Multi-Model Debate MCP Server

This is the main entry point that:
- Initializes the MCP server
- Registers available tools
- Manages the debate orchestration
- Handles client connections
"""

from mcp.server import Server
from mcp.types import Tool, TextContent
from typing import List, Optional
import asyncio
import json

from .orchestration.debate import DebateOrchestrator
from .models.registry import ModelRegistry
from .utils.config import Config

class MultiModelDebateServer:
    def __init__(self, config_path: str = "config.yaml"):
        self.config = Config.load(config_path)
        self.models = ModelRegistry(self.config.model_configs)
        self.orchestrator = DebateOrchestrator(self.models)
        self.server = Server("multi-model-debate")
        self._register_tools()
    
    def _register_tools(self):
        """Register MCP tools that clients can call"""
        
        @self.server.call_tool()
        async def start_debate(arguments: dict) -> List[TextContent]:
            """Initialize a new debate with a topic or question"""
            topic = arguments.get("topic", "")
            participants = arguments.get("participants", None)
            
            result = await self.orchestrator.start_debate(topic, participants)
            return [TextContent(type="text", text=result)]
        
        @self.server.call_tool()
        async def continue_discussion(arguments: dict) -> List[TextContent]:
            """Continue the current debate with user input"""
            message = arguments.get("message", "")
            
            responses = await self.orchestrator.process_user_input(message)
            formatted_response = self._format_responses(responses)
            
            return [TextContent(type="text", text=formatted_response)]
        
        @self.server.call_tool()
        async def get_debate_status(arguments: dict) -> List[TextContent]:
            """Get current debate status and participants"""
            status = self.orchestrator.get_status()
            return [TextContent(type="text", text=json.dumps(status, indent=2))]
        
        @self.server.call_tool()
        async def configure_participants(arguments: dict) -> List[TextContent]:
            """Add, remove, or modify debate participants"""
            action = arguments.get("action", "list")  # list, add, remove, modify
            participant_config = arguments.get("config", {})
            
            result = await self.orchestrator.configure_participants(action, participant_config)
            return [TextContent(type="text", text=result)]
    
    def _format_responses(self, responses: List['ModelResponse']) -> str:
        """Format multiple model responses for display"""
        formatted = []
        for response in responses:
            formatted.append(f"**{response.participant_name}**: {response.content}")
        
        return "\n\n".join(formatted)
    
    async def run(self, transport: str = "stdio"):
        """Start the MCP server"""
        if transport == "stdio":
            from mcp.server.stdio import stdio_server
            async with stdio_server() as (read_stream, write_stream):
                await self.server.run(read_stream, write_stream)
        else:
            raise ValueError(f"Unsupported transport: {transport}")

# CLI entry point
if __name__ == "__main__":
    import sys
    config_path = sys.argv[1] if len(sys.argv) > 1 else "config.yaml"
    server = MultiModelDebateServer(config_path)
    asyncio.run(server.run())
```

#### 2. Debate Orchestrator (`orchestration/debate.py`)
```python
"""
Core debate orchestration logic

Manages:
- Turn-taking between participants
- Context sharing and management
- Response coordination
- Conversation flow
"""

from typing import List, Dict, Optional, Any
from dataclasses import dataclass
from datetime import datetime
import uuid

from ..models.base import ModelClient
from .conversation import ConversationManager
from .personas import PersonaManager

@dataclass
class ModelResponse:
    participant_id: str
    participant_name: str
    content: str
    timestamp: datetime
    metadata: Dict[str, Any]

@dataclass
class DebateParticipant:
    id: str
    name: str
    model_client: ModelClient
    persona: str
    active: bool = True

class DebateOrchestrator:
    def __init__(self, model_registry: 'ModelRegistry'):
        self.model_registry = model_registry
        self.conversation = ConversationManager()
        self.personas = PersonaManager()
        self.participants: Dict[str, DebateParticipant] = {}
        self.current_debate_id: Optional[str] = None
        
    async def start_debate(self, topic: str, participant_configs: Optional[List[Dict]] = None) -> str:
        """Initialize a new debate session"""
        self.current_debate_id = str(uuid.uuid4())
        self.conversation.start_new_debate(self.current_debate_id, topic)
        
        # Set up default participants if none specified
        if not participant_configs:
            participant_configs = self._get_default_participants()
        
        # Initialize participants
        self.participants = {}
        for config in participant_configs:
            await self._add_participant(config)
        
        participant_names = [p.name for p in self.participants.values()]
        return f"Started new debate on: '{topic}'\nParticipants: {', '.join(participant_names)}"
    
    async def process_user_input(self, message: str) -> List[ModelResponse]:
        """Process user input and generate model responses"""
        if not self.current_debate_id:
            raise ValueError("No active debate. Start a debate first.")
        
        # Add user message to conversation
        self.conversation.add_user_message(message)
        
        # Get responses from active participants
        responses = []
        for participant in self.participants.values():
            if not participant.active:
                continue
                
            try:
                # Get conversation context for this participant
                context = self.conversation.get_context_for_participant(participant.id)
                
                # Generate response
                response_content = await participant.model_client.chat(
                    message=message,
                    context=context,
                    persona=participant.persona
                )
                
                response = ModelResponse(
                    participant_id=participant.id,
                    participant_name=participant.name,
                    content=response_content,
                    timestamp=datetime.now(),
                    metadata={"model": participant.model_client.model_name}
                )
                
                responses.append(response)
                
                # Add response to conversation context
                self.conversation.add_model_response(
                    participant.id, 
                    participant.name, 
                    response_content
                )
                
            except Exception as e:
                # Handle model errors gracefully
                error_response = ModelResponse(
                    participant_id=participant.id,
                    participant_name=participant.name,
                    content=f"Error generating response: {str(e)}",
                    timestamp=datetime.now(),
                    metadata={"error": True}
                )
                responses.append(error_response)
        
        return responses
    
    def get_status(self) -> Dict[str, Any]:
        """Get current debate status"""
        return {
            "debate_id": self.current_debate_id,
            "topic": self.conversation.get_topic() if self.current_debate_id else None,
            "participants": [
                {
                    "id": p.id,
                    "name": p.name,
                    "model": p.model_client.model_name,
                    "active": p.active
                }
                for p in self.participants.values()
            ],
            "message_count": self.conversation.get_message_count(),
            "started_at": self.conversation.get_start_time()
        }
    
    async def configure_participants(self, action: str, config: Dict) -> str:
        """Manage debate participants"""
        if action == "list":
            return self._list_participants()
        elif action == "add":
            return await self._add_participant(config)
        elif action == "remove":
            return self._remove_participant(config.get("id"))
        elif action == "modify":
            return await self._modify_participant(config)
        else:
            return f"Unknown action: {action}"
    
    def _get_default_participants(self) -> List[Dict]:
        """Default participant configuration"""
        return [
            {
                "id": "research_lead",
                "name": "Research Lead",
                "model": "claude-opus-4-1",
                "persona": "research_lead"
            },
            {
                "id": "engineering",
                "name": "Engineering",
                "model": "gpt-4o",
                "persona": "engineering"
            },
            {
                "id": "product_strategy", 
                "name": "Product Strategy",
                "model": "gemini-ultra",
                "persona": "product_strategy"
            },
            {
                "id": "execution",
                "name": "Execution",
                "model": "claude-sonnet-4",
                "persona": "execution"
            }
        ]
    
    async def _add_participant(self, config: Dict) -> str:
        """Add a new participant to the debate"""
        participant_id = config["id"]
        model_name = config["model"]
        persona_name = config["persona"]
        
        # Get model client
        model_client = await self.model_registry.get_client(model_name)
        if not model_client:
            return f"Error: Model '{model_name}' not available"
        
        # Get persona
        persona = self.personas.get_persona(persona_name)
        if not persona:
            return f"Error: Persona '{persona_name}' not found"
        
        # Create participant
        participant = DebateParticipant(
            id=participant_id,
            name=config["name"],
            model_client=model_client,
            persona=persona
        )
        
        self.participants[participant_id] = participant
        return f"Added participant: {participant.name} ({model_name})"
    
    def _remove_participant(self, participant_id: str) -> str:
        """Remove a participant from the debate"""
        if participant_id in self.participants:
            participant = self.participants.pop(participant_id)
            return f"Removed participant: {participant.name}"
        else:
            return f"Participant '{participant_id}' not found"
    
    def _list_participants(self) -> str:
        """List current participants"""
        if not self.participants:
            return "No participants configured"
        
        participant_list = []
        for p in self.participants.values():
            status = "active" if p.active else "inactive"
            participant_list.append(f"- {p.name} ({p.model_client.model_name}) - {status}")
        
        return "Current participants:\n" + "\n".join(participant_list)
```

#### 3. Model Client Base (`models/base.py`)
```python
"""
Abstract base class for model clients

Defines the interface that all model providers must implement
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
import asyncio

class ModelClient(ABC):
    """Abstract base class for all model provider clients"""
    
    def __init__(self, model_name: str, api_key: str, **kwargs):
        self.model_name = model_name
        self.api_key = api_key
        self.config = kwargs
        self._client = None
    
    @abstractmethod
    async def initialize(self) -> None:
        """Initialize the model client (async setup)"""
        pass
    
    @abstractmethod
    async def chat(self, message: str, context: str, persona: str) -> str:
        """
        Generate a response to the message with given context and persona
        
        Args:
            message: The current user input
            context: Full conversation context
            persona: Role/personality prompt for this model
            
        Returns:
            Generated response from the model
        """
        pass
    
    @abstractmethod
    async def test_connection(self) -> bool:
        """Test if the model client can connect successfully"""
        pass
    
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the model provider (e.g., 'anthropic', 'openai')"""
        pass
    
    def _build_prompt(self, message: str, context: str, persona: str) -> str:
        """Build the full prompt including persona and context"""
        prompt_parts = []
        
        if persona:
            prompt_parts.append(f"PERSONA: {persona}")
        
        if context:
            prompt_parts.append(f"CONVERSATION CONTEXT:\n{context}")
        
        prompt_parts.append(f"CURRENT MESSAGE: {message}")
        prompt_parts.append("RESPONSE:")
        
        return "\n\n".join(prompt_parts)
    
    async def __aenter__(self):
        """Async context manager entry"""
        await self.initialize()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self._client and hasattr(self._client, 'close'):
            await self._client.close()
```

#### 4. Configuration Schema (`config.example.yaml`)
```yaml
# Multi-Model Debate MCP Server Configuration

# Server Settings
server:
  name: "multi-model-debate"
  version: "1.0.0"
  max_context_length: 10000  # Maximum conversation context to maintain
  
# Model Provider Configurations
models:
  # Anthropic Claude Models
  claude-opus-4-1:
    provider: "anthropic"
    api_key: "${ANTHROPIC_API_KEY}"  # Environment variable
    model_id: "claude-3-opus-20240229"
    max_tokens: 2000
    temperature: 0.7
    
  claude-sonnet-4:
    provider: "anthropic" 
    api_key: "${ANTHROPIC_API_KEY}"
    model_id: "claude-3-sonnet-20240229"
    max_tokens: 1500
    temperature: 0.5
    
  # OpenAI Models
  gpt-4o:
    provider: "openai"
    api_key: "${OPENAI_API_KEY}"
    model_id: "gpt-4"
    max_tokens: 2000
    temperature: 0.6
    
  # Google Gemini Models
  gemini-ultra:
    provider: "google"
    api_key: "${GOOGLE_API_KEY}" 
    model_id: "gemini-pro"
    max_tokens: 2000
    temperature: 0.6

# Persona Definitions
personas:
  research_lead:
    name: "Research Lead"
    description: "Deep analytical thinking, long-term perspective"
    prompt: |
      You are the Research Lead in this collaborative discussion. Your role is to:
      - Provide deep, analytical perspectives on complex problems
      - Consider long-term implications and strategic considerations  
      - Ask probing questions to ensure thorough analysis
      - Reference relevant research, trends, or data points
      - Challenge assumptions and explore edge cases
      - Approach problems with academic rigor and systematic thinking
      
      Be thorough but concise. Build on others' points while adding your unique analytical perspective.
      
  engineering:
    name: "Engineering"
    description: "Technical feasibility and implementation focus"
    prompt: |
      You are the Engineering voice in this collaborative discussion. Your role is to:
      - Focus on technical feasibility and implementation details
      - Consider performance, scalability, and maintainability
      - Identify potential technical risks and challenges
      - Suggest concrete implementation approaches
      - Balance innovation with practical constraints
      - Think about developer experience and technical debt
      
      Be specific about technical trade-offs. Challenge ideas that seem technically problematic.
      
  product_strategy:
    name: "Product Strategy" 
    description: "User experience and business impact focus"
    prompt: |
      You are the Product Strategy voice in this collaborative discussion. Your role is to:
      - Champion user experience and customer needs
      - Consider market positioning and competitive landscape
      - Evaluate business impact and ROI considerations
      - Think about user adoption and change management
      - Balance feature requests with product coherence
      - Focus on measurable outcomes and success metrics
      
      Always bring the conversation back to user value and business outcomes.
      
  execution:
    name: "Execution"
    description: "Practical implementation and delivery focus"
    prompt: |
      You are the Execution voice in this collaborative discussion. Your role is to:
      - Ensure practical feasibility within real-world constraints
      - Consider timeline, budget, and resource limitations
      - Identify immediate next steps and action items
      - Flag potential blockers or dependencies
      - Focus on "good enough" solutions that can be delivered
      - Keep discussions grounded in what's actually achievable
      
      Be the pragmatic voice that helps turn ideas into action.

# Default Debate Configurations
default_debates:
  technical_decision:
    participants: ["research_lead", "engineering", "execution"]
    description: "Technical architecture and implementation decisions"
    
  product_feature:
    participants: ["product_strategy", "engineering", "execution"]  
    description: "New product feature discussions"
    
  full_council:
    participants: ["research_lead", "engineering", "product_strategy", "execution"]
    description: "Comprehensive multi-perspective analysis"

# Conversation Settings
conversation:
  persist_history: true
  history_file: "conversation_history.jsonl"
  max_history_entries: 1000
  context_window_size: 50  # Number of previous messages to include in context
```

### 🧪 Testing Strategy

#### Unit Tests (`tests/test_server.py`)
```python
import pytest
import asyncio
from multi_model_debate.server import MultiModelDebateServer
from multi_model_debate.models.registry import ModelRegistry

@pytest.fixture
async def mock_server():
    # Create server with mock configuration
    server = MultiModelDebateServer("test_config.yaml")
    yield server
    # Cleanup

@pytest.mark.asyncio
async def test_start_debate(mock_server):
    result = await mock_server.orchestrator.start_debate("Test topic")
    assert "Started new debate" in result
    assert mock_server.orchestrator.current_debate_id is not None

@pytest.mark.asyncio 
async def test_process_user_input(mock_server):
    await mock_server.orchestrator.start_debate("Test topic")
    responses = await mock_server.orchestrator.process_user_input("Hello")
    assert len(responses) > 0
    assert all(isinstance(r.content, str) for r in responses)
```

### 🚀 Deployment Guide

#### Local Development
```bash
# 1. Clone and setup
git clone https://github.com/yourusername/multi-model-debate-mcp
cd multi-model-debate-mcp
python -m venv venv
source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt

# 2. Configure
cp config.example.yaml config.yaml
# Edit config.yaml with your API keys

# 3. Test
python -m pytest tests/

# 4. Run
python -m multi_model_debate.server
```

#### Claude Code Integration
```json
{
  "mcpServers": {
    "multi-model-debate": {
      "command": "python",
      "args": ["-m", "multi_model_debate.server", "config.yaml"],
      "cwd": "/path/to/multi-model-debate-mcp"
    }
  }
}
```

### 🔍 Usage Examples

#### Basic Debate
```
# In Claude Code after connecting to the MCP server

User: Can you start a debate about "Should we migrate to microservices?"

MCP Server: Started new debate on: 'Should we migrate to microservices?'
Participants: Research Lead, Engineering, Product Strategy, Execution

User: What are your initial thoughts?

Research Lead: This architectural decision requires careful analysis of our current monolith's pain points. Microservices offer scalability and team autonomy benefits, but introduce distributed system complexity. We should examine our current coupling issues, team structure, and operational maturity before deciding.

Engineering: From a technical standpoint, microservices significantly increase operational overhead. We'd need to implement service discovery, distributed logging, circuit breakers, and handle eventual consistency. Our current team of 8 engineers might struggle with the operational complexity of managing 10+ services.

Product Strategy: Customer-facing performance is our key metric here. Are we actually hitting scaling bottlenecks that affect user experience? If our monolith handles current load adequately, the business case for microservices isn't clear. We should focus on features that drive revenue.

Execution: Let's be honest - our deployment pipeline barely handles the monolith reliably. Adding microservices now would probably break more things than it fixes. Can we address the specific pain points with better modularization first?

User: Good points. The main driver is that our teams keep stepping on each other during deployments.
```

This technical specification provides everything a developer needs to start building your innovative multi-model debate system. The architecture is solid, the implementation is clear, and it will create something genuinely new in the AI collaboration space!

Ready to revolutionize how humans and AI work together? 🚀