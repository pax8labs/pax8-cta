#!/bin/bash
# Simple test script for MCP server

echo "Testing AgentSync MCP Server..."
echo ""
echo "Starting server (press Ctrl+C to stop)"
echo ""

cd "$(dirname "$0")"
AGENTSYNC_API_URL="http://localhost:3000" node dist/index.js
