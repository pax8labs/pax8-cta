# Pax8 CTA CLI — 10-Minute Demo Script

**Audience:** MSP partners, Pax8 sales engineers, platform/devops leads
**Setup:** Terminal at the pax8-cta repo root, demo mode enabled
**One-time prep:**

```bash
pnpm install && pnpm build
pnpm cli demo on
```

Then keep `pnpm cli <command>` (or, after `npm i -g`, just `pax8-cta <command>`)
on screen. All commands below are copy-paste ready.

---

## The story arc

```
KNOW YOUR FLEET  →  KNOW YOUR AGENTS  →  SHIP WITH CONFIDENCE  →  OBSERVE & RECOVER
   (2 min)            (2 min)              (2 min)                  (2 min)
```

Plus a 1-minute open and a 1-minute close. Each beat below shows the **command**,
the **talk track** (what the presenter says while the output is on screen), and
the **highlight** to point at on the table.

---

## 0:00 — Open (1 min)

> "Imagine you're a Microsoft 365 partner. You've built a Copilot Studio agent
> — say, an IT helpdesk bot — and 50 of your customers want it. Today, that
> means logging into 50 admin centers, exporting/importing, fixing URLs by
> hand, and praying nothing breaks halfway through.
>
> This is **Pax8 CTA**. It treats your entire customer fleet as one surface
> — through GDAP delegation. One CLI. Today I'll deploy an agent across a
> simulated fleet of 11 tenants in under 10 minutes."

```bash
pnpm cli demo status
```

> "I'm in demo mode — every command runs against mock fleet data, no
> credentials needed. The flow is identical against real tenants."

---

## 1:00 — Act 1: Know your fleet (2 min)

### Beat 1 — The full fleet

```bash
pnpm cli tenants list
```

> "11 customer tenants. Mix of enterprise (Contoso, Woodgrove, Fabrikam,
> Litware) and SMB (HVAC, legal, healthcare, retail). Each tagged so I can
> target slices later."

**Highlight:** Crown Auto Group at the bottom — `Active: No`.

> "Crown Auto is disabled because their GDAP relationship expired —
> contract renewal pending. Pax8 CTA knows not to ship to them, so I
> won't break production for a customer I can't legally touch."

### Beat 2 — Slice by tag

```bash
pnpm cli tenants list --tag enterprise
```

> "Four enterprise tenants. Every command — deploy, analyze, health —
> accepts the same `--tag` filter. Same surface, different scope."

### Beat 3 — Fleet health, one shot

```bash
pnpm cli tenants health
```

**Highlight:** `7/10 healthy (70%)` — three tenants with degraded API.

> "GDAP, API, Dataverse, license — four checks per tenant, parallel.
> Fabrikam, Northern Heights, and Tailspin all have API timeouts right
> now. Without this I'd have to open three admin centers to find out."

### Beat 4 — Drill into a single tenant

```bash
pnpm cli tenants show "Contoso Corporation" --health --agents
```

> "Contoso — 4 agents deployed, all current. Industry metadata, risk
> profile, last successful deployment. Notice the unhealthy API check —
> that's the same signal from the fleet view, with the underlying error."

---

## 3:00 — Act 2: Know your agents (2 min)

### Beat 5 — What's available to ship

```bash
pnpm cli solutions list
```

> "Four agents in my source environment. Versioned. Managed. These
> are the things I have to deploy."

### Beat 6 — Deployment matrix (this is the money shot)

```bash
pnpm cli solutions show SalesAssistant --tenants
```

**Highlight:** the `Version` column — three tenants stuck on 2.0.0.

> "Sales Assistant — deployed on 10 of 11 tenants. Seven are current on
> 2.1.0, **three are still on 2.0.0** — Litware, Proseware, Woodgrove.
> Crown Auto doesn't have it at all.
>
> Try asking Power Platform admin center this question. You can't —
> not without 11 logins."

### Beat 7 — Fleet-wide drift & customizations

```bash
pnpm cli solutions drift
```

**Highlight:** Unmanaged customizations section — Contoso 6, Woodgrove 10 ("high risk").

> "Two views in one: which tenants are behind on which agents, **and**
> which tenants have customers making local changes — flows, plugins,
> security roles — that a managed update could overwrite. Woodgrove has
> 10 unmanaged customizations including plugins. That's a 'call the
> customer before you deploy' signal."

---

## 5:00 — Act 3: Ship with confidence (2 min)

### Beat 8 — Risk scan before the change

```bash
pnpm cli analyze SalesAssistant --tag enterprise
```

**Highlight:** `Success Probability: 91%` and the `READY TO DEPLOY` banner.

> "Before I touch a single production tenant: per-tenant risk score,
> success probability, preconditions, estimated duration. This isn't a
> guess — it's based on deployment history, tenant health, and
> customization risk from the previous slide."

### Beat 9 — The plan, before the action

```bash
pnpm cli deploy SalesAssistant --tag enterprise --dry-run
```

**Highlight:** the URL template rewrites column — `{tenant} → contoso-prod`, `{tenant}.sharepoint.com → contoso-prod.sharepoint.com`.

> "This is what `--dry-run` shows: per-tenant URL rewrites, validation
> status, connection mappings. Same engine that runs the real deploy,
> just without the side effects. Woodgrove flagged 2 warnings —
> probably matches the customization risk we saw earlier."

### Beat 10 — Actually ship it

```bash
pnpm cli deploy SalesAssistant --tenant "Litware Inc"
```

> "Let's catch Litware up — they were on 2.0.0. One tenant, single
> deploy. Notice: deployment ID returned, target table, real export
> happens, real import happens. Demo mode just stops short of touching
> a Dataverse."

---

## 7:00 — Act 4: Observe & recover (2 min)

### Beat 11 — Recent fleet activity

```bash
pnpm cli deployments list --limit 5
```

**Highlight:** the mix of triggers — `manual`, `scheduled`, `webhook`, `cli`, `api`.

> "Last 5 deployments. Triggers tell me where they came from — CLI runs,
> CI pipelines (webhook/api), and scheduled jobs all show up here.
> Status, progress, who fired it."

### Beat 12 — Why did that one fail?

```bash
pnpm cli deployments show demo-hist-003
```

**Highlight:** the per-tenant error column — Tailspin (`Timeout after 120s`), Coho (`Permission denied: insuf...`).

> "ITHelpdesk rollout failed 3 days ago. 8 of 10 tenants got it; Tailspin
> timed out, Coho hit a permissions error. Different root causes, both
> visible in one place. That's the difference between 'something is
> broken' and 'fix Coho's app user registration.'"

### Beat 13 — Roll back a bad release

```bash
pnpm cli deployments undo demo-hist-001 --dry-run
```

**Highlight:** "Tenants to undo: 9 of 10".

> "Suppose that Sales Assistant 2.1.0 rollout from earlier today was
> actually shipping a bug. `deployments undo` re-imports the previous
> version across every tenant in that wave — 9 tenants in one command.
> Always `--dry-run` first; then drop the flag to commit."

---

## 9:00 — Close (1 min)

```bash
pnpm cli tenants list --tag enterprise --ids-only
```

> "Every command emits JSON or plain IDs. So you can pipe — `xargs`,
> `jq`, CI scripts, an AI agent driving the CLI. Same surface for
> humans, scripts, and copilots."

```bash
pnpm cli config
```

> "Demo mode is a one-line toggle. The whole thing is open source —
> `npm install -g @pax8/cta`, run `pax8-cta demo on`, and every
> command I just showed works on your laptop tonight against the same
> mock fleet. When you're ready, `pax8-cta init`, point it at your
> real GDAP tenants, and the only thing that changes is the data."

**One-line summary to leave on screen:**

> _"Multi-tenant Copilot Studio deployment, observability, and rollback
> — through GDAP, from one CLI."_

---

## Quick-recovery cheat sheet (if something goes sideways live)

| Symptom                              | Recovery                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| Demo banner missing                  | `pnpm cli demo on`                                                            |
| Output is JSON instead of tables     | Run in a real TTY (not piped). Set `PAX8_CTA_DEFAULT_FORMAT=table` if needed. |
| Command hangs on confirmation prompt | Use `--dry-run` for big deploys, or pick a single `--tenant`.                 |
| `Deployment '...' not found`         | Use `demo-hist-000` … `demo-hist-009`                                         |
| Want to reset between runs           | Nothing to reset — demo data is generated fresh each call                     |

---

## Optional alternative: hands-off auto demo

If you want to run it screen-share style with no typing:

```bash
pnpm cli demo auto --speed 1.5
```

Prebuilt walkthrough with typing animation. Less narrative than the script
above, but useful as a 5-minute "look what it does" reel.
