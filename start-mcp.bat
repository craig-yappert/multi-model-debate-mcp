@echo off
echo Starting Multi-Model Debate MCP Server
echo =====================================
echo.

REM Check if .env file exists
if not exist .env (
    echo ERROR: .env file not found!
    echo Please copy .env.example to .env and configure:
    echo   - ANTHROPIC_API_KEY
    echo   - CLAUDE_RESEARCH_BOT_TOKEN
    echo   - KIRO_BOT_TOKEN
    echo.
    pause
    exit /b 1
)

REM Activate virtual environment if it exists
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate
)

echo Starting MCP Server...
echo [Press Ctrl+C to stop]
echo.

REM Run the main server entry point
python main.py

echo.
echo MCP Server stopped.
pause