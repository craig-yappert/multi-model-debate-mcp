@echo off
echo Starting Multi-Model Debate MCP Server in Docker...

REM Check if .env file exists
if not exist .env (
    echo ERROR: .env file not found!
    echo Please copy .env.example to .env and fill in your API keys
    echo.
    pause
    exit /b 1
)

REM Build the Docker image
echo Building Docker image...
docker build -t multi-model-mcp-server .

if %ERRORLEVEL% neq 0 (
    echo ERROR: Docker build failed!
    pause
    exit /b 1
)

REM Start the container
echo Starting MCP Server container...
docker-compose up -d mcp-server

if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to start container!
    pause
    exit /b 1
)

echo.
echo SUCCESS: MCP Server is running in Docker!
echo.
echo Container status:
docker ps | findstr multi-model-mcp-server
echo.
echo To view logs: docker logs -f multi-model-mcp-server
echo To stop: docker-compose down
echo.
pause