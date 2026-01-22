#!/bin/bash
# AgentSync Sandbox Cleanup Script
# Automates daily maintenance of sandbox data to reduce storage and improve performance
#
# Usage:
#   ./scripts/cleanup-sandbox.sh
#
# Schedule via cron (runs daily at 2 AM):
#   0 2 * * * cd /path/to/agentsync && ./scripts/cleanup-sandbox.sh >> /var/log/agentsync-cleanup.log 2>&1
#
# What this script does:
# 1. Clears completed/failed jobs from Redis queue
# 2. Deletes old deployment records (>7 days)
# 3. Removes old audit logs (>30 days)
# 4. Deletes old solution files (>30 days)
# 5. Cleans up old rollback snapshots (>30 days)

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_PATH="${DATABASE_PATH:-./data/agentsync-sandbox.db}"
SNAPSHOT_DIR="${SNAPSHOT_DIR:-./sandbox-data/snapshots}"
SOLUTION_DIR="${SOLUTION_DIR:-./sandbox-data/solutions}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

# Extract Redis host and port
REDIS_HOST=$(echo $REDIS_URL | sed -n 's/.*:\/\/\([^:]*\).*/\1/p')
REDIS_PORT=$(echo $REDIS_URL | sed -n 's/.*:\([0-9]*\).*/\1/p')
REDIS_PORT=${REDIS_PORT:-6379}

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   AgentSync Sandbox Cleanup                              ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Track cleanup stats
total_cleaned=0

# ============================================================================
# 1. Redis Queue Cleanup
# ============================================================================
echo -e "${BLUE}[1/5] Cleaning Redis queues...${NC}"

if command -v redis-cli &> /dev/null; then
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping &> /dev/null; then
        # Count completed jobs before deletion
        completed_count=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --scan --pattern "bull:*:completed" | wc -l)

        # Delete completed jobs
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --scan --pattern "bull:*:completed" | \
            xargs -r redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL > /dev/null 2>&1

        # Keep last 100 failed jobs for debugging, delete older ones
        failed_count=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --scan --pattern "bull:*:failed" | wc -l)
        if [ "$failed_count" -gt 100 ]; then
            delete_count=$((failed_count - 100))
            redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --scan --pattern "bull:*:failed" | \
                head -n "$delete_count" | \
                xargs -r redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL > /dev/null 2>&1
        else
            delete_count=0
        fi

        total_cleaned=$((total_cleaned + completed_count + delete_count))
        echo -e "${GREEN}  ✓ Cleared $completed_count completed jobs${NC}"
        echo -e "${GREEN}  ✓ Cleared $delete_count old failed jobs (kept last 100)${NC}"
    else
        echo -e "${YELLOW}  ⚠ Redis not accessible at $REDIS_HOST:$REDIS_PORT - skipping${NC}"
    fi
else
    echo -e "${YELLOW}  ⚠ redis-cli not installed - skipping${NC}"
fi

echo ""

# ============================================================================
# 2. Database Cleanup
# ============================================================================
echo -e "${BLUE}[2/5] Cleaning database records...${NC}"

if [ -f "$DB_PATH" ]; then
    # Count records before deletion
    old_deployments=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM deployments WHERE created_at < datetime('now', '-7 days');" 2>/dev/null || echo "0")
    old_audit_logs=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM audit_logs WHERE created_at < datetime('now', '-30 days');" 2>/dev/null || echo "0")

    # Delete old deployments (>7 days)
    sqlite3 "$DB_PATH" "DELETE FROM deployments WHERE created_at < datetime('now', '-7 days');" 2>/dev/null || true

    # Delete old audit logs (>30 days)
    sqlite3 "$DB_PATH" "DELETE FROM audit_logs WHERE created_at < datetime('now', '-30 days');" 2>/dev/null || true

    # Delete old rollback snapshots (>30 days)
    old_snapshots=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM rollback_snapshots WHERE created_at < datetime('now', '-30 days');" 2>/dev/null || echo "0")
    sqlite3 "$DB_PATH" "DELETE FROM rollback_snapshots WHERE created_at < datetime('now', '-30 days');" 2>/dev/null || true

    # Vacuum to reclaim space
    db_size_before=$(du -h "$DB_PATH" | cut -f1)
    sqlite3 "$DB_PATH" "VACUUM;" 2>/dev/null || true
    db_size_after=$(du -h "$DB_PATH" | cut -f1)

    total_cleaned=$((total_cleaned + old_deployments + old_audit_logs + old_snapshots))

    echo -e "${GREEN}  ✓ Deleted $old_deployments old deployment records${NC}"
    echo -e "${GREEN}  ✓ Deleted $old_audit_logs old audit logs${NC}"
    echo -e "${GREEN}  ✓ Deleted $old_snapshots old rollback snapshots${NC}"
    echo -e "${GREEN}  ✓ Database size: $db_size_before → $db_size_after${NC}"
else
    echo -e "${YELLOW}  ⚠ Database not found at $DB_PATH - skipping${NC}"
fi

echo ""

# ============================================================================
# 3. Solution Files Cleanup
# ============================================================================
echo -e "${BLUE}[3/5] Cleaning old solution files...${NC}"

if [ -d "$SOLUTION_DIR" ]; then
    # Find and count files older than 30 days
    old_solutions=$(find "$SOLUTION_DIR" -type f -name "*.zip" -mtime +30 2>/dev/null | wc -l)

    # Delete old solution files
    find "$SOLUTION_DIR" -type f -name "*.zip" -mtime +30 -delete 2>/dev/null || true

    total_cleaned=$((total_cleaned + old_solutions))
    echo -e "${GREEN}  ✓ Deleted $old_solutions solution files (>30 days old)${NC}"
else
    echo -e "${YELLOW}  ⚠ Solution directory not found at $SOLUTION_DIR - skipping${NC}"
fi

echo ""

# ============================================================================
# 4. Snapshot Files Cleanup
# ============================================================================
echo -e "${BLUE}[4/5] Cleaning old snapshot files...${NC}"

if [ -d "$SNAPSHOT_DIR" ]; then
    # Find and count files older than 30 days
    old_snapshot_files=$(find "$SNAPSHOT_DIR" -type f -mtime +30 2>/dev/null | wc -l)

    # Delete old snapshot files
    find "$SNAPSHOT_DIR" -type f -mtime +30 -delete 2>/dev/null || true

    # Remove empty directories
    find "$SNAPSHOT_DIR" -type d -empty -delete 2>/dev/null || true

    total_cleaned=$((total_cleaned + old_snapshot_files))
    echo -e "${GREEN}  ✓ Deleted $old_snapshot_files snapshot files (>30 days old)${NC}"
else
    echo -e "${YELLOW}  ⚠ Snapshot directory not found at $SNAPSHOT_DIR - skipping${NC}"
fi

echo ""

# ============================================================================
# 5. Summary
# ============================================================================
echo -e "${BLUE}[5/5] Cleanup Summary${NC}"
echo ""
echo -e "${GREEN}✅ Cleanup complete!${NC}"
echo "   Total items cleaned: $total_cleaned"
echo ""

# Optional: Check disk space
if [ -d "./data" ] || [ -d "./sandbox-data" ]; then
    echo "Current disk usage:"
    du -sh ./data ./sandbox-data 2>/dev/null || true
    echo ""
fi

echo "Next cleanup: $(date -d 'tomorrow 02:00' '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -v +1d '+%Y-%m-%d 02:00:00')"
echo ""

# ============================================================================
# Optional: Power Platform Solution Cleanup
# ============================================================================
# Uncomment this section if you want to delete test solutions from Power Platform
# environments as part of the cleanup process

# echo -e "${BLUE}[Optional] Cleaning Power Platform solutions...${NC}"
# echo -e "${YELLOW}⚠ This will delete test solutions from sandbox environments${NC}"
# echo ""
#
# # Array of test environments
# ENVS=("contoso-sandbox" "fabrikam-sandbox" "adventureworks-sandbox")
#
# for env in "${ENVS[@]}"; do
#     echo "Checking $env..."
#
#     # List solutions and find test solutions (starting with CustomerService or SalesAssistant)
#     if command -v pac &> /dev/null; then
#         pac solution list --environment "https://$env.crm.dynamics.com" --json 2>/dev/null | \
#             jq -r '.[] | select(.uniquename | startswith("CustomerService") or startswith("SalesAssistant")) | .solutionid' | \
#             while read solution_id; do
#                 if [ -n "$solution_id" ]; then
#                     echo "  Deleting solution: $solution_id"
#                     pac solution delete --solution-id "$solution_id" --environment "https://$env.crm.dynamics.com" 2>/dev/null || true
#                 fi
#             done
#     else
#         echo -e "${YELLOW}  ⚠ pac CLI not installed - skipping${NC}"
#     fi
# done
#
# echo -e "${GREEN}✓ Power Platform cleanup complete${NC}"
# echo ""
