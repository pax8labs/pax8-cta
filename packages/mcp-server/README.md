# AgentSync MCP Server

Model Context Protocol (MCP) server for AgentSync deployment management. Enables AI assistants like Claude Desktop, Cline, and Cursor to manage Copilot Studio agent deployments through natural language.

## Features

- 🚀 **Deploy agents** to multiple customer tenants
- 📊 **Monitor deployments** in real-time with progress tracking
- 🔍 **Query deployment history** with status filtering
- 📋 **List available agents** and their deployment status
- 🏢 **View tenant information** and deployed agents
- 🔄 **Retry failed deployments** automatically
- 📈 **Get deployment statistics** and success rates

## Installation

### For Claude Desktop

1. Install the MCP server globally:

```bash
npm install -g @agentsync/mcp-server
```

2. Add to your Claude Desktop config file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "agentsync": {
      "command": "agentsync-mcp",
      "env": {
        "AGENTSYNC_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

3. Restart Claude Desktop

### For Cline (VS Code)

1. Install the MCP server:

```bash
npm install -g @agentsync/mcp-server
```

2. In VS Code, open Cline settings and add:

```json
{
  "mcpServers": {
    "agentsync": {
      "command": "agentsync-mcp",
      "env": {
        "AGENTSYNC_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

### For Development (from source)

```bash
# Clone the repo and navigate to the package
cd packages/mcp-server

# Install dependencies
npm install

# Build the server
npm run build

# Test it
npm start
```

## Configuration

The server supports comprehensive configuration via environment variables:

### API Configuration

| Variable       | Description            | Default                 |
| -------------- | ---------------------- | ----------------------- |
| `API_BASE_URL` | AgentSync API endpoint | `http://localhost:3000` |

### Request Configuration

| Variable                   | Description                                | Default       |
| -------------------------- | ------------------------------------------ | ------------- |
| `REQUEST_TIMEOUT_MS`       | Request timeout in milliseconds            | `30000` (30s) |
| `MAX_RETRIES`              | Maximum retry attempts for failed requests | `3`           |
| `RETRY_DELAY_MS`           | Initial retry delay in milliseconds        | `1000` (1s)   |
| `RETRY_BACKOFF_MULTIPLIER` | Exponential backoff multiplier             | `2`           |

### Circuit Breaker Configuration

| Variable                    | Description                        | Default       |
| --------------------------- | ---------------------------------- | ------------- |
| `CIRCUIT_BREAKER_THRESHOLD` | Failures before circuit opens      | `5`           |
| `CIRCUIT_BREAKER_RESET_MS`  | Circuit reset time in milliseconds | `60000` (60s) |

### Logging Configuration

| Variable     | Description                                      | Default |
| ------------ | ------------------------------------------------ | ------- |
| `LOG_LEVEL`  | Logging level (`error`, `warn`, `info`, `debug`) | `info`  |
| `LOG_FORMAT` | Log format (`json`, `pretty`)                    | `json`  |

### Example Configuration

```bash
export API_BASE_URL="http://localhost:3000"
export REQUEST_TIMEOUT_MS="45000"
export MAX_RETRIES="5"
export LOG_LEVEL="debug"
```

Or in your MCP config:

```json
{
  "env": {
    "API_BASE_URL": "http://localhost:3000",
    "REQUEST_TIMEOUT_MS": "45000",
    "MAX_RETRIES": "5",
    "LOG_LEVEL": "debug"
  }
}
```

## Usage

Once configured, you can ask your AI assistant natural language questions:

### Deployment Queries

```
"Show me all recent deployments"
"Which deployments failed today?"
"What's the status of deployment batch-abc123?"
"Get deployment statistics"
```

### Agent Management

```
"List all available agents"
"Which agents are deployed to Contoso?"
"Show me the ProductQA agents"
```

### Tenant Information

```
"List all customer tenants"
"Which agents are deployed to Woodgrove Bank?"
"Show tenants with the 'enterprise' tag"
```

### Risk Analysis

```
"Analyze the risk of deploying ProductQA to Contoso and Fabrikam"
"Check if it's safe to deploy to all enterprise tenants"
"What issues might occur if I deploy now?"
```

### Creating Deployments

```
"Deploy ProductQADemo_v3 to Woodgrove Bank"
"Deploy the Customer Service agent to all enterprise tenants"
"Create a deployment of ITHelpdesk to Contoso and Fabrikam"
```

### Monitoring & Troubleshooting

```
"Monitor deployment batch-abc123 until it completes"
"Retry the most recent failed deployment"
"Why did deployment batch-xyz789 fail?"
```

## Available Tools

The MCP server exposes these tools to AI assistants:

### `analyze_deployment_risk`

Analyze deployment risk before executing a deployment.

**Parameters:**

- `agentId` (required): Agent unique name (e.g., `ProductQADemo_v3`)
- `tenantIds` (required): Array of tenant IDs to analyze

**Returns:**

- Risk score (low/medium/high/critical)
- Success probability percentage
- Estimated deployment duration
- List of issues categorized by severity (critical, error, warning, info)
- Blockers that prevent deployment
- Actionable recommendations

**Use cases:**

- Check for GDAP permission issues before deploying
- Identify tenants with recurring deployment failures
- Validate sufficient deployment history for confidence
- Get estimated duration and success probability

### `list_deployments`

List recent deployments with optional status filtering.

**Parameters:**

- `status` (optional): Filter by status (`pending`, `in_progress`, `completed`, `failed`, `cancelled`)
- `limit` (optional): Max deployments to return (default: 10, max: 100)

### `get_deployment_status`

Get detailed status of a specific deployment.

**Parameters:**

- `deploymentId` (required): The deployment ID

### `list_agents`

List all available Copilot agents with deployment information.

### `list_tenants`

List all customer tenants with metadata and deployed agents.

### `create_deployment`

Create a new deployment to deploy an agent to tenants.

**Parameters:**

- `agentId` (required): Agent unique name (e.g., `ProductQADemo_v3`)
- `tenantIds` (required): Array of tenant IDs

### `monitor_deployment`

Monitor a deployment in real-time until completion.

**Parameters:**

- `deploymentId` (required): The deployment ID to monitor
- `maxWaitSeconds` (optional): Max seconds to wait (default: 60)

### `get_deployment_stats`

Get overall deployment statistics and success rates.

### `retry_deployment`

Retry a failed deployment.

**Parameters:**

- `deploymentId` (required): The deployment ID to retry

## Architecture

```
┌─────────────────────┐
│   AI Assistant      │
│  (Claude/Cline)     │
└──────────┬──────────┘
           │ MCP Protocol
           │
┌──────────▼──────────┐
│   MCP Server        │
│  (agentsync-mcp)    │
└──────────┬──────────┘
           │ HTTP/REST
           │
┌──────────▼──────────┐
│  AgentSync API      │
│  (localhost:3000)   │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Deployment Engine  │
│  & Data Store       │
└─────────────────────┘
```

## Development

### Build

```bash
npm run build
```

### Watch mode

```bash
npm run dev
```

### Test locally

```bash
# Terminal 1: Start AgentSync web app
cd packages/web
npm run dev

# Terminal 2: Test the MCP server
cd packages/mcp-server
npm start

# Type messages and press Enter (Ctrl+D to exit)
```

## Error Codes

The MCP server uses structured error responses with specific error codes:

### Error Code Reference

| Code                   | HTTP Status | Description                    | Resolution                                             |
| ---------------------- | ----------- | ------------------------------ | ------------------------------------------------------ |
| `API_ERROR`            | 4xx/5xx     | API request failed             | Check API endpoint and credentials                     |
| `NETWORK_ERROR`        | -           | Connection/network failure     | Verify network connectivity and API URL                |
| `TIMEOUT_ERROR`        | -           | Request exceeded timeout limit | Increase `REQUEST_TIMEOUT_MS` or check API performance |
| `VALIDATION_ERROR`     | 400         | Invalid input parameters       | Check parameter formats and requirements               |
| `NOT_FOUND`            | 404         | Resource not found             | Verify resource ID exists                              |
| `AUTH_ERROR`           | 401         | Authentication failed          | Check API credentials                                  |
| `CIRCUIT_BREAKER_OPEN` | 503         | Too many recent failures       | Wait for circuit breaker reset or check API health     |
| `RATE_LIMIT_EXCEEDED`  | 429         | Rate limit hit                 | Wait for retry-after period                            |

### Error Response Format

```json
{
  "error": "Deployment not found: batch-123",
  "code": "NOT_FOUND",
  "statusCode": 404,
  "details": {
    "resource": "deployment",
    "identifier": "batch-123"
  },
  "isError": true
}
```

### Retry Behavior

The server automatically retries failed requests with exponential backoff:

- **Retryable errors**: 5xx errors, timeouts, network failures, rate limits
- **Non-retryable errors**: 4xx errors (except 429)
- **Retry delay**: Starts at 1s, doubles each attempt (1s → 2s → 4s)
- **Max retries**: 3 attempts (configurable)

### Circuit Breaker

The circuit breaker protects against cascading failures:

1. **Closed** (normal): Requests flow normally
2. **Open** (failure): After 5 consecutive failures, circuit opens
3. **Half-Open** (recovery): After 60s, allows test request
4. **Reset**: If test succeeds, circuit closes

## Troubleshooting

### "Connection refused" errors

**Error**: `NETWORK_ERROR` or `ECONNREFUSED`

**Solution**:

1. Make sure the AgentSync API is running:

```bash
cd packages/web
npm run dev
```

2. Verify the API URL is correct in your MCP config
3. Check firewall settings

### "Tool not found" errors

**Error**: Tool invocation fails in AI assistant

**Solution**:

1. Restart your AI assistant after installing the MCP server
2. Verify MCP config file syntax
3. Check MCP server logs for startup errors

### "Circuit breaker open" errors

**Error**: `CIRCUIT_BREAKER_OPEN`

**Solution**:

1. Wait 60 seconds for automatic reset
2. Check AgentSync API health
3. Review logs for underlying error patterns
4. Increase `CIRCUIT_BREAKER_THRESHOLD` if needed

### Authentication errors

**Error**: `AUTH_ERROR` (401)

**Solution**:

1. Ensure AgentSync is running in demo mode (set `DEMO_MODE=true` in `.env`)
2. For production, verify Azure AD configuration

### Timeout errors

**Error**: `TIMEOUT_ERROR`

**Solution**:

1. Increase `REQUEST_TIMEOUT_MS` (default: 30000ms)
2. Check API performance and database queries
3. Review deployment complexity (multiple tenants)

### Validation errors

**Error**: `VALIDATION_ERROR` with details

**Solution**:

1. Check error details for specific validation failure
2. Verify parameter formats:
   - Deployment IDs: alphanumeric, hyphens, underscores
   - Tenant IDs: valid UUIDs
   - Status values: one of `pending`, `in_progress`, `completed`, `failed`, `cancelled`

### Enable debug logging

For detailed troubleshooting, enable debug logs:

```json
{
  "env": {
    "LOG_LEVEL": "debug",
    "LOG_FORMAT": "pretty"
  }
}
```

Then check stderr output for detailed request/response logs.

## Publishing

To publish to npm:

```bash
# Build the package
npm run build

# Publish (requires npm account)
npm publish --access public
```

## License

MIT - See [LICENSE](../../LICENSE) for details.

## Links

- [AgentSync Documentation](../../README.md)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Claude Desktop](https://claude.ai/download)
