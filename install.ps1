# AgentSync CLI Installation Script for Windows
# Usage: irm https://raw.githubusercontent.com/pax8labs/agentsync/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo = "pax8labs/agentsync"
$Version = "latest"
$InstallDir = if ($env:AGENTSYNC_INSTALL_DIR) { $env:AGENTSYNC_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "agentsync" }

# --- Banner ---
Write-Host ""
Write-Host "+===========================================+" -ForegroundColor Blue
Write-Host "|    AgentSync CLI Installer (Windows)      |" -ForegroundColor Blue
Write-Host "+===========================================+" -ForegroundColor Blue
Write-Host ""

# --- Detect Architecture ---
$Arch = $env:PROCESSOR_ARCHITECTURE
if ($Arch -eq "AMD64" -or $Arch -eq "x86_64") {
    $Binary = "agentsync-windows-x64.exe"
    Write-Host "[+] Platform: Windows (x64)" -ForegroundColor Green
} else {
    Write-Host "[x] Unsupported architecture: $Arch" -ForegroundColor Red
    Write-Host "    Only x64 Windows binaries are available at this time." -ForegroundColor Yellow
    exit 1
}

# --- Fetch Latest Version ---
if ($Version -eq "latest") {
    Write-Host "[>] Fetching latest version..." -ForegroundColor Blue
    try {
        $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -UseBasicParsing
        $Version = $Release.tag_name
        if (-not $Version) {
            throw "tag_name not found in response"
        }
        Write-Host "[+] Latest version: $Version" -ForegroundColor Green
    } catch {
        Write-Host "[x] Failed to fetch latest version: $_" -ForegroundColor Red
        exit 1
    }
}

# --- Download Binary ---
$DownloadUrl = "https://github.com/$Repo/releases/download/$Version/$Binary"
$ChecksumUrl = "https://github.com/$Repo/releases/download/$Version/$Binary.sha256"
$TmpDir = Join-Path $env:TEMP "agentsync-install-$(Get-Random)"
$TmpBinary = Join-Path $TmpDir "agentsync.exe"
$TmpChecksum = Join-Path $TmpDir "agentsync.exe.sha256"

try {
    New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

    Write-Host "[>] Downloading AgentSync CLI..." -ForegroundColor Blue
    try {
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $TmpBinary -UseBasicParsing
        Write-Host "[+] Downloaded successfully" -ForegroundColor Green
    } catch {
        Write-Host "[x] Failed to download binary" -ForegroundColor Red
        Write-Host "    URL: $DownloadUrl" -ForegroundColor Yellow
        exit 1
    }

    # --- Verify Checksum ---
    Write-Host "[>] Verifying checksum..." -ForegroundColor Blue
    try {
        Invoke-WebRequest -Uri $ChecksumUrl -OutFile $TmpChecksum -UseBasicParsing
        $ExpectedHash = (Get-Content $TmpChecksum -Raw).Trim().Split(" ")[0].ToUpper()
        $ActualHash = (Get-FileHash -Path $TmpBinary -Algorithm SHA256).Hash.ToUpper()
        if ($ExpectedHash -ne $ActualHash) {
            Write-Host "[x] Checksum verification failed" -ForegroundColor Red
            Write-Host "    Expected: $ExpectedHash" -ForegroundColor Yellow
            Write-Host "    Actual:   $ActualHash" -ForegroundColor Yellow
            exit 1
        }
        Write-Host "[+] Checksum verified" -ForegroundColor Green
    } catch [System.Net.WebException] {
        Write-Host "[!] Checksum not available, skipping verification" -ForegroundColor Yellow
    } catch {
        Write-Host "[!] Could not verify checksum: $_" -ForegroundColor Yellow
    }

    # --- Install ---
    Write-Host "[>] Installing to $InstallDir..." -ForegroundColor Blue

    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    $DestPath = Join-Path $InstallDir "agentsync.exe"
    Copy-Item -Path $TmpBinary -Destination $DestPath -Force

    Write-Host "[+] Installed successfully" -ForegroundColor Green
    Write-Host ""

    # --- Add to PATH ---
    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($UserPath -split ";" | Where-Object { $_ -eq $InstallDir }) {
        Write-Host "[+] $InstallDir is already in your PATH" -ForegroundColor Green
    } else {
        Write-Host "[>] Adding $InstallDir to your user PATH..." -ForegroundColor Blue
        [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
        $env:Path = "$env:Path;$InstallDir"
        Write-Host "[+] Added to PATH (restart your terminal for this to take effect in new sessions)" -ForegroundColor Green
    }

    Write-Host ""

    # --- Verify Installation ---
    try {
        $InstalledVersion = & $DestPath --version 2>&1
        $VersionMatch = [regex]::Match($InstalledVersion, '\d+\.\d+\.\d+')

        Write-Host "+===========================================+" -ForegroundColor Green
        Write-Host "|   Installation Complete!                  |" -ForegroundColor Green
        Write-Host "+===========================================+" -ForegroundColor Green
        Write-Host ""
        if ($VersionMatch.Success) {
            Write-Host "Version:  $($VersionMatch.Value)" -ForegroundColor Blue
        }
        Write-Host "Location: $DestPath" -ForegroundColor Blue
        Write-Host ""
        Write-Host "Get Started:" -ForegroundColor Blue
        Write-Host "  agentsync --help"
        Write-Host "  agentsync tenants list"
        Write-Host "  agentsync deploy --help"
    } catch {
        Write-Host "[!] Installation succeeded but could not verify binary" -ForegroundColor Yellow
        Write-Host "    Try running: $DestPath --help" -ForegroundColor Yellow
    }

} finally {
    # --- Cleanup ---
    if (Test-Path $TmpDir) {
        Remove-Item -Path $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "Documentation: https://github.com/$Repo" -ForegroundColor Blue
Write-Host "Issues:        https://github.com/$Repo/issues" -ForegroundColor Blue
Write-Host ""
