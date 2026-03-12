# MCP Server Test Coverage

## Overview

Comprehensive test suite covering the AgentSync MCP Server implementation, ensuring reliability for Claude Desktop, Cline, Cursor, and other MCP-compatible AI assistants.

## Test Statistics

- **Total Tests**: 20
- **Unit Tests**: 10
- **Integration Tests**: 10
- **Pass Rate**: 100%

## Test Files

### 1. Unit Tests (`src/__tests__/tools.test.ts`)

Tests for tool definitions, schemas, and parameter validation.

**Coverage:**

- ✅ Tool definition validation (8 tools)
- ✅ Schema structure for `list_deployments`
- ✅ Required parameters for `create_deployment`
- ✅ Required parameters for `get_deployment_status`
- ✅ Deployment ID format validation
- ✅ Tenant IDs array format validation
- ✅ Status enum value validation
- ✅ Response format structure
- ✅ JSON response format validation
- ✅ Error response format with `isError` flag

**Test Cases:** 10 tests

### 2. Integration Tests (`src/__tests__/integration.test.ts`)

Tests for API connectivity and end-to-end workflows with live AgentSync API.

**Coverage:**

- ✅ API connectivity verification
- ✅ Deployment statistics fetching
- ✅ Agent listing
- ✅ Tenant listing
- ✅ Deployment listing
- ✅ Deployment status filtering
- ✅ Individual deployment status retrieval
- ✅ Error handling for non-existent deployments
- ✅ Error handling for invalid filters
- ✅ JSON response format validation

**Test Cases:** 10 tests

**Note:** Integration tests automatically skip if AgentSync API is not running at `http://localhost:3000`

## Claude Code Skill Tests

E2E tests for Claude Code skill workflows in `packages/web/e2e/claude-skill.spec.ts`

**Coverage:**

- ✅ Unauthenticated API access in demo mode
- ✅ Agent listing workflow
- ✅ Tenant listing workflow
- ✅ Deployment filtering workflow
- ✅ Deployment detail retrieval
- ✅ Deployment statistics
- ✅ Solution file download
- ✅ Complete deployment creation workflow
- ✅ Error message validation
- ✅ `/deployments` slash command workflow
- ✅ `/deploy` slash command workflow
- ✅ `/monitor` slash command workflow

**Test Cases:** 12 tests (Playwright E2E)

## Running Tests

### MCP Server Tests

```bash
cd packages/mcp-server

# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Claude Code Skill E2E Tests

```bash
cd packages/web

# Run E2E tests
pnpm test:e2e

# Run specific test file
pnpm test:e2e claude-skill.spec.ts
```

## Test Requirements

### Unit Tests

- No external dependencies
- Run instantly
- Always enabled

### Integration Tests

- Require AgentSync API running at `http://localhost:3000`
- Automatically skip if API unavailable
- Test real API responses

### E2E Tests

- Require full AgentSync web app running
- Test browser-based workflows
- Validate skill patterns work correctly

## Coverage by Feature

### MCP Tool Coverage

| Tool                    | Unit Tests | Integration Tests | E2E Tests |
| ----------------------- | ---------- | ----------------- | --------- |
| `list_deployments`      | ✅         | ✅                | ✅        |
| `get_deployment_status` | ✅         | ✅                | ✅        |
| `list_agents`           | ✅         | ✅                | ✅        |
| `list_tenants`          | ✅         | ✅                | ✅        |
| `create_deployment`     | ✅         | ⏭️                | ✅        |
| `monitor_deployment`    | ✅         | ⏭️                | ✅        |
| `get_deployment_stats`  | ✅         | ✅                | ✅        |
| `retry_deployment`      | ✅         | ⏭️                | ⏭️        |

**Legend:**

- ✅ Full coverage
- ⏭️ Skipped (requires specific state or destructive)

### Claude Code Skill Coverage

| Workflow                 | Covered | Test Type |
| ------------------------ | ------- | --------- |
| Natural language queries | ✅      | E2E       |
| `/deployments` command   | ✅      | E2E       |
| `/deploy` command        | ✅      | E2E       |
| `/monitor` command       | ✅      | E2E       |
| Error handling           | ✅      | E2E       |
| Demo mode access         | ✅      | E2E       |

## CI/CD Integration

Tests run automatically on:

- Pull requests
- Push to `main` branch
- Manual workflow dispatch

See `.github/workflows/test-mcp.yml` for CI configuration.

## Future Improvements

- [ ] Add mock API tests for create_deployment
- [ ] Add mock API tests for monitor_deployment
- [ ] Add mock API tests for retry_deployment
- [ ] Add performance benchmarks
- [ ] Add stress testing for concurrent requests
- [ ] Add memory leak detection
- [ ] Increase coverage to 100%

## Test Maintenance

### Adding New Tests

1. Create test file in `src/__tests__/`
2. Use descriptive test names
3. Group related tests with `describe()`
4. Add to this documentation

### Updating Tests

When API changes:

1. Update integration tests to match API response format
2. Update E2E tests for workflow changes
3. Re-run full test suite
4. Update documentation

## Support

For test issues or questions:

- GitHub Issues: https://github.com/pax8labs/agentsync/issues
- Test Failures: Check `npm test` output for details
