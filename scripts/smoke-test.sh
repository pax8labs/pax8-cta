#!/bin/bash
# Pre-deployment smoke test for AgentSync
# Validates critical functionality before sandbox deployment

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default base URL
BASE_URL="${BASE_URL:-http://localhost:3000}"

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_header() {
    echo ""
    echo "======================================"
    echo "$1"
    echo "======================================"
}

print_test() {
    echo "Testing: $1..."
}

print_success() {
    echo -e "${GREEN}✅ PASS:${NC} $1"
    ((TESTS_PASSED++))
}

print_failure() {
    echo -e "${RED}❌ FAIL:${NC} $1"
    ((TESTS_FAILED++))
}

print_warning() {
    echo -e "${YELLOW}⚠️  WARN:${NC} $1"
}

# Test functions
test_liveness() {
    print_test "Liveness endpoint"

    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/health/live")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" -eq 200 ]; then
        status=$(echo "$body" | jq -r '.status')
        if [ "$status" = "alive" ]; then
            print_success "Liveness check passed (HTTP $http_code)"
        else
            print_failure "Liveness returned unexpected status: $status"
            return 1
        fi
    else
        print_failure "Liveness check failed (HTTP $http_code)"
        return 1
    fi
}

test_readiness() {
    print_test "Readiness endpoint"

    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/health/ready")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" -eq 200 ]; then
        status=$(echo "$body" | jq -r '.status')
        if [ "$status" = "ready" ]; then
            print_success "Readiness check passed - all dependencies healthy"

            # Check individual dependencies
            echo "$body" | jq -r '.checks[] | "  - \(.name): \(.status) (\(.latency)ms)"'
        else
            print_failure "System not ready: $status"
            echo "$body" | jq -r '.checks[] | select(.status == "unhealthy") | "  ❌ \(.name): \(.error)"'
            return 1
        fi
    elif [ "$http_code" -eq 503 ]; then
        print_failure "Readiness check failed - dependencies unhealthy (HTTP $http_code)"
        echo "$body" | jq -r '.checks[] | select(.status == "unhealthy") | "  ❌ \(.name): \(.error)"'
        return 1
    else
        print_failure "Readiness check unexpected response (HTTP $http_code)"
        return 1
    fi
}

test_redis_connection() {
    print_test "Redis connectivity"

    if command -v redis-cli &> /dev/null; then
        if redis-cli ping > /dev/null 2>&1; then
            print_success "Redis is reachable"
        else
            print_failure "Cannot connect to Redis"
            return 1
        fi
    else
        print_warning "redis-cli not available, skipping direct Redis test"
    fi
}

test_database() {
    print_test "Database existence"

    db_path="${DATABASE_PATH:-./data/agentsync.db}"

    if [ -f "$db_path" ]; then
        print_success "Database exists at $db_path"

        # Check if writable
        if [ -w "$db_path" ]; then
            print_success "Database is writable"
        else
            print_failure "Database is not writable"
            return 1
        fi
    else
        print_warning "Database doesn't exist yet (will be created on first use)"
    fi
}

test_worker_health() {
    print_test "Worker availability"

    response=$(curl -s "$BASE_URL/api/health/ready")
    worker_status=$(echo "$response" | jq -r '.checks[] | select(.name == "workers") | .status')

    if [ "$worker_status" = "healthy" ]; then
        active_workers=$(echo "$response" | jq -r '.checks[] | select(.name == "workers") | .details.activeWorkers')
        print_success "Workers are active (count: $active_workers)"
    else
        error=$(echo "$response" | jq -r '.checks[] | select(.name == "workers") | .error')
        print_failure "No active workers found: $error"
        print_warning "Ensure START_WORKERS=true and worker process is running"
        return 1
    fi
}

test_environment_config() {
    print_test "Environment configuration"

    if [ "$DEMO_MODE" = "true" ]; then
        print_warning "DEMO_MODE is enabled - authentication is bypassed!"
        print_warning "This should NEVER be used in production"
    else
        print_success "DEMO_MODE is disabled (production mode)"
    fi

    if [ -z "$NEXTAUTH_SECRET" ]; then
        print_failure "NEXTAUTH_SECRET is not set"
        return 1
    elif [ ${#NEXTAUTH_SECRET} -lt 32 ]; then
        print_failure "NEXTAUTH_SECRET is too short (< 32 characters)"
        return 1
    else
        print_success "NEXTAUTH_SECRET is configured (${#NEXTAUTH_SECRET} characters)"
    fi

    if [ -z "$AZURE_AD_CLIENT_ID" ] && [ "$DEMO_MODE" != "true" ]; then
        print_failure "AZURE_AD_CLIENT_ID is not set (required for production)"
        return 1
    fi

    if [ -z "$REDIS_URL" ]; then
        print_warning "REDIS_URL not set, using default (redis://localhost:6379)"
    else
        print_success "REDIS_URL is configured"
    fi
}

test_file_permissions() {
    print_test "File system permissions"

    solutions_dir="${SOLUTIONS_DIR:-./solutions}"
    data_dir="./data"

    for dir in "$solutions_dir" "$data_dir"; do
        if [ -d "$dir" ]; then
            if [ -w "$dir" ]; then
                print_success "Directory $dir is writable"
            else
                print_failure "Directory $dir is not writable"
                return 1
            fi
        else
            print_warning "Directory $dir doesn't exist (will be created on first use)"
        fi
    done
}

test_api_response() {
    print_test "API responsiveness"

    response=$(curl -s -w "\n%{http_code}" -o /dev/null "$BASE_URL/api/health/live")
    http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" -eq 200 ]; then
        print_success "API is responding"
    else
        print_failure "API is not responding correctly (HTTP $http_code)"
        return 1
    fi
}

# Main execution
main() {
    print_header "AgentSync Pre-Deployment Smoke Test"
    echo "Testing: $BASE_URL"
    echo "Mode: ${DEMO_MODE:-production}"

    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        echo "Error: jq is required but not installed. Install with: brew install jq"
        exit 1
    fi

    # Run all tests
    print_header "Running Tests"

    test_environment_config || true
    test_api_response || true
    test_liveness || true
    test_readiness || true
    test_redis_connection || true
    test_database || true
    test_file_permissions || true
    test_worker_health || true

    # Summary
    print_header "Test Summary"
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "\n${GREEN}✅ All tests passed! System is ready for deployment.${NC}"
        exit 0
    else
        echo -e "\n${RED}❌ $TESTS_FAILED test(s) failed. Please fix issues before deploying.${NC}"
        exit 1
    fi
}

# Run main
main
