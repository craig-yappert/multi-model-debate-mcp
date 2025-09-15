# Multi-Model AI Collaboration - VS Code Extension

Bring `@claude-research` and `@kiro` AI personas directly into your VS Code workflow with full code context awareness.

## Features

### 🧠 AI Chat Participants
- **@claude-research**: Deep analytical thinking and strategic perspective on your code
- **@kiro**: Practical execution focus with implementation reality checks

### 🔍 Rich Context Awareness
- Current file content and selected text
- Active debugging sessions and breakpoints
- Real-time error diagnostics and warnings
- Git branch status and recent commits
- Terminal output and workspace state

### 💬 Intelligent Conversations
- Workspace-scoped conversation persistence
- Context-aware AI responses based on actual code
- Command suggestion and execution capabilities
- Conversation history and search

### ⚡ Command Line Integration
- AI personas can suggest terminal commands
- Safe command execution with risk assessment
- Copy commands to terminal or execute directly
- Command history and result tracking

## Quick Start

### Prerequisites
- VS Code 1.74.0 or later
- Python 3.10+ installed
- Your existing MCP server (`src/mcp_server.py`)

### Installation & Setup

1. **Install Dependencies**
   ```bash
   cd vscode-extension
   npm install
   ```

2. **Compile TypeScript**
   ```bash
   npm run compile
   ```

3. **Open in VS Code**
   ```bash
   code .
   ```

4. **Run Extension (F5)**
   - Press F5 to launch Extension Development Host
   - Or use "Run Extension" from Run and Debug panel

5. **Test the Extension**
   - Open any code file in the Extension Development Host
   - Open VS Code Chat panel (Ctrl+Alt+I)
   - Try: `@claude-research what do you think about this function?`
   - Try: `@kiro how can I improve this code?`

## Configuration

Access settings via `File > Preferences > Settings > Extensions > Multi-Model AI Collaboration`

### Key Settings

- **MCP Server Path**: Path to your `mcp_server.py` file (default: `./src/mcp_server.py`)
- **Context Gathering**: Enable/disable rich context collection (default: enabled)
- **Max Context Size**: Maximum characters to include in context (default: 8000)
- **Command Line Access**: Allow AI to suggest commands (default: enabled)
- **Mattermost Fallback**: Use Mattermost when MCP server unavailable (default: enabled)

## Usage Examples

### Code Analysis
```
@claude-research analyze this authentication function

AI sees:
- Your auth.js file content
- Current cursor position at line 45
- ESLint errors about unused variables
- Git branch: feature/auth-improvements
- Test failures in terminal
```

### Debugging Help
```
@kiro this test is failing

AI sees:
- Active debugging session
- Breakpoints and variables
- Test output in terminal
- File context where test is failing
```

### Command Suggestions
AI responses may include executable commands:
```
🔧 Kiro suggests: "Run npm test to see the actual failure"
[▶️ Run: npm test] [Copy to Terminal]
```

## Commands

- `Multi-Model Debate: Test MCP Server Connection` - Verify MCP server connectivity
- `Multi-Model Debate: Show AI Conversation History` - View workspace conversation log
- `Multi-Model Debate: Clear AI Conversation History` - Reset conversation storage

## How It Works

### Architecture
```
VS Code Extension → MCP Server → Claude API
     ↑                 ↑            ↑
Rich Context      90% Reused    Enhanced
Collection       Architecture   Prompts
```

### Context Flow
1. **You ask a question** in VS Code Chat
2. **Extension gathers context**: current file, errors, git state, debugging info
3. **MCP server processes** request with full context awareness
4. **AI personas respond** with code-specific insights
5. **Conversation saved** to workspace for future reference

### Personas

**@claude-research** 🧠
- Deep code analysis and architectural insights
- Considers long-term implications and best practices
- Asks probing questions about design decisions
- Suggests refactoring and optimization opportunities

**@kiro** 🔧
- Practical implementation advice
- Reality checks on timelines and complexity
- Focus on "good enough" solutions that work
- Emphasizes getting things done efficiently

## Development

### Project Structure
```
vscode-extension/
├── src/
│   ├── extension.ts              # Main extension entry
│   ├── chat/
│   │   ├── participants.ts       # Chat participant handlers
│   │   ├── context-analyzer.ts   # VS Code context gathering
│   │   └── command-line-manager.ts # Command execution
│   ├── mcp/
│   │   └── client.ts             # MCP server connection
│   └── storage/
│       └── conversation-store.ts # Workspace conversation storage
├── package.json                  # Extension manifest
└── tsconfig.json                # TypeScript configuration
```

### Build Commands
- `npm run compile` - Compile TypeScript
- `npm run watch` - Watch and compile on changes
- `F5` in VS Code - Run extension in development

## Troubleshooting

### MCP Server Not Connecting
1. Verify `src/mcp_server.py` path in settings
2. Check Python is installed and accessible
3. Ensure MCP server dependencies are installed
4. Use "Test MCP Server Connection" command

### AI Not Responding
1. Check MCP server is running (should start automatically)
2. Verify ANTHROPIC_API_KEY is set in your .env file
3. Check VS Code Output panel for error messages
4. Try using Mattermost fallback if configured

### Command Execution Issues
1. Verify "Command Line Access" is enabled in settings
2. Commands require user confirmation for safety
3. High-risk commands will show warning dialogs
4. Use "Copy to Terminal" if execution fails

## Fallback to Mattermost

If MCP server is unavailable, the extension can fallback to suggesting Mattermost chat:

```
⚠️ I'm having trouble connecting to the AI service right now.
You can try using the Mattermost chat as a fallback, or check
the MCP server connection.
```

This ensures continuity while troubleshooting connection issues.

## Packaging & Installation (No Dev Host)

If you prefer to install/update like a normal VS Code extension without extra windows:

### Local Install via VSIX

1. Build the extension

   ```bash
   npm install
   npm run compile
   npm run package
   ```

   This produces a file like `multi-model-debate-vscode-0.1.0.vsix`.

2. Install the VSIX in VS Code

   - Open the Command Palette and run: `Extensions: Install from VSIX...`
   - Select the generated `.vsix` file

3. Update later

   - Re-run `npm run package`
   - Use `Extensions: Install from VSIX...` again to update

### Marketplace Publishing (Optional)

To publish updates via the standard Extensions interface:

1. Create a publisher (one-time)

   - Install vsce: `npm i -g @vscode/vsce` (or use the devDependency script)
   - Create a publisher at <https://aka.ms/vscode-create-publisher>
   - Add `publisher` in `package.json` (already set to `multi-model-debate`)

2. Publish a new version

   ```bash
   npm version patch   # or minor/major
   npm run publish     # runs vsce publish
   ```

3. Users install/update normally

   - Search the Marketplace by extension name
   - Receive updates automatically according to VS Code settings

Notes:

- Ensure `engines.vscode` matches the minimum VS Code version you support
- Keep `CHANGELOG.md` updated for Marketplace listing quality
- Respect semantic versioning before publishing

## Privacy & Data

- **Conversations stored locally** in VS Code workspace
- **Code context sent to Claude API** only for active requests
- **No data leaves your workspace** except for AI API calls
- **History can be cleared** anytime via command palette

## Contributing

This extension reuses 90% of the existing MCP server architecture from the main multi-model-debate project. Improvements to AI personas and conversation logic should be made in the main `src/mcp_server.py` file.

## Support

- Check the main project documentation in `docs/`
- Test MCP server connection independently
- Review VS Code Output panel for detailed error messages
- Use Mattermost fallback for continued productivity during issues
