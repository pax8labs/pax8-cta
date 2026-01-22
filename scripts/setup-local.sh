#!/bin/bash
# Local development setup without Docker
#
# This script sets up the AgentSync for local development
# without requiring Docker. It installs Redis via your system package manager.

set -e

echo "=== AgentSync - Local Setup ==="
echo ""

# Detect OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     PLATFORM=Linux;;
    Darwin*)    PLATFORM=Mac;;
    MINGW*|CYGWIN*|MSYS*) PLATFORM=Windows;;
    *)          PLATFORM="UNKNOWN";;
esac

echo "Detected platform: $PLATFORM"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo "Please install Node.js 20+ from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "Error: Node.js 20+ is required. Found version: $(node -v)"
    exit 1
fi
echo "Node.js: $(node -v) ✓"

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    npm install -g pnpm
fi
echo "pnpm: $(pnpm -v) ✓"

# Install Redis based on platform
install_redis() {
    case "$PLATFORM" in
        Mac)
            if command -v brew &> /dev/null; then
                echo "Installing Redis via Homebrew..."
                brew install redis
                brew services start redis
            else
                echo "Please install Homebrew first: https://brew.sh"
                echo "Then run: brew install redis && brew services start redis"
                return 1
            fi
            ;;
        Linux)
            if command -v apt-get &> /dev/null; then
                echo "Installing Redis via apt..."
                sudo apt-get update && sudo apt-get install -y redis-server
                sudo systemctl enable redis-server
                sudo systemctl start redis-server
            elif command -v yum &> /dev/null; then
                echo "Installing Redis via yum..."
                sudo yum install -y redis
                sudo systemctl enable redis
                sudo systemctl start redis
            elif command -v dnf &> /dev/null; then
                echo "Installing Redis via dnf..."
                sudo dnf install -y redis
                sudo systemctl enable redis
                sudo systemctl start redis
            else
                echo "Please install Redis manually for your Linux distribution."
                return 1
            fi
            ;;
        Windows)
            echo "On Windows, Redis options include:"
            echo "  1. WSL2 with Redis: wsl --install, then apt install redis-server"
            echo "  2. Memurai (Redis-compatible): https://www.memurai.com/"
            echo "  3. Azure Cache for Redis (cloud)"
            echo ""
            echo "For WSL2, after installing Redis, set REDIS_URL=redis://localhost:6379"
            return 0
            ;;
        *)
            echo "Please install Redis manually for your platform."
            return 1
            ;;
    esac
}

# Check if Redis is running
if command -v redis-cli &> /dev/null && redis-cli ping &> /dev/null; then
    echo "Redis: running ✓"
else
    echo "Redis not detected. Would you like to install it? (y/n)"
    read -r INSTALL_REDIS
    if [ "$INSTALL_REDIS" = "y" ] || [ "$INSTALL_REDIS" = "Y" ]; then
        install_redis
    else
        echo ""
        echo "Skipping Redis installation."
        echo "You can use a cloud Redis instance instead."
        echo "Set REDIS_URL in your .env file."
    fi
fi

echo ""
echo "Installing dependencies..."
pnpm install

echo ""
echo "Building packages..."
pnpm build

echo ""
echo "Setting up environment file..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env file from .env.example"
    echo "Please edit .env with your configuration."
else
    echo ".env already exists"
fi

echo ""
echo "Creating directories..."
mkdir -p logs snapshots config

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit .env with your Azure AD and partner credentials"
echo "2. Create config/tenants.yaml with your tenant configuration"
echo "3. Run the development servers:"
echo ""
echo "   # Terminal 1: Start the web dashboard"
echo "   pnpm --filter @agentsync/web dev"
echo ""
echo "   # Terminal 2: Start the worker"
echo "   pnpm --filter @agentsync/worker dev"
echo ""
echo "   # Or use the CLI directly"
echo "   pnpm --filter @agentsync/cli start -- tenants list"
echo ""
echo "For production, see deploy/ folder for PM2, systemd, or Azure options."
