#!/bin/bash
# AgentSync sandbox cleanup script (CLI-only)

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SNAPSHOT_DIR="${SNAPSHOT_DIR:-./sandbox-data/snapshots}"
SOLUTION_DIR="${SOLUTIONS_DIR:-./sandbox-data/solutions}"
LOG_DIR="${LOG_DIR:-./logs}"

echo ""
echo -e "${BLUE}AgentSync Sandbox Cleanup${NC}"
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"

total_cleaned=0

cleanup_dir() {
  local path="$1"
  local pattern="$2"
  local days="$3"
  local label="$4"

  if [ -d "$path" ]; then
    local count
    count=$(find "$path" -type f -name "$pattern" -mtime +"$days" 2>/dev/null | wc -l)
    find "$path" -type f -name "$pattern" -mtime +"$days" -delete 2>/dev/null || true
    find "$path" -type d -empty -delete 2>/dev/null || true
    total_cleaned=$((total_cleaned + count))
    echo -e "${GREEN}  ✓ Deleted $count $label${NC}"
  else
    echo -e "${YELLOW}  ⚠ Directory not found: $path${NC}"
  fi
}

echo -e "${BLUE}[1/3] Cleaning old solution packages...${NC}"
cleanup_dir "$SOLUTION_DIR" "*.zip" 30 "solution files (>30 days)"

echo -e "${BLUE}[2/3] Cleaning old snapshots...${NC}"
cleanup_dir "$SNAPSHOT_DIR" "*" 30 "snapshot files (>30 days)"

echo -e "${BLUE}[3/3] Cleaning old logs...${NC}"
cleanup_dir "$LOG_DIR" "*.log" 14 "log files (>14 days)"

echo ""
echo -e "${GREEN}Cleanup complete${NC}"
echo "Total items deleted: $total_cleaned"
