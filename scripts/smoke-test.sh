#!/bin/bash
# Pax8 CTA CLI smoke test

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

print_test() {
  echo "Testing: $1"
}

print_success() {
  echo -e "${GREEN}PASS${NC}: $1"
  ((TESTS_PASSED++))
}

print_failure() {
  echo -e "${RED}FAIL${NC}: $1"
  ((TESTS_FAILED++))
}

run_check() {
  local name="$1"
  shift

  print_test "$name"
  if "$@" >/tmp/pax8-cta-smoke.out 2>&1; then
    print_success "$name"
  else
    echo -e "${YELLOW}Output:${NC}"
    cat /tmp/pax8-cta-smoke.out
    print_failure "$name"
  fi
}

main() {
  echo "Pax8 CTA CLI smoke test"
  echo "========================="

  run_check "core build" pnpm --filter @pax8-cta/core build
  run_check "cli build" pnpm --filter pax8-cta build
  run_check "cli help" node packages/cli/dist/index.js --help
  run_check "demo tenants list" env DEMO_MODE=true node packages/cli/dist/index.js tenants list
  run_check "demo deployments list" env DEMO_MODE=true node packages/cli/dist/index.js deployments list
  run_check "setup status command" env DEMO_MODE=false node packages/cli/dist/index.js status --setup

  echo
  echo "Passed: $TESTS_PASSED"
  echo "Failed: $TESTS_FAILED"

  if [ "$TESTS_FAILED" -gt 0 ]; then
    exit 1
  fi
}

main
