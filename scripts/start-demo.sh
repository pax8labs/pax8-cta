#!/bin/bash
# Start AgentSync in demo mode for recording

set -e

echo "🎬 Starting AgentSync Demo Environment..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running from project root
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from agentsync project root"
    echo "   Run: cd /path/to/agentsync && ./scripts/start-demo.sh"
    exit 1
fi

# 1. Check dependencies
echo -e "${BLUE}1. Checking dependencies...${NC}"
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm not found. Install with: npm install -g pnpm"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install from: https://nodejs.org"
    exit 1
fi

echo "   ✓ pnpm found"
echo "   ✓ Node.js found"
echo ""

# 2. Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}2. Installing dependencies...${NC}"
    pnpm install
else
    echo -e "${BLUE}2. Dependencies already installed${NC}"
fi
echo ""

# 3. Build packages if needed
if [ ! -d "packages/core/dist" ] || [ ! -d "packages/web/.next" ]; then
    echo -e "${BLUE}3. Building packages...${NC}"
    pnpm build
else
    echo -e "${BLUE}3. Packages already built${NC}"
fi
echo ""

# 4. Setup demo environment variables
echo -e "${BLUE}4. Setting up demo environment...${NC}"

export DEMO_MODE=true
export NEXTAUTH_SECRET=demo-secret-for-local-testing-only
export NEXTAUTH_URL=http://localhost:3000
export NODE_ENV=development
export LOG_LEVEL=info

# Optional: Start Redis if using Docker
if command -v docker &> /dev/null; then
    if docker ps | grep -q agentsync-demo-redis; then
        echo "   ✓ Redis already running"
    else
        echo "   Starting Redis container..."
        docker run -d \
            --name agentsync-demo-redis \
            -p 6379:6379 \
            --rm \
            redis:7-alpine > /dev/null 2>&1 || true
        sleep 2
        echo "   ✓ Redis started"
    fi
    export REDIS_URL=redis://localhost:6379
fi

echo ""

# 5. Start the web app
echo -e "${GREEN}5. Starting web application...${NC}"
echo ""
echo -e "${YELLOW}================================================${NC}"
echo -e "${YELLOW}   Demo Environment Ready!${NC}"
echo -e "${YELLOW}================================================${NC}"
echo ""
echo -e "  📱 Web Dashboard: ${GREEN}http://localhost:3000${NC}"
echo -e "  🔐 Auth: ${GREEN}Demo mode (no login required)${NC}"
echo -e "  📊 Demo Data: ${GREEN}Pre-loaded${NC}"
echo ""
echo -e "${YELLOW}Recording Tips:${NC}"
echo "  • Clear browser cache for faster loads"
echo "  • Use Incognito/Private mode for clean session"
echo "  • Browser zoom: 100% or 110%"
echo "  • Screen resolution: 1920x1080 or 1280x720"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""
echo "Starting in 3 seconds..."
sleep 1
echo "2..."
sleep 1
echo "1..."
sleep 1

# Start the web app (this will block)
cd packages/web
DEMO_MODE=true \
NEXTAUTH_SECRET=demo-secret-for-local-testing-only \
NEXTAUTH_URL=http://localhost:3000 \
pnpm start
