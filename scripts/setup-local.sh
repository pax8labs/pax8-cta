#!/bin/bash
# Local development setup without Docker
#
# This script sets up Pax8 CTA for local development
# without requiring Docker or any background services.

set -e

echo "=== Pax8 CTA - Local Setup ==="
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
echo "3. Run the CLI in demo mode or watch builds:"
echo ""
echo "   # Start the CLI"
echo "   pnpm --filter pax8-cta start -- tenants list"
echo ""
echo "   # Or keep a CLI build watch running"
echo "   pnpm --filter pax8-cta dev"
