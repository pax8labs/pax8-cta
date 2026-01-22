# Homebrew Formula for AgentSync CLI
# To publish: Create a tap repository at https://github.com/yourusername/homebrew-agentsync
# Then users can install with: brew install yourusername/agentsync/agentsync

class Agentsync < Formula
  desc "Sync your Copilot Studio agents to all your tenants"
  homepage "https://github.com/yourusername/agentsync"
  version "0.1.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/yourusername/agentsync/releases/download/v0.1.0/agentsync-macos-arm64"
      sha256 "REPLACE_WITH_ACTUAL_SHA256_FOR_MACOS_ARM64"
    else
      url "https://github.com/yourusername/agentsync/releases/download/v0.1.0/agentsync-macos-x64"
      sha256 "REPLACE_WITH_ACTUAL_SHA256_FOR_MACOS_X64"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/yourusername/agentsync/releases/download/v0.1.0/agentsync-linux-arm64"
      sha256 "REPLACE_WITH_ACTUAL_SHA256_FOR_LINUX_ARM64"
    else
      url "https://github.com/yourusername/agentsync/releases/download/v0.1.0/agentsync-linux-x64"
      sha256 "REPLACE_WITH_ACTUAL_SHA256_FOR_LINUX_X64"
    end
  end

  def install
    # The downloaded file will be named based on the URL
    # We need to rename it to just "agentsync"
    if OS.mac?
      if Hardware::CPU.arm?
        bin.install "agentsync-macos-arm64" => "agentsync"
      else
        bin.install "agentsync-macos-x64" => "agentsync"
      end
    elsif OS.linux?
      if Hardware::CPU.arm?
        bin.install "agentsync-linux-arm64" => "agentsync"
      else
        bin.install "agentsync-linux-x64" => "agentsync"
      end
    end
  end

  test do
    assert_match "0.1.0", shell_output("#{bin}/agentsync --version 2>&1")
    assert_match "AgentSync", shell_output("#{bin}/agentsync --help 2>&1")
  end
end
