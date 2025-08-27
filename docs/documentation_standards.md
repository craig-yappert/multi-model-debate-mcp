# Documentation Standards

## Document Structure Standards

### Title Format
```markdown
# [Document Type]: [Descriptive Title]
[Brief subtitle or context - optional]
```

**Examples:**
- `# Design: MCP Server Architecture`
- `# Testing: Autonomous Collaboration Validation Strategy`
- `# Setup: Mattermost Docker Deployment`
- `# Rules: Multi-Model Chat Coordination`

### Header Hierarchy
```markdown
# Document Title (H1 - only one per document)
## Major Sections (H2)
### Subsections (H3)
#### Details (H4 - use sparingly)
```

**Standard Section Order:**
1. **Overview** - Brief description and purpose
2. **Context** - Background and current state (if applicable)
3. **Main Content** - Core information organized by topic
4. **Implementation/Next Steps** - Actionable items (if applicable)
5. **References** - Links to related documents

### Document Metadata
**Required at top of every document:**
```markdown
# Document Title

**Created:** YYYY-MM-DD  
**Last Updated:** YYYY-MM-DD  
**Status:** [Draft|Active|Stable|Archived]  
**Contributors:** [List of participants]  
**Related:** [Links to related documents]

---
```

## Content Standards

### Writing Style
- **Direct and concise** - No unnecessary fluff
- **Action-oriented** - Use active voice
- **Scannable** - Use bullet points and short paragraphs
- **Consistent terminology** - Use project glossary terms

### Code Blocks
```markdown
# Always specify language
```python
def example_function():
    return "Always include language identifier"
```

# Use yaml for configuration examples
```yaml
example:
  setting: value
```

# Use bash for command examples
```bash
# Include comments for complex commands
docker run --name mattermost example/command
```
```

### Lists and Formatting
- **Use bullet points** for unordered lists
- **Use numbered lists** for sequential steps
- **Bold key terms** on first usage
- **Use `code formatting`** for file names, commands, and technical terms
- **Use > blockquotes** for important notes or warnings

## Comment and Attribution System

### Inline Comments
```markdown
<!-- COMMENT: [Participant] - [Date] - [Comment text] -->
```

**Examples:**
```markdown
<!-- COMMENT: Kiro - 2025-08-25 - This section needs validation testing -->
<!-- COMMENT: Claude-Research - 2025-08-25 - Consider adding error handling -->
```

### Section Attribution
```markdown
## Section Title
*[Contributor: Participant Name - Date]*

Content here...
```

### Review Comments
```markdown
## Review Comments

### Kiro - 2025-08-25
- **Concern:** Implementation complexity too high for MVP
- **Suggestion:** Start with single-team support
- **Status:** Addressed in Phase 1 section

### Claude-Research - 2025-08-25
- **Analysis:** Architecture is sound but needs GitHub integration
- **Recommendation:** Add Phase 3 for repository context
- **Status:** Incorporated into roadmap
```

### Change Log
```markdown
## Change Log

**2025-08-25 - Kiro**
- Added autonomous collaboration rules
- Updated termination conditions
- Refined persona consistency requirements

**2025-08-25 - Claude-Research**
- Initial document creation
- Defined core MCP tools
- Established multi-team architecture
```

## File Naming Conventions

### Standard Patterns
- **Design documents:** `design_[topic].md`
- **Testing documents:** `testing_[scope].md`
- **Setup guides:** `setup_[system].md`
- **Rules/Config:** `[system]_rules.yaml` or `[system]_config.yaml`
- **Meeting notes:** `discussion_[date]_[topic].md`

### Examples
- `design_mcp_server.md`
- `testing_autonomous_collaboration.md`
- `setup_mattermost_docker.md`
- `chat_coordination_rules.yaml`
- `discussion_2025-08-25_rule_updates.md`

## Status Definitions

### Document Status Levels
- **Draft** - Work in progress, may change significantly
- **Active** - Current working document, stable but may be updated
- **Stable** - Finalized, changes require team discussion
- **Archived** - Historical reference, no longer actively maintained

### Status Indicators
```markdown
**Status:** Draft ⚠️
**Status:** Active ✏️
**Status:** Stable ✅
**Status:** Archived 📁
```

## Quality Checklist

### Before Publishing
- [ ] Document has proper metadata header
- [ ] Title follows standard format
- [ ] Headers use consistent hierarchy
- [ ] Code blocks specify language
- [ ] Contributors are attributed
- [ ] Status is clearly indicated
- [ ] Related documents are linked
- [ ] Content is scannable (bullets, short paragraphs)
- [ ] Technical terms are consistent

### Review Process
1. **Self-review** - Creator checks against standards
2. **Peer review** - Other participants add review comments
3. **Status update** - Move from Draft to Active/Stable
4. **Archive when obsolete** - Move to archive/ with final status

## Templates

### Basic Document Template
```markdown
# [Type]: [Title]

**Created:** YYYY-MM-DD  
**Last Updated:** YYYY-MM-DD  
**Status:** Draft ⚠️  
**Contributors:** [Your Name]  
**Related:** [Links to related docs]

---

## Overview
Brief description of document purpose and scope.

## [Main Content Sections]
Organized content here...

## Next Steps
- [ ] Action item 1
- [ ] Action item 2

## Change Log
**YYYY-MM-DD - [Your Name]**
- Initial document creation

---

*Document maintained as part of multi-model collaborative development process*
```

---

**Created:** 2025-08-25  
**Last Updated:** 2025-08-25  
**Status:** Active ✏️  
**Contributors:** Kiro  
**Related:** `docs/README.md`

## Change Log
**2025-08-25 - Kiro**
- Initial documentation standards creation
- Defined structure, attribution, and quality standards
- Created templates and examples

---

*These standards ensure consistent, trackable, and maintainable documentation across all multi-model collaborative development.*