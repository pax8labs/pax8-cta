## Summary

<!-- 1-3 bullets explaining what this PR does and *why*. Mirror the style of recent merged PRs. -->

## Test plan

<!-- Check off what you ran. Add new bullets for any manual verification steps. -->

- [ ] `pnpm --filter @agentsync/cli build` clean
- [ ] `pnpm --filter @agentsync/cli test` green
- [ ] `pnpm --filter @agentsync/core test` green (if core changed)
- [ ] Manual verification (describe below)

<!-- Manual verification notes, screenshots of CLI output, etc. -->

## Related issues

<!-- e.g. Closes #123, Refs #456. Use "Closes" so GitHub auto-closes the issue on merge. -->

Closes #

## Breaking changes

<!-- Delete this section if no breaking changes. Otherwise list them and the migration path. -->

- [ ] This PR introduces a breaking change (CLI flag rename, removed command, config schema change, etc.)
