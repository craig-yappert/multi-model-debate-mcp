@echo off
echo Starting Mattermost-MCP Bridge...
echo.
echo Make sure you have:
echo 1. Mattermost running (docker-compose up -d)
echo 2. Your Anthropic API key in .env file
echo 3. Python environment activated
echo.

python -m pip install -q -r requirements.txt
python mattermost_bridge.py

pause