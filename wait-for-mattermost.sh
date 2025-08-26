#!/bin/bash
# Wait for Mattermost to be ready before starting the bridge

echo "Waiting for Mattermost to be ready..."

while ! curl -f http://mattermost:8065/api/v4/system/ping 2>/dev/null; do
    echo "Mattermost not ready, waiting 5 seconds..."
    sleep 5
done

echo "Mattermost is ready! Starting bridge..."
exec python -u simple_bridge.py