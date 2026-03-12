---
description: Analyze and fix failed deployments
---

Run `agentsync deployments list -s failed --since 7d` to find failures. For each, run `agentsync deployments show <id>` to get the error. Explain the root cause and offer to retry with `agentsync deployments retry <id>`.
