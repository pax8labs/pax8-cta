# AgentSync CLI Manual Test Plan

**Date:** 2026-03-11
**Environment:** Power Platform (real credentials)
**Tester prerequisites:**

- Working directory: `cd /Users/jdulberger/Documents/agentsync`
- The CLI is built: `node packages/cli/dist/index.js`
- `PARTNER_CLIENT_SECRET` is set (loaded from `.env` or exported manually)
- All commands below use `DEMO_MODE=false` to bypass the `.env` default of `DEMO_MODE=true`

**Shorthand used below:**

```
CLI="DEMO_MODE=false node packages/cli/dist/index.js"
```

Run `export CLI="DEMO_MODE=false node packages/cli/dist/index.js"` first, then copy/paste commands using `$CLI`. Alternatively, prefix every command manually.

**Tenant info for reference:**

| Key           | Value                                                    |
| ------------- | -------------------------------------------------------- |
| Tenant ID     | `5ef655fa-32f3-44b2-bdc9-86a50b667ea0`                   |
| Client ID     | `391d47c5-fb76-492a-a0c8-c9ce6a237eff`                   |
| Source env    | `https://org60b532ae.crm.dynamics.com`                   |
| Target env    | `https://org54870a4d.crm.dynamics.com` (AgentSync-Test2) |
| Config file   | `config/tenants.yaml`                                    |
| Test solution | `TestDeploy` (exists in source)                          |

---

## 1. Setup & Config

### Test 1.1: Top-level help

```bash
DEMO_MODE=false node packages/cli/dist/index.js --help
```

**Expected:** Prints ASCII banner, version `0.1.0`, and a list of all commands including: `init`, `auth`, `deploy`, `deployments`, `solutions`, `tenants`, `setup`, `validate`, `analyze`. Exit code 0.

---

### Test 1.2: Validate config, credentials, and connectivity

```bash
DEMO_MODE=false node packages/cli/dist/index.js validate
```

**Expected:**

- "Configuration file valid" with 1 tenant configured
- "Client secret found"
- "AgentSync-Test2: Ready" (app user configured with System Administrator role)
- "Source environment reachable"
- Final line: "All validation checks passed!"
- Exit code 0

---

### Test 1.3: Validate a specific tenant by name

```bash
DEMO_MODE=false node packages/cli/dist/index.js validate -t AgentSync-Test2
```

**Expected:** Same as 1.2 but scoped to only the AgentSync-Test2 tenant. Should still check source environment. Exit code 0.

---

## 2. Solutions

### Test 2.1: List solutions in source environment

```bash
DEMO_MODE=false node packages/cli/dist/index.js solutions list
```

**Expected:**

- Spinner shows "Manifest loaded", "Connected to source environment", "Querying solutions..."
- Table with columns: Solution, Version, Type, Unique Name
- `TestDeploy` appears in the list
- Total count shown at bottom
- Exit code 0

---

### Test 2.2: List solutions in target environment

```bash
DEMO_MODE=false node packages/cli/dist/index.js solutions list -t AgentSync-Test2
```

**Expected:**

- Same table format, but for the AgentSync-Test2 environment
- May or may not contain `TestDeploy` depending on prior test runs
- Exit code 0

---

### Test 2.3: List solutions as JSON

```bash
DEMO_MODE=false node packages/cli/dist/index.js solutions list --json
```

**Expected:**

- Valid JSON output with keys: `environment`, `solutions` (array), `total`
- Each solution has: `solutionId`, `uniqueName`, `friendlyName`, `version`, `isManaged`
- Exit code 0

**Verification:** Pipe through `| python3 -m json.tool` to confirm valid JSON.

---

## 3. Deploy Cycle

> **IMPORTANT:** Tests 3.1-3.5 form a sequence. Run them in order. Test 3.5 cleans up by removing the deployed solution.

### Test 3.1: Dry-run deploy

```bash
DEMO_MODE=false node packages/cli/dist/index.js deploy TestDeploy --all --dry-run --direct
```

**Expected:**

- "Manifest loaded"
- Exports solution from source (shows version and managed/unmanaged)
- Shows "Shipping Destinations (1)" table with AgentSync-Test2
- Prints "Dry run - no agent packages will be shipped"
- Exit code 0

---

### Test 3.2: Deploy TestDeploy to target (direct mode)

```bash
DEMO_MODE=false node packages/cli/dist/index.js deploy TestDeploy --all --direct
```

**Expected:**

- "Manifest loaded"
- Auto-detects solution mode (managed or unmanaged)
- Exports solution from source with version number
- Shows destinations table
- "Checking application users..." with "AgentSync-Test2: Ready"
- "Deploying to AgentSync-Test2..." with progress percentage
- "AgentSync-Test2: Deployed successfully"
- Deployment Summary: Total 1, Success 1
- Exit code 0

**Timing:** This may take 1-5 minutes for the import to complete.

---

### Test 3.3: Verify deployment - list solutions in target

```bash
DEMO_MODE=false node packages/cli/dist/index.js solutions list -t AgentSync-Test2
```

**Expected:**

- `TestDeploy` now appears in the solution list for AgentSync-Test2
- Version matches what was exported in Test 3.2
- Type shows as "Managed" (or "Unmanaged" if auto-detected as unmanaged)
- Exit code 0

---

### Test 3.4: Verify deployment - list deployments

```bash
DEMO_MODE=false node packages/cli/dist/index.js deployments list
```

**Expected:**

- Shows a table or list of deployments
- The recent deployment from Test 3.2 may appear (depends on whether direct-mode deployments are tracked in the deployment store)
- Exit code 0

**Note:** If this command requires Redis/a running worker to have deployment records, it may show an empty list or an error. Document what actually happens.

---

### Test 3.5: Remove deployed solution (cleanup)

```bash
DEMO_MODE=false node packages/cli/dist/index.js solutions remove TestDeploy -t AgentSync-Test2 -y
```

**Expected:**

- "Target: AgentSync-Test2 (https://org54870a4d.crm.dynamics.com)"
- "Uninstalled 'TestDeploy' from AgentSync-Test2"
- Exit code 0

**Verification:** Re-run Test 2.2 (`solutions list -t AgentSync-Test2`) and confirm `TestDeploy` is no longer listed.

---

## 4. Environment Management

### Test 4.1: List configured tenants

```bash
DEMO_MODE=false node packages/cli/dist/index.js tenants list
```

**Expected:**

- "Loaded 1 destinations from manifest"
- Table with columns: Destination, Tenant ID, Port (Environment), Tags, Active
- Row shows: AgentSync-Test2, tenant ID prefix, environment URL, tags (or `-`), `Yes`
- Fleet size: 1 destinations (1 active)
- Exit code 0

---

### Test 4.2: List tenants as JSON

```bash
DEMO_MODE=false node packages/cli/dist/index.js tenants list --json
```

**Expected:**

- Valid JSON with `tenants` array, `total`, `active` fields
- Exit code 0

---

### Test 4.3: Inspect tenant connectivity (GDAP validation)

```bash
DEMO_MODE=false node packages/cli/dist/index.js tenants inspect
```

**Expected:**

- "Loaded 1 destinations to inspect"
- "Inspecting Shipping Routes"
- AgentSync-Test2 result (either "Route clear" or details about GDAP status)
- Inspection Report summary
- Exit code 0

**Note:** Since this is a single-tenant test environment (not a true GDAP/CSP scenario), the GDAP check may fail or warn. Document the actual result.

---

### Test 4.4: Setup check (read-only)

```bash
DEMO_MODE=false node packages/cli/dist/index.js setup --check
```

**Expected:**

- "Configuration loaded"
- "Checking 1 environment(s)..."
- Table with columns: Environment, App Registered, Role, Status
- AgentSync-Test2 row shows: checkmark for App Registered, "System Admin" for Role, "Ready" for Status
- Exit code 0

---

## 5. Analysis

### Test 5.1: Analyze deployment risk

```bash
DEMO_MODE=false node packages/cli/dist/index.js analyze TestDeploy
```

**Expected:**

- "Manifest loaded"
- "Analyzing Risk for 1 Destinations" with table showing AgentSync-Test2
- "Risk analysis complete"
- Risk Analysis Report with:
  - Risk Score (low/medium/high)
  - Confidence percentage
  - Success Probability percentage
  - Estimated Duration
  - Can Proceed: YES or NO
- Issues/warnings/recommendations sections
- Exit code 0

---

### Test 5.2: Analyze with JSON output

```bash
DEMO_MODE=false node packages/cli/dist/index.js analyze TestDeploy --json
```

**Expected:**

- Valid JSON with risk analysis fields: `score`, `confidence`, `successProbability`, `canProceed`, `issues`, `blockers`, `recommendations`
- Exit code 0

---

## 6. Error Cases

### Test 6.1: Deploy a nonexistent solution

```bash
DEMO_MODE=false node packages/cli/dist/index.js deploy NonExistentSolution_12345 --all --direct
```

**Expected:**

- Attempts to export from source
- Fails with an error message indicating the solution was not found
- Exit code 1

---

### Test 6.2: List solutions for a nonexistent tenant

```bash
DEMO_MODE=false node packages/cli/dist/index.js solutions list -t NoSuchTenant
```

**Expected:**

- Error: "Tenant 'NoSuchTenant' not found in manifest"
- Exit code 1

---

### Test 6.3: Validate a nonexistent tenant

```bash
DEMO_MODE=false node packages/cli/dist/index.js validate -t NoSuchTenant
```

**Expected:**

- Error: "Tenant 'NoSuchTenant' not found in configuration or not enabled"
- Exit code 1

---

### Test 6.4: Remove a solution that is not installed

```bash
DEMO_MODE=false node packages/cli/dist/index.js solutions remove FakeSolution_xyz -t AgentSync-Test2 -y
```

**Expected:**

- Attempts to delete
- Fails with an error indicating the solution does not exist
- Exit code 1

---

### Test 6.5: Setup with no flags

```bash
DEMO_MODE=false node packages/cli/dist/index.js setup
```

**Expected:**

- Error message: "Must specify --check, --all, or --tenant <name>"
- Exit code 1

---

### Test 6.6: Missing config file

```bash
DEMO_MODE=false node packages/cli/dist/index.js validate -c /tmp/nonexistent.yaml
```

**Expected:**

- "File not found: /tmp/nonexistent.yaml"
- Fix suggestion: "Run 'agentsync init' to create a configuration file"
- Exit code 1

---

## Results Tracker

| Test | Name                             | Pass/Fail | Notes |
| ---- | -------------------------------- | --------- | ----- |
| 1.1  | Top-level help                   |           |       |
| 1.2  | Validate all                     |           |       |
| 1.3  | Validate specific tenant         |           |       |
| 2.1  | Solutions list (source)          |           |       |
| 2.2  | Solutions list (target)          |           |       |
| 2.3  | Solutions list JSON              |           |       |
| 3.1  | Dry-run deploy                   |           |       |
| 3.2  | Deploy TestDeploy                |           |       |
| 3.3  | Verify deploy (solutions list)   |           |       |
| 3.4  | Verify deploy (deployments list) |           |       |
| 3.5  | Remove deployed solution         |           |       |
| 4.1  | Tenants list                     |           |       |
| 4.2  | Tenants list JSON                |           |       |
| 4.3  | Tenants inspect                  |           |       |
| 4.4  | Setup check                      |           |       |
| 5.1  | Analyze risk                     |           |       |
| 5.2  | Analyze JSON                     |           |       |
| 6.1  | Deploy nonexistent solution      |           |       |
| 6.2  | List solutions bad tenant        |           |       |
| 6.3  | Validate bad tenant              |           |       |
| 6.4  | Remove missing solution          |           |       |
| 6.5  | Setup no flags                   |           |       |
| 6.6  | Missing config file              |           |       |
