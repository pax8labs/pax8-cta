---
description: Analyze and fix failed deployments
---

Run `pax8-cta deployments list -s failed --since 7d` to find failures. For each, run `pax8-cta deployments show <id>` to get the error. Explain the root cause and offer to retry with `pax8-cta deployments retry <id>`.
