@echo off
echo ================================
echo Multi-Model Debate System Startup
echo ================================
echo.
echo This will start:
echo - PostgreSQL database
echo - Mattermost server
echo - AI Bridge (Claude-Research + Kiro)
echo.
echo Make sure your .env file has:
echo - ANTHROPIC_API_KEY
echo - CLAUDE_RESEARCH_BOT_TOKEN  
echo - KIRO_BOT_TOKEN
echo.

REM Check if .env exists
if not exist .env (
    echo ERROR: .env file not found!
    echo Please create .env file with your API keys and bot tokens
    pause
    exit /b 1
)

echo Starting all services...
docker-compose up --build -d

echo.
echo ================================
echo System Status
echo ================================

REM Wait a moment for containers to start
timeout /t 5 /nobreak >nul

docker-compose ps

echo.
echo ================================
echo Next Steps
echo ================================
echo 1. Wait ~60 seconds for Mattermost to fully initialize
echo 2. Open http://localhost:8065 in your browser
echo 3. Go to Zeeba Consulting team -> Multi-Model channel
echo 4. Post a message and watch both AIs respond!
echo.
echo To stop: docker-compose down
echo To view logs: docker-compose logs -f ai_bridge
echo.

pause