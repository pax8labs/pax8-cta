# Contributing to AgentSync

Thank you for contributing to AgentSync! This guide will help you get started.

## Development Workflow

### 1. Pick an Issue

Browse [open issues](https://github.com/pax8labs/agentsync/issues) and pick one to work on. Issues #11-20 are the production readiness checklist.

**Priority:**

- 🔴 CRITICAL (issues #11-15): Security and auth - require 2 approvals
- 🟡 HIGH (issues #16-19): Operations and quality - require 1 approval
- 🟢 MEDIUM (issue #20): Testing - require 1 approval

### 2. Create a Feature Branch

```bash
# Make sure you're on main and up to date
git checkout main
git pull origin main

# Create a feature branch (use descriptive names)
git checkout -b feature/issue-11-remove-demo-defaults
git checkout -b fix/validation-sql-injection
git checkout -b docs/update-deployment-guide
```

**Branch naming:**

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation only
- `refactor/` - Code refactoring
- `test/` - Test additions

### 3. Make Your Changes

```bash
# Make changes in your editor
# Run tests frequently
pnpm test

# Test your changes manually
pnpm web  # Start dev server at localhost:3000
```

**Development tips:**

- Run tests before committing: `pnpm test`
- Check TypeScript: `cd packages/web && pnpm tsc --noEmit`
- Build to verify: `pnpm build`
- Use demo mode for testing: Set `DEMO_MODE=true` in `.env`

### 4. Commit Your Changes

Write clear, descriptive commit messages:

```bash
git add .
git commit -m "Remove demo mode authentication defaults

- Remove fallback values for Azure AD credentials
- Require NEXTAUTH_SECRET to be explicitly set
- Add startup validation for required env vars
- Update .env.example with security warnings

Closes #11"
```

**Commit message format:**

```
Brief summary (50 chars or less)

More detailed explanation if needed. Wrap at 72 characters.
Explain WHAT changed and WHY, not HOW (code shows how).

- Bullet points are fine
- Use imperative mood: "Add feature" not "Added feature"

Closes #issue-number
```

### 5. Push and Create PR

```bash
# Push your branch
git push origin feature/issue-11-remove-demo-defaults

# Create a pull request
gh pr create --title "Fix #11: Remove demo mode authentication defaults" \
             --body "See PR template for details" \
             --assignee @me
```

Or use the GitHub UI to create the PR.

### 6. PR Review Process

**Before requesting review:**

- [ ] All tests pass
- [ ] Build succeeds
- [ ] PR template filled out completely
- [ ] Code is self-reviewed
- [ ] Documentation updated

**During review:**

- Respond to feedback promptly
- Make requested changes in new commits (don't force push)
- Mark conversations as resolved when addressed
- Request re-review when ready

**After approval:**

- Squash and merge via GitHub UI
- Delete your branch after merge

## Code Standards

### TypeScript

- Use TypeScript strict mode
- Avoid `any` - use proper types
- Export interfaces for shared types

### React Components

- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks

### API Routes

```typescript
// Always validate session
const session = await getServerSession(authOptions);
if (!session) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// Validate inputs with Zod
const result = schema.safeParse(body);
if (!result.success) {
  return NextResponse.json({ error: "Validation failed" }, { status: 400 });
}

// Use try/catch for error handling
try {
  // Operation
  return NextResponse.json({ success: true });
} catch (error) {
  logger.error({ error }, "Operation failed");
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
```

### Database

- Use parameterized queries (never string concatenation)
- Add migrations for schema changes
- Test with SQLite in-memory for unit tests

### Security

- Never commit secrets or credentials
- Validate all user inputs
- Use prepared statements for SQL
- Sanitize data before logging
- Check authorization before data access

## Testing

### Run Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test --watch

# Specific file
pnpm test src/__tests__/api-approve.test.ts

# Coverage
pnpm test --coverage
```

### Writing Tests

- Write tests for new features
- Update tests for bug fixes
- Aim for 80%+ coverage
- Test error cases, not just happy path

### Test Organization

```
src/
  __tests__/
    unit/           # Unit tests
    integration/    # API integration tests
    e2e/           # End-to-end tests
```

## Common Tasks

### Adding a New API Endpoint

1. Create route file: `src/app/api/your-endpoint/route.ts`
2. Add session validation
3. Add input validation (Zod schema)
4. Implement logic
5. Add error handling
6. Write tests
7. Update API documentation in README

### Adding a Database Table

1. Update `src/lib/db-schema.sql`
2. Create migration in `src/lib/migrations/`
3. Create repository in `src/lib/repositories/`
4. Export from `src/lib/repositories/index.ts`
5. Write repository tests
6. Update README if user-facing

### Fixing a Security Issue

1. Review issue details carefully
2. Check if other code has same vulnerability
3. Write test that fails (proves the issue)
4. Implement fix
5. Verify test passes
6. Add regression test
7. Request security review (2 approvals)

## Getting Help

- **Questions?** Ask in PR comments or open a discussion
- **Stuck?** Tag `@team` in your PR for help
- **Found a bug?** Open an issue with reproduction steps
- **Security issue?** Report to the maintainers via a [GitHub security advisory](https://github.com/pax8labs/agentsync/security/advisories/new) (don't open public issue)

## Production Readiness Checklist

Before marking an issue as complete, verify:

For **Security Issues (#11-15):**

- [ ] Security implications considered
- [ ] No new vulnerabilities introduced
- [ ] Input validation comprehensive
- [ ] Authorization checks in place
- [ ] Secrets not exposed
- [ ] 2 approvals received

For **All Issues:**

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console.log left in code
- [ ] TypeScript types correct
- [ ] Error handling implemented
- [ ] Performance considered
- [ ] Backward compatible (or migration provided)

## Release Process

1. All production issues (#11-20) must be closed
2. Security audit completed
3. Performance testing done
4. Documentation complete
5. Deploy to staging → smoke test → production

## Code of Conduct

- Be respectful and professional
- Provide constructive feedback
- Help each other learn and grow
- Celebrate wins together

## Questions?

Open an issue or reach out to the team. Happy coding! 🚀
