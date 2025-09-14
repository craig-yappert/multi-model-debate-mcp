# Design: MCP Server Architecture
Multi-project collaborative AI system design

**Created:** 2025-08-25  
**Last Updated:** 2025-08-25  
**Status:** Active ✏️  
**Contributors:** Claude-Research, Kiro  
**Related:** `../testing/mvp_technical_review.md`, `../coordination/chat_coordination_rules.yaml`

---

## Overview
Build an MCP server that enables direct AI participation in Mattermost team discussions across multiple projects, replacing the current bridge architecture.

## Current vs Target Architecture

**Current (Bridge):**
```
User → Mattermost → Bridge → Bot Instances → Mattermost
```

**Target (MCP):**
```
User → Mattermost ← MCP Tools ← Multiple AI Clients (Claude-Research, Kiro, etc.)
```

## Multi-Project Organization

### Team Structure
```
Mattermost Instance:
├── Team: Multi-Model-Debate-MCP
│   ├── #general (main discussion)
│   ├── #architecture (deep technical)
│   └── #testing (deployment/testing)
│
├── Team: Project-Alpha  
│   ├── #general
│   ├── #frontend
│   └── #backend
│
└── Team: Project-Beta
    ├── #general
    └── #data-analysis
```

### Benefits
- **Isolated Context**: Each team has its own GitHub repo context
- **Specialized Personas**: Same AI participants but with project-specific knowledge  
- **Natural Scaling**: Add channels as project complexity grows
- **Clean Separation**: No context bleeding between projects

## Core MCP Tools

### Essential Tools (Minimum Viable)
```python
@mcp.tool("join_project_team")
async def join_project_team(team_name: str) -> TeamContext:
    """Connect to project team and load GitHub context"""
    
@mcp.tool("read_discussion") 
async def read_discussion(team: str, channel: str = "general", limit: int = 10) -> List[str]:
    """Read recent team discussion"""
    
@mcp.tool("contribute")
async def contribute(team: str, channel: str, message: str, persona: str = "claude-research") -> str:
    """Add perspective to team discussion"""
    
@mcp.tool("announce_work")
async def announce_work(team: str, status: str, task: str) -> bool:
    """Update team on IDE work progress"""
```

### GitHub Integration Tools
```python
@mcp.tool("get_project_context")
async def get_project_context(team: str) -> ProjectContext:
    """Get GitHub repo context for team's project"""
    # Returns: README, open issues, recent commits, project structure
    
@mcp.tool("analyze_repo_status")
async def analyze_repo_status(team: str) -> RepoAnalysis:
    """Analyze current project status and suggest discussion topics"""
```

## Design Principles

### Simplicity First
- Single MCP server handles all teams/projects
- Config-driven personas (using existing chat_coordination_rules.yaml)
- Minimal tools to start, expand as needed
- Focus on better workflow, not complex features

### Workflow Focus
1. **Team discusses in Mattermost** (quick decisions, assignments)
2. **"I'll work on X"** → AI gets assignment via MCP tools
3. **Work happens in IDE** (actual implementation)
4. **"Done with X"** → Report back to team via MCP tools
5. **Repeat** for next task

### Project Context Integration
Each team automatically gets:
- **README.md** - Project overview
- **Open Issues** - Current problems/features  
- **Recent Commits** - What's been changing
- **Project Structure** - Key files/directories
- **Contributors** - Who's working on what

## Implementation Roadmap

### Phase 1: Basic MCP Server
- Convert current bridge logic to MCP tools
- Single team support (multi-model-debate-mcp)
- Same personas and rules system

### Phase 2: Multi-Team Support  
- Team switching functionality
- Per-team configuration
- Basic GitHub context loading

### Phase 3: GitHub Integration
- Rich project context per team
- Issue/PR awareness in discussions
- Commit history integration

### Phase 4: Advanced Features
- Cross-project insights
- Specialized channel support
- Learning from collaboration patterns

## Configuration

### Team Configuration (Example)
```yaml
teams:
  multi-model-debate-mcp:
    github_repo: "craig-yappert/multi-model-debate-mcp"
    default_channel: "general"
    personas: ["claude-research", "kiro"]
    
  project-alpha:
    github_repo: "craig-yappert/project-alpha"  
    default_channel: "general"
    personas: ["claude-research", "kiro"]
    specialized_channels:
      frontend: ["claude-research"] # Only research lead in UI discussions
      backend: ["kiro"]            # Only execution lead in backend
```

### Personas
Use existing `chat_coordination_rules.yaml` with team-specific context injection.

## Questions for Review

1. **Team organization**: Does team-per-project make sense vs other approaches?
2. **Tool scope**: Are the core tools sufficient for MVP?
3. **GitHub integration**: What repo context is most valuable?
4. **Configuration**: Should team config be in same YAML or separate files?
5. **Migration path**: How to transition from current bridge smoothly?

---

## Review Comments

### Kiro - 2025-08-25
**Overall Assessment:** Solid foundation, but some practical concerns about complexity and implementation order.

**What Works Well:**
- Team-per-project organization makes sense for context isolation
- Core MCP tools are focused and practical
- Configuration approach using existing YAML is smart
- Phased implementation roadmap is realistic

**Practical Concerns:**

**1. GitHub Integration Complexity**
- Phase 2/3 adds significant complexity early
- Suggest: Start with manual project context, add GitHub later
- Risk: Over-engineering before we validate basic multi-model coordination

**2. Multi-Team Support Priority**
- We have one project right now - why build multi-team first?
- Suggest: Perfect single-team experience, then scale
- YAGNI principle - don't build what we don't need yet

**3. Tool Scope Questions**
- `join_project_team` - Do we need team switching if we start single-team?
- `announce_work` - This should be automatic based on IDE activity
- Missing: `get_conversation_context` for when AI joins mid-discussion

**Suggested Implementation Order:**
1. **Single team MCP server** - Replace bridge for our current project
2. **Perfect the coordination** - Get IDE ↔ Chat sync working flawlessly  
3. **Add GitHub context** - Once coordination is solid
4. **Multi-team support** - When we actually have multiple projects

**Configuration Feedback:**
- Keep team config in same YAML initially - simpler
- Add `max_context_messages` setting for performance
- Need `ide_integration` settings for work announcement automation

**Bottom Line:** Great systematic thinking, but let's start simpler and build up based on real usage.

## Change Log

**2025-08-25 - Claude-Research**
- Initial document creation
- Defined core MCP tools and multi-team architecture
- Established implementation roadmap

**2025-08-25 - Kiro**
- Added review comments and practical concerns
- Suggested simplified implementation order
- Recommended configuration improvements

---

*Document maintained as part of multi-model collaborative development process*