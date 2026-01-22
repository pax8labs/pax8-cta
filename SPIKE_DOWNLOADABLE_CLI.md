# Spike: Downloadable CLI Tool for AgentSync

**Date**: 2026-02-02
**Author**: Claude
**Status**: Research Complete

## Executive Summary

AgentSync already has a functional CLI built with Node.js + TypeScript + Commander. This spike explores how to package and distribute it as a **downloadable standalone binary** (like `gh`, `kubectl`, etc.) that doesn't require users to have Node.js installed.

**Recommendation**: Use **Bun's `--compile` flag** for creating standalone binaries + multi-channel distribution (npm, GitHub Releases, Homebrew).

---

## Current State Analysis

### Existing CLI Implementation

Location: `/packages/cli/`

**Commands Available:**
- `agentsync ship` (deploy) - Deploy agents to tenant fleet
- `agentsync track` (status) - Track deployment status with real-time updates
- `agentsync fleet` (tenants) - Manage tenant configurations
- `agentsync export` - Export solutions
- `agentsync import` - Import solutions
- `agentsync resolve-url` - Resolve M365 URLs to solutions

**Technology Stack:**
- **Language**: TypeScript
- **CLI Framework**: Commander.js
- **UI Components**: chalk (colors), ora (spinners), cli-table3 (tables)
- **Features**: Excellent UX with colored output, spinners, tables, watch mode

**Current Distribution**: Only via `pnpm cli` or installing the npm package - requires Node.js runtime

**Strengths:**
- Well-designed command structure with nautical metaphors (ship, fleet, cargo, dock)
- Great UX with colors, progress indicators, and formatted tables
- Integrated with existing @agentsync/core and @agentsync/worker packages
- Already production-ready functionality

**Gaps:**
- Not distributable as standalone binary
- Requires Node.js + pnpm installation
- No Homebrew/Scoop/WinGet installers
- No GitHub Releases with pre-built binaries

---

## Technical Options Evaluated

### Option 1: Bun Compile (RECOMMENDED)

**Tool**: [Bun's `--compile` flag](https://bun.com/docs/bundler/executables)

**Pros:**
- **Native TypeScript support** - No transpilation needed
- **Fast compilation** (~0.1s build time)
- **True standalone executables** - Bundles Bun runtime + all dependencies
- **Cross-platform compilation** - Can build for macOS/Linux/Windows from any platform
- **Mature and actively maintained** - Official Bun feature (v1.2.17+)
- **Small learning curve** - Works with existing Commander.js CLI
- **Active development** - Recent features like `BUN_BE_BUN=1` for advanced use cases

**Cons:**
- Requires Bun runtime for building (but NOT for running the binary)
- Binary size: ~51MB (macOS), ~100MB (Windows)
- Some reported issues with complex npm dependencies (though our CLI uses simple deps)

**Implementation:**
```bash
# Install bun
curl -fsSL https://bun.sh/install | bash

# Build standalone binary
cd packages/cli
bun build --compile ./src/index.ts --outfile agentsync

# Cross-compile for other platforms
bun build --compile --target=bun-darwin-arm64 ./src/index.ts --outfile agentsync-macos-arm64
bun build --compile --target=bun-darwin-x64 ./src/index.ts --outfile agentsync-macos-x64
bun build --compile --target=bun-linux-x64 ./src/index.ts --outfile agentsync-linux-x64
bun build --compile --target=bun-windows-x64 ./src/index.ts --outfile agentsync-windows-x64.exe
```

**Sources:**
- [Single-file executable - Bun](https://bun.com/docs/bundler/executables)
- [Bun Now Supports Cross-Compiling Executable Binaries](https://developer.mamezou-tech.com/en/blogs/2024/05/20/bun-cross-compile/)
- [Creating Standalone Executables with Bun: A Guide](https://codingmall.com/knowledge-base/25-global/24091-bun-bundle-executable)

---

### Option 2: yao-pkg (@yao/pkg)

**Tool**: [@yao/pkg](https://github.com/yao-pkg) (fork of deprecated vercel/pkg)

**Pros:**
- Direct successor to popular vercel/pkg
- Works with existing Node.js code
- Supports Node.js 20+
- Proven track record from vercel/pkg heritage

**Cons:**
- Requires ESM to CommonJS conversion (our CLI uses ESM)
- Less active than Bun
- Community-maintained fork (not official)
- Larger binary sizes than Bun

**Sources:**
- [Pkg Alternatives and Reviews](https://www.libhunt.com/r/pkg)
- [Yet Another Org - Pkg · GitHub](https://github.com/yao-pkg)

---

### Option 3: Node.js Single Executable Applications (SEA)

**Tool**: [Node.js native SEA feature](https://nodejs.org/api/single-executable-applications.html)

**Pros:**
- Official Node.js feature
- No third-party dependencies
- Future-proof

**Cons:**
- **Current limitation**: Only supports CommonJS (our CLI uses ESM)
- Still experimental/maturing
- Complex setup process
- Not ready for production use in 2026

---

### Option 4: Keep npm/npx Only

**Pros:**
- No additional work required
- Works today
- JavaScript ecosystem standard

**Cons:**
- Requires Node.js installation
- Doesn't feel like "native" CLI tools (gh, kubectl, docker)
- Harder for non-JS developers to adopt
- Doesn't meet the "downloadable binary" requirement

---

### Option 5: Rewrite in Go/Rust

**Pros:**
- True native binaries (tiny ~5-10MB)
- Best startup performance
- No runtime dependencies
- Industry standard for CLI tools

**Cons:**
- **Complete rewrite required** - abandon existing working CLI
- Can't reuse @agentsync/core and @agentsync/worker packages
- Significant development time (weeks/months)
- Need Go/Rust expertise
- Maintenance overhead of two codebases

**Comparison Article:**
- [Building Great CLIs in 2025: Node.js vs Go vs Rust | Medium](https://medium.com/@no-non-sense-guy/building-great-clis-in-2025-node-js-vs-go-vs-rust-e8e4bf7ee10e)

---

## Distribution Strategy

### Multi-Channel Approach (RECOMMENDED)

Modern CLIs use **multiple distribution channels** for maximum reach:

#### 1. GitHub Releases (Primary)
Upload pre-compiled binaries for each release:
- `agentsync-macos-arm64` (Apple Silicon)
- `agentsync-macos-x64` (Intel Mac)
- `agentsync-linux-x64`
- `agentsync-windows-x64.exe`

**Automation**: Use GitHub Actions to build and upload on tag push

**Sources:**
- [Distributing your own scripts via Homebrew](https://justin.searls.co/posts/how-to-distribute-your-own-scripts-via-homebrew/)

#### 2. Homebrew (macOS/Linux)
Create a Homebrew formula that downloads from GitHub Releases:

```ruby
# Formula: agentsync.rb
class Agentsync < Formula
  desc "Sync your Copilot Studio agents to all your tenants"
  homepage "https://github.com/yourusername/agentsync"
  version "0.1.0"

  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/yourusername/agentsync/releases/download/v0.1.0/agentsync-macos-arm64"
    sha256 "..." # checksum
  elsif OS.mac?
    url "https://github.com/yourusername/agentsync/releases/download/v0.1.0/agentsync-macos-x64"
    sha256 "..."
  elsif OS.linux?
    url "https://github.com/yourusername/agentsync/releases/download/v0.1.0/agentsync-linux-x64"
    sha256 "..."
  end

  def install
    bin.install "agentsync-macos-arm64" => "agentsync"
  end
end
```

**Installation**: `brew install agentsync`

#### 3. npm/npx (Fallback)
Keep existing npm distribution for users who prefer it:
```bash
npx @agentsync/cli ship --all --solution ./agent.zip
```

#### 4. Scoop (Windows)
Create Scoop manifest for Windows users

#### 5. Direct Download
Provide download links on GitHub/website:
```bash
# macOS/Linux
curl -fsSL https://github.com/yourusername/agentsync/releases/latest/download/agentsync-macos-arm64 -o /usr/local/bin/agentsync
chmod +x /usr/local/bin/agentsync

# Verify
agentsync --version
```

**Sources:**
- [Release | oclif: The Open CLI Framework](https://oclif.io/docs/releasing/)
- [CLI Releases Distribution · Issue #294 · microsoftgraph/msgraph-cli](https://github.com/microsoftgraph/msgraph-cli/issues/294)

---

## Proof of Concept: Bun Compile Approach

### Step 1: Add Bun Build Script

Add to `/packages/cli/package.json`:
```json
{
  "scripts": {
    "build": "tsc",
    "build:binary": "bun build --compile ./src/index.ts --outfile agentsync",
    "build:all": "npm run build:macos-arm64 && npm run build:macos-x64 && npm run build:linux && npm run build:windows",
    "build:macos-arm64": "bun build --compile --target=bun-darwin-arm64 ./src/index.ts --outfile dist/agentsync-macos-arm64",
    "build:macos-x64": "bun build --compile --target=bun-darwin-x64 ./src/index.ts --outfile dist/agentsync-macos-x64",
    "build:linux": "bun build --compile --target=bun-linux-x64 ./src/index.ts --outfile dist/agentsync-linux-x64",
    "build:windows": "bun build --compile --target=bun-windows-x64 ./src/index.ts --outfile dist/agentsync-windows-x64.exe"
  }
}
```

### Step 2: Create GitHub Actions Workflow

Create `.github/workflows/release-cli.yml`:
```yaml
name: Release CLI Binaries

on:
  push:
    tags:
      - 'cli-v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: bun-darwin-arm64
            name: agentsync-macos-arm64
          - os: macos-latest
            target: bun-darwin-x64
            name: agentsync-macos-x64
          - os: ubuntu-latest
            target: bun-linux-x64
            name: agentsync-linux-x64
          - os: windows-latest
            target: bun-windows-x64
            name: agentsync-windows-x64.exe

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install
        working-directory: packages/cli

      - name: Build binary
        run: |
          bun build --compile --target=${{ matrix.target }} ./src/index.ts --outfile ${{ matrix.name }}
        working-directory: packages/cli

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.name }}
          path: packages/cli/${{ matrix.name }}

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Download artifacts
        uses: actions/download-artifact@v4

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            */agentsync-*
          draft: false
          prerelease: false
```

### Step 3: Create Installation Script

Create `install.sh`:
```bash
#!/bin/bash
set -e

# Detect platform
OS=$(uname -s)
ARCH=$(uname -m)

if [ "$OS" = "Darwin" ]; then
  if [ "$ARCH" = "arm64" ]; then
    BINARY="agentsync-macos-arm64"
  else
    BINARY="agentsync-macos-x64"
  fi
elif [ "$OS" = "Linux" ]; then
  BINARY="agentsync-linux-x64"
else
  echo "Unsupported OS: $OS"
  exit 1
fi

echo "Installing AgentSync CLI..."
LATEST_URL="https://github.com/yourusername/agentsync/releases/latest/download/$BINARY"

curl -fsSL "$LATEST_URL" -o /tmp/agentsync
chmod +x /tmp/agentsync
sudo mv /tmp/agentsync /usr/local/bin/agentsync

echo "✓ AgentSync CLI installed successfully!"
echo "Run 'agentsync --help' to get started"
```

**Usage:**
```bash
curl -fsSL https://raw.githubusercontent.com/yourusername/agentsync/main/install.sh | bash
```

### Step 4: Update README

Add installation instructions:
```markdown
## Installation

### Homebrew (macOS/Linux)
\`\`\`bash
brew install agentsync
\`\`\`

### Download Binary (All Platforms)
Download the latest release for your platform:
- [macOS (Apple Silicon)](https://github.com/yourusername/agentsync/releases/latest/download/agentsync-macos-arm64)
- [macOS (Intel)](https://github.com/yourusername/agentsync/releases/latest/download/agentsync-macos-x64)
- [Linux (x64)](https://github.com/yourusername/agentsync/releases/latest/download/agentsync-linux-x64)
- [Windows (x64)](https://github.com/yourusername/agentsync/releases/latest/download/agentsync-windows-x64.exe)

### Quick Install Script (macOS/Linux)
\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/yourusername/agentsync/main/install.sh | bash
\`\`\`

### npm (Alternative)
\`\`\`bash
npm install -g @agentsync/cli
\`\`\`

## Usage
\`\`\`bash
agentsync ship --all --solution ./myagent.zip
agentsync track --shipment dep-123
agentsync fleet
\`\`\`
```

---

## Testing the Binary

```bash
# Build
cd packages/cli
bun install
bun build --compile ./src/index.ts --outfile agentsync

# Test locally
./agentsync --help
./agentsync --version
./agentsync fleet
./agentsync ship --help

# Test on clean system (no Node.js)
scp agentsync user@clean-machine:/tmp/
ssh user@clean-machine
/tmp/agentsync --version  # Should work without Node.js!
```

---

## Implementation Estimate

### Phase 1: POC (1-2 days)
- [ ] Install Bun locally
- [ ] Test `bun build --compile` with existing CLI
- [ ] Verify binary works on different machines
- [ ] Validate all commands work in compiled form

### Phase 2: CI/CD (2-3 days)
- [ ] Create GitHub Actions workflow
- [ ] Test release process with pre-release tags
- [ ] Automate binary uploads to GitHub Releases
- [ ] Add checksums and signatures

### Phase 3: Distribution (3-5 days)
- [ ] Create Homebrew tap repository
- [ ] Write Homebrew formula
- [ ] Create install.sh script
- [ ] Test installation on fresh systems
- [ ] Create Scoop manifest for Windows

### Phase 4: Documentation (1-2 days)
- [ ] Update README with installation instructions
- [ ] Create CONTRIBUTING guide for releases
- [ ] Document binary build process
- [ ] Add troubleshooting guide

**Total Estimate**: 7-12 days for complete implementation

---

## Risks & Mitigations

### Risk 1: Binary Size (~51MB)
**Mitigation**:
- Acceptable for modern systems (Docker images are GBs)
- Comparable to other compiled Node.js tools
- Trade-off for "no Node.js required" UX

### Risk 2: Bun Dependency Issues
**Mitigation**:
- Our CLI uses simple dependencies (commander, chalk, ora)
- Test thoroughly during POC phase
- Fall back to yao-pkg if issues arise

### Risk 3: Cross-Platform Compilation Issues
**Mitigation**:
- Test on actual target platforms (macOS, Linux, Windows)
- Use GitHub Actions with matrix builds
- Maintain npm distribution as fallback

### Risk 4: Adoption Friction
**Mitigation**:
- Keep npm distribution alongside binaries
- Provide multiple installation methods
- Clear documentation for each platform

---

## Decision Matrix

| Criteria | Bun Compile | yao-pkg | Node SEA | Rewrite Go/Rust | npm Only |
|----------|------------|---------|----------|-----------------|----------|
| **Ease of Implementation** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ |
| **Binary Size** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | N/A |
| **Build Speed** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Cross-Platform** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Maintenance** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **User Experience** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **"Downloadable Binary"** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Production Ready** | ✅ | ✅ | ❌ | ✅ | ✅ |

**Winner**: 🏆 **Bun Compile** - Best balance of ease, speed, and UX

---

## Recommendation

### Immediate Next Steps (This Week)

1. **POC Validation** (Day 1-2)
   - Install Bun: `curl -fsSL https://bun.sh/install | bash`
   - Run: `cd packages/cli && bun build --compile ./src/index.ts --outfile agentsync`
   - Test binary: `./agentsync --help`
   - Verify commands work: `./agentsync fleet`, `./agentsync ship --help`
   - Test on machine without Node.js installed

2. **Build All Platforms** (Day 2-3)
   - Cross-compile for all targets
   - Test each binary (ideally on native platforms)
   - Measure binary sizes
   - Document any issues

3. **Go/No-Go Decision** (Day 3)
   - If POC successful → Proceed with full implementation
   - If blockers found → Re-evaluate with yao-pkg or Go rewrite

### Full Implementation (If POC Successful)

Follow the phases outlined in "Implementation Estimate" section above.

### Long-Term Strategy

- **Primary**: Bun-compiled binaries via GitHub Releases + Homebrew
- **Fallback**: npm/npx for users who prefer it
- **Future**: Consider Go/Rust rewrite if:
  - Binary size becomes critical (need <10MB)
  - Bun compilation issues arise
  - Need tighter integration with Dataverse SDK (if rewritten in Go)

---

## Additional Resources

### Bun Documentation
- [Single-file executable - Bun](https://bun.com/docs/bundler/executables)
- [Compile to Executable | Bunup](https://bunup.dev/docs/advanced/compile.html)

### Distribution Guides
- [Distributing your own scripts via Homebrew](https://justin.searls.co/posts/how-to-distribute-your-own-scripts-via-homebrew/)
- [Release | oclif: The Open CLI Framework](https://oclif.io/docs/releasing/)

### Alternatives Research
- [Pkg Alternatives and Reviews](https://www.libhunt.com/r/pkg)
- [Building Great CLIs in 2025: Node.js vs Go vs Rust | Medium](https://medium.com/@no-non-sense-guy/building-great-clis-in-2025-node-js-vs-go-vs-rust-e8e4bf7ee10e)

---

## Conclusion

AgentSync already has a well-designed, functional CLI. The missing piece is **packaging and distribution** as a standalone binary.

**Bun's `--compile` flag** is the fastest path to achieving a "downloadable CLI tool" experience:
- Minimal changes to existing code
- Fast build times
- True standalone executables
- Good cross-platform support
- Easy CI/CD integration

Combined with a **multi-channel distribution strategy** (GitHub Releases, Homebrew, npm), AgentSync CLI can be as easy to install as `gh`, `kubectl`, or `docker`.

**Next Action**: Run POC (1-2 days) to validate Bun compilation works with our CLI before committing to full implementation.
