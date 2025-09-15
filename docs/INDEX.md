# 📚 Documentation Index

## 🎯 Start Here

**New to the project?** → [`current/README.md`](current/README.md)
**Need setup help?** → [`setup/SETUP_GUIDE.md`](setup/SETUP_GUIDE.md)
**System status?** → [`current/STATUS.md`](current/STATUS.md)

## 📁 Documentation Structure

```
docs-reorganized/
├── current/           # What actually works today
│   ├── README.md           # Main project documentation
│   ├── STATUS.md           # Current system status
│   └── TECHNICAL_REFERENCE.md  # Implementation details
│
├── proposals/         # 🆕 NEW: Evolution proposals and extensions
│   ├── VS_CODE_AI_COLLABORATION_PROPOSAL.md  # VS Code extension proposal
│   └── MCP_TO_VSCODE_MIGRATION_GUIDE.md      # Technical migration guide
│
├── setup/             # Installation and configuration
│   └── SETUP_GUIDE.md      # Complete setup instructions
│
├── roadmap/           # Future plans and vision
│   └── FUTURE_VISION.md    # Long-term multi-model AI goals
│
└── archive/           # Outdated documentation
    ├── old-README.md       # Original vision-based README
    ├── old-specs/          # Unimplemented specifications
    └── historical/         # Previous status documents
```

## 🚀 Quick Links by Use Case

### 👤 I want to use this system
- **Start**: [`current/README.md`](current/README.md) - What it does and how to use it
- **Setup**: [`setup/SETUP_GUIDE.md`](setup/SETUP_GUIDE.md) - Step-by-step installation
- **Status**: [`current/STATUS.md`](current/STATUS.md) - Is it working?

### 🛠️ I want to develop/integrate
- **Technical**: [`current/TECHNICAL_REFERENCE.md`](current/TECHNICAL_REFERENCE.md) - API details and architecture
- **Setup**: [`setup/SETUP_GUIDE.md`](setup/SETUP_GUIDE.md) - Development environment
- **Status**: [`current/STATUS.md`](current/STATUS.md) - What's implemented

### 🔮 I want to understand the vision
- **Future**: [`roadmap/FUTURE_VISION.md`](roadmap/FUTURE_VISION.md) - Long-term goals and planned features
- **Current**: [`current/README.md`](current/README.md) - What we have now vs. the vision

### 🚀 I want to extend/evolve the system
- **VS Code Extension**: [`proposals/VS_CODE_AI_COLLABORATION_PROPOSAL.md`](proposals/VS_CODE_AI_COLLABORATION_PROPOSAL.md) - Bring AI collaboration into the IDE
- **Migration Guide**: [`proposals/MCP_TO_VSCODE_MIGRATION_GUIDE.md`](proposals/MCP_TO_VSCODE_MIGRATION_GUIDE.md) - Technical implementation details

### 🐛 I have problems
- **Troubleshooting**: [`setup/SETUP_GUIDE.md#troubleshooting`](setup/SETUP_GUIDE.md#troubleshooting) - Common issues
- **Status**: [`current/STATUS.md`](current/STATUS.md) - Known limitations and fixes

## ⚠️ Important Notes

### Documentation Accuracy Promise
All documentation in `current/` reflects the **actual implementation** as of the last update date. No aspirational features or unimplemented functionality.

### What's Different From Old Docs
The original documentation described a multi-provider AI debate system that wasn't actually implemented. The reorganized docs clearly separate:

- **What works now**: Mattermost + Claude integration with two personas
- **What's planned**: Multi-provider AI debates with specialized models

### File Migration Status

| Old Location | New Location | Status |
|-------------|-------------|--------|
| `README.md` | `archive/old-README.md` + `current/README.md` | ✅ Reorganized |
| `docs/STATUS.md` | `archive/old-status.md` + `current/STATUS.md` | ✅ Updated |
| `multi_model_debate_spec.md` | `archive/old-specs/` + `roadmap/FUTURE_VISION.md` | ✅ Separated |
| `docs/MCP_INTEGRATION_GUIDE.md` | `current/TECHNICAL_REFERENCE.md` | ✅ Updated |

## 🔄 Documentation Updates

**Last Major Reorganization**: 2025-09-13
**Validation Status**: All MCP tools tested and working
**Next Review**: When new features are implemented

### How to Keep Docs Current

1. **Implementation changes**: Update `current/` files immediately
2. **New features**: Add to `current/`, move old plans to `archive/`
3. **Vision changes**: Update `roadmap/FUTURE_VISION.md`
4. **Setup changes**: Update `setup/SETUP_GUIDE.md`

### Documentation Standards

- **Accuracy First**: Never document unimplemented features in `current/`
- **Clear Separation**: Current reality vs. future plans
- **User Focus**: Write for people trying to use the system
- **Example Heavy**: Show actual usage, not just theory

---

## 📞 Need Help?

- **Setup Issues**: See [`setup/SETUP_GUIDE.md#troubleshooting`](setup/SETUP_GUIDE.md#troubleshooting)
- **System Status**: Check [`current/STATUS.md`](current/STATUS.md)
- **Feature Requests**: See [`roadmap/FUTURE_VISION.md`](roadmap/FUTURE_VISION.md) for planned features
- **Bug Reports**: Include relevant logs and configuration details

**Remember**: This documentation describes a working system, not a prototype. If something is documented in `current/`, it should work as described.