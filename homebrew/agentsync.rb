# Homebrew Formula for AgentSync CLI
#
# This file is intentionally kept as a placeholder until an official Homebrew
# tap and release checksum publication process are in place.

class Agentsync < Formula
  desc "Sync your Copilot Studio agents to all your tenants"
  homepage "https://github.com/pax8labs/agentsync"
  version "0.1.0"
  license "Apache-2.0"

  disable! date: "2026-03-31", because: "official Homebrew tap is not published yet"

  def install
    odie <<~EOS
      Homebrew installation is not available yet.
      Install using:
        curl -fsSL https://raw.githubusercontent.com/pax8labs/agentsync/main/install.sh | bash
      or download binaries from:
        https://github.com/pax8labs/agentsync/releases
    EOS
  end

  test do
    assert_match "AgentSync", "AgentSync CLI"
  end
end
