# Contributing to Pax8 CTA

Thank you for your interest in Pax8 CTA! We appreciate bug reports, feature requests, questions, and feedback from the community.

## Contribution Model

Pax8 CTA is currently maintained by Pax8 under a **publish-only** open source model. This means:

- Pax8 develops and publishes all code changes.
- External pull requests are **not accepted** at this time.
- You are welcome to **open issues**, **ask questions**, and **provide feedback**.

We plan to accept community contributions once we have a CLA and review process in place. Watch this repo for updates.

## Reporting Bugs

If you find a bug, please [open an issue](https://github.com/pax8labs/pax8-cta/issues/new) and include:

- A clear, descriptive title
- Steps to reproduce the problem
- Expected behavior vs. actual behavior
- Your environment (OS, Node.js version, CLI version)
- Any relevant error messages or log output
- The CLI command you ran (with `--verbose` output if possible)

## Requesting Features

We welcome feature requests. When opening one, please include:

- A description of the problem you are trying to solve
- Your proposed solution or desired behavior
- Your use case (how you use Pax8 CTA, what tenant scale you operate at)
- Whether any workarounds exist today

## Running Locally

If you want to explore the codebase or reproduce an issue locally:

```bash
# Clone and install
git clone https://github.com/pax8labs/pax8-cta.git
cd pax8-cta
pnpm install

# Build all packages
pnpm build

# Run CLI tests (uses DEMO_MODE, no Azure AD credentials needed)
pnpm --filter @pax8/cta test

# Run a single test file
pnpm --filter @pax8/cta test -- --run src/__tests__/init.test.ts

# Run with coverage
pnpm --filter @pax8/cta test:coverage

# Type-check and lint
pnpm typecheck
pnpm lint
pnpm format:check
```

The CLI is the primary package. Set `DEMO_MODE=true` to bypass Azure AD authentication and use mock data.

## Code Standards

For context when reading the codebase:

- TypeScript strict mode
- Double quotes, 2-space indentation, 100-character print width, ES5 trailing commas
- Commit messages use imperative mood ("Add feature" not "Added feature")
- Branch prefixes: `feature/`, `fix/`, `docs/`, `refactor/`, `test/`

## Security Issues

**Do not open a public issue for security vulnerabilities.** Please report them responsibly by following the process described in [SECURITY.md](SECURITY.md).

## Code of Conduct

All participants are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Future Contributions

We plan to accept community contributions in the future once we establish a Contributor License Agreement (CLA) and a formal review process. When that happens, this document will be updated with full contribution guidelines. Watch this repository or check back for announcements.

## Questions?

Open an issue or start a discussion. We are happy to help.
