#!/bin/bash
set -e

# AgentSync CLI Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/pax8labs/agentsync/main/install.sh | bash

REPO="pax8labs/agentsync"
VERSION="latest"
INSTALL_DIR="${PAX8_CTA_INSTALL_DIR:-/usr/local/bin}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect platform
OS=$(uname -s)
ARCH=$(uname -m)

echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    AgentSync CLI Installer           ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# Determine binary name
if [ "$OS" = "Darwin" ]; then
  if [ "$ARCH" = "arm64" ]; then
    BINARY="agentsync-macos-arm64"
    echo -e "${GREEN}✓${NC} Platform: macOS (Apple Silicon)"
  elif [ "$ARCH" = "x86_64" ]; then
    BINARY="agentsync-macos-x64"
    echo -e "${GREEN}✓${NC} Platform: macOS (Intel)"
  else
    echo -e "${RED}✗${NC} Unsupported macOS architecture: $ARCH"
    exit 1
  fi
elif [ "$OS" = "Linux" ]; then
  if [ "$ARCH" = "x86_64" ]; then
    BINARY="agentsync-linux-x64"
    echo -e "${GREEN}✓${NC} Platform: Linux (x64)"
  elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    BINARY="agentsync-linux-arm64"
    echo -e "${GREEN}✓${NC} Platform: Linux (ARM64)"
  else
    echo -e "${RED}✗${NC} Unsupported Linux architecture: $ARCH"
    exit 1
  fi
else
  echo -e "${RED}✗${NC} Unsupported operating system: $OS"
  echo -e "${YELLOW}→${NC} For Windows, download from: https://github.com/$REPO/releases"
  exit 1
fi

# Get latest version if not specified
if [ "$VERSION" = "latest" ]; then
  echo -e "${BLUE}→${NC} Fetching latest version..."
  VERSION=$(curl -sSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
  if [ -z "$VERSION" ]; then
    echo -e "${RED}✗${NC} Failed to fetch latest version"
    exit 1
  fi
  echo -e "${GREEN}✓${NC} Latest version: $VERSION"
fi

# Download URL
DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/$BINARY"
CHECKSUM_URL="https://github.com/$REPO/releases/download/$VERSION/$BINARY.sha256"

# Create temporary directory
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

echo -e "${BLUE}→${NC} Downloading AgentSync CLI..."
if ! curl -fsSL "$DOWNLOAD_URL" -o "$TMP_DIR/agentsync"; then
  echo -e "${RED}✗${NC} Failed to download binary"
  echo -e "${YELLOW}→${NC} URL: $DOWNLOAD_URL"
  exit 1
fi
echo -e "${GREEN}✓${NC} Downloaded successfully"

# Download and verify checksum
echo -e "${BLUE}→${NC} Verifying checksum..."
if curl -fsSL "$CHECKSUM_URL" -o "$TMP_DIR/agentsync.sha256" 2>/dev/null; then
  cd "$TMP_DIR"
  if command -v sha256sum &> /dev/null; then
    if ! sha256sum -c agentsync.sha256 &> /dev/null; then
      echo -e "${RED}✗${NC} Checksum verification failed"
      exit 1
    fi
  elif command -v shasum &> /dev/null; then
    if ! shasum -a 256 -c agentsync.sha256 &> /dev/null; then
      echo -e "${RED}✗${NC} Checksum verification failed"
      exit 1
    fi
  else
    echo -e "${YELLOW}⚠${NC}  sha256sum not found, skipping checksum verification"
  fi
  cd - > /dev/null
  echo -e "${GREEN}✓${NC} Checksum verified"
else
  echo -e "${YELLOW}⚠${NC}  Checksum not available, skipping verification"
fi

# Make executable
chmod +x "$TMP_DIR/agentsync"

# Install
echo -e "${BLUE}→${NC} Installing to $INSTALL_DIR..."

# Check if we need sudo
if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP_DIR/agentsync" "$INSTALL_DIR/agentsync"
else
  echo -e "${YELLOW}→${NC} Requesting sudo permissions to install to $INSTALL_DIR"
  sudo mv "$TMP_DIR/agentsync" "$INSTALL_DIR/agentsync"
fi

echo -e "${GREEN}✓${NC} Installed successfully"
echo ""

# Verify installation
if command -v agentsync &> /dev/null; then
  INSTALLED_VERSION=$(agentsync --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║   Installation Complete!              ║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${BLUE}Version:${NC} $INSTALLED_VERSION"
  echo -e "${BLUE}Location:${NC} $(which agentsync)"
  echo ""
  echo -e "${BLUE}Get Started:${NC}"
  echo -e "  agentsync --help"
  echo -e "  agentsync tenants list"
  echo -e "  agentsync deploy --help"
else
  echo -e "${YELLOW}⚠${NC}  Installation succeeded but 'agentsync' not found in PATH"
  echo -e "${YELLOW}→${NC} Add $INSTALL_DIR to your PATH:"
  echo -e "  export PATH=\"$INSTALL_DIR:\$PATH\""
fi

echo ""
echo -e "${BLUE}Documentation:${NC} https://github.com/$REPO"
echo -e "${BLUE}Issues:${NC} https://github.com/$REPO/issues"
