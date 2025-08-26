FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY simple_bridge.py .
COPY .env .

# Create a health check script
RUN echo '#!/bin/bash\ncurl -f http://mattermost:8065 || exit 1' > /app/healthcheck.sh && \
    chmod +x /app/healthcheck.sh

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /app/healthcheck.sh

# Wait for Mattermost to be ready, then start the bridge
CMD python -u simple_bridge.py