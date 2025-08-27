# Documentation Directory

**Created:** 2025-08-25  
**Last Updated:** 2025-08-25  
**Status:** Active ✏️  
**Contributors:** Kiro  
**Related:** `documentation_standards.md`

---

## Organization

This directory contains all project documentation organized by category following the standards defined in `documentation_standards.md`.

### Current Structure

```
docs/
├── README.md                           # This file - documentation index
├── documentation_standards.md          # Documentation standards and templates
├── design/                             # Architecture and design documents
├── coordination/                       # Multi-model collaboration protocols  
├── testing/                           # Testing strategies and validation
├── setup/                             # Deployment and configuration guides
└── archive/                           # Historical and deprecated documents
```

### Document Categories

**Design Documents** (`design/`)
- System architecture and technical design
- Requirements and specifications
- Long-term vision and roadmap

**Coordination Rules** (`coordination/`)
- Multi-model collaboration protocols
- Persona definitions and behavioral rules
- Active discussion management

**Testing Documentation** (`testing/`)
- Technical testing strategies
- Research validation approaches
- Quality assurance protocols

**Setup & Configuration** (`setup/`)
- Deployment guides and instructions
- Environment configuration
- Project structure documentation

**Archive** (`archive/`)
- Deprecated documents
- Historical versions
- Reference materials

### Maintenance Guidelines

**Keep It Clean:**
- Move completed discussions to archive
- Update index when adding new documents
- Use consistent naming conventions
- Remove outdated information

**Document Lifecycle:**
1. **Draft** - Work in progress, may be in root directory
2. **Active** - Moved to appropriate category directory
3. **Stable** - Finalized and referenced by other docs
4. **Archived** - Historical reference, moved to archive/

### Quick Reference

**Current Active Documents:**
- `design/mcp_design.md` - Current MCP server architecture
- `coordination/chat_coordination_rules.yaml` - Live collaboration rules
- `testing/mvp_technical_review.md` - MVP implementation testing
- `testing/autonomous_collaboration_testing.md` - Research validation strategy

**Configuration Files:**
- `../chat_coordination_rules.yaml` - Main rules file (dynamically loaded)
- `../config/` - Runtime configuration

**Implementation:**
- `../src/` - Source code
- `../tests/` - Test implementations

---

*This documentation structure supports the multi-model collaborative development process by keeping information organized and accessible to all participants.*