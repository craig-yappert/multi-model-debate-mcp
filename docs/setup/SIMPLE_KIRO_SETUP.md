# Simple Kiro MCP Setup - No Cognitive Overload

## What We're Doing
Getting Kiro connected to your Mattermost so we can test the peer conversation model in real chat.

## Prerequisites (Check These First)
- [ ] Mattermost is running and accessible
- [ ] You have the MCP server code in `src/mcp_server.py`
- [ ] Python environment is set up
- [ ] You have Anthropic API key

## Step 1: Test the MCP Server (5 minutes)
```bash
# Navigate to your project directory
cd multi-model-debate

# Run the test script to make sure everything works
python test_mcp_connection.py
```

**Expected output:** Should see "Connection successful" and tool listings.

**If it fails:** Check your `.env` file has the right API keys.

## Step 2: Configure Kiro in Your IDE (2 minutes)
Add this to your Kiro MCP configuration:

```json
{
  "mcpServers": {
    "multi-model-debate": {
      "command": "python",
      "args": ["src/mcp_server.py"],
      "cwd": "C:/path/to/your/multi-model-debate",
      "env": {
        "PYTHONUNBUFFERED": "1"
      },
      "disabled": false,
      "autoApprove": ["contribute", "read_discussion"]
    }
  }
}
```

**Replace:** `C:/path/to/your/multi-model-debate` with your actual project path.

## Step 3: Test the Connection (1 minute)
In Kiro, try using the MCP tools:
- Look for "multi-model-debate" in your MCP servers list
- Try calling the `read_discussion` tool
- Should see recent Mattermost messages

## Step 4: Test Kiro Posting (1 minute)
Use the `contribute` tool with:
```json
{
  "message": "Kiro is now connected and ready to collaborate!",
  "persona": "kiro"
}
```

**Expected result:** Message appears in your Mattermost channel as "Kiro".

## That's It!
If all 4 steps work, Kiro is connected and we can start testing the peer conversation model.

## If Something Breaks
1. **MCP server won't start:** Check Python path and dependencies
2. **Can't connect to Mattermost:** Verify `.env` file has correct webhook URL
3. **Kiro tools not showing:** Check the `cwd` path in your MCP config
4. **Messages not posting:** Check Anthropic API key and rate limits

## Next Steps (Once Connected)
1. Test the @mention rules we discussed
2. Try autonomous collaboration with Claude-Research
3. Experiment with the engagement patterns
4. Iterate on the coordination rules based on real usage

## Quick Debug Commands
```bash
# Check if server starts
python src/mcp_server.py

# Test Mattermost connection
python -c "from src.mcp_server import test_mattermost_connection; test_mattermost_connection()"

# Verify environment
python -c "import os; print('ANTHROPIC_API_KEY:', bool(os.getenv('ANTHROPIC_API_KEY')))"
```

**Goal:** Get you from "cognitive overload" to "Kiro is chatting in Mattermost" in under 10 minutes.