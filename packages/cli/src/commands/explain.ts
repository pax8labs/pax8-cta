/**
 * Copyright 2024 Pax8, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Command } from "commander";
import chalk from "chalk";
import { CliError, UsageError, handleCommandError } from "../lib/errors.js";
import { resolveFormat } from "../lib/output.js";
import { didYouMean } from "../lib/did-you-mean.js";
import {
  GLOSSARY,
  type GlossaryCategory,
  type GlossaryEntry,
  allCanonicalTerms,
  lookupTerm,
  normalizeTerm,
} from "./explain-glossary.js";

/**
 * `pax8-cta explain <term>` — built-in glossary for CTA / Power Platform
 * terms. Fully local: no auth, no config, no network. Ported from the
 * sibling `@pax8/cli` command (#656); the content lives in
 * `explain-glossary.ts`.
 */

const CATEGORY_ORDER: readonly GlossaryCategory[] = [
  "gdap",
  "solution",
  "deployment",
  "platform",
  "operational",
];

const CATEGORY_LABEL: Record<GlossaryCategory, string> = {
  gdap: "GDAP & Auth",
  solution: "Solutions",
  deployment: "Deployments",
  platform: "Power Platform",
  operational: "Operational",
};

export const explainCommand = new Command("explain")
  .description("Explain a CTA or Power Platform term")
  .argument("[term...]", "Term to explain — joined with spaces if multi-word")
  .option("--list", "List all known terms, grouped by category")
  .option("--json", "Output as JSON")
  .addHelpText(
    "after",
    `
Examples:
  pax8-cta explain gdap
  pax8-cta explain "managed solution"
  pax8-cta explain risk_band --json
  pax8-cta explain --list
  pax8-cta explain --list --json

Aliases and normalization:
  Space, underscore, and case are all normalized. \`managed solution\`,
  \`MANAGED_SOLUTION\`, and \`managed-solution\` all resolve to the same entry.`
  )
  .action(async (termArgs: string[], options: { list?: boolean; json?: boolean }) => {
    try {
      const format = resolveFormat({ json: options.json });
      const wantJson = format === "json";
      const wantQuiet = format === "quiet";

      // --list and a positional term are a nonsense combo — reject explicitly
      // rather than silently ignoring one.
      if (options.list && termArgs.length > 0) {
        throw new UsageError(
          `\`--list\` and a term argument are mutually exclusive. ` +
            `Use \`pax8-cta explain --list\` to see every term, or ` +
            `\`pax8-cta explain ${termArgs[0]}\` to look up one.`
        );
      }

      if (options.list) {
        renderList({ wantJson, wantQuiet });
        return;
      }

      if (termArgs.length === 0) {
        throw new UsageError(
          `Missing term to explain. Try \`pax8-cta explain gdap\` — or ` +
            `\`pax8-cta explain --list\` to browse every term.`
        );
      }

      // Variadic args let users type `pax8-cta explain managed solution`
      // without shell-quoting the space. Join, then normalize on lookup.
      const rawInput = termArgs.join(" ");
      const entry = lookupTerm(rawInput);

      if (!entry) {
        // Strip C0/C1 control chars so an input carrying ANSI escapes can't
        // repaint the surrounding error output. The regex matches literal
        // control chars by definition — that's the point — so disable the
        // no-control-regex rule for this line only.
        // eslint-disable-next-line no-control-regex
        const safeInput = rawInput.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
        const hint = didYouMean(normalizeTerm(rawInput), allCanonicalTerms(), {
          listCommand: "pax8-cta explain --list",
          noun: "terms",
        });
        throw new CliError(`No glossary entry for "${safeInput}".\n\n${hint}`);
      }

      renderEntry(entry, { wantJson, wantQuiet });
    } catch (error) {
      handleCommandError(error, undefined, "Failed to explain term");
    }
  });

// ─── Renderers ───────────────────────────────────────────────────────────────

function renderEntry(
  entry: GlossaryEntry,
  { wantJson, wantQuiet }: { wantJson: boolean; wantQuiet: boolean }
): void {
  if (wantQuiet) return;

  if (wantJson) {
    process.stdout.write(
      JSON.stringify(
        {
          term: entry.term,
          category: entry.category,
          short: entry.short,
          detail: entry.detail ?? null,
          seeAlso: entry.seeAlso ?? [],
          reference: entry.reference ?? null,
        },
        null,
        2
      ) + "\n"
    );
    return;
  }

  process.stdout.write("\n" + chalk.bold(entry.term.replace(/-/g, " ")) + "\n\n");
  process.stdout.write("  " + entry.short + "\n");
  if (entry.detail) {
    process.stdout.write("\n  " + entry.detail + "\n");
  }

  const metaLines: string[] = [];
  metaLines.push(`  ${chalk.dim("Category:")}   ${CATEGORY_LABEL[entry.category]}`);
  if (entry.reference) {
    metaLines.push(`  ${chalk.dim("Referenced:")} ${chalk.cyan(entry.reference)}`);
  }
  if (entry.seeAlso && entry.seeAlso.length > 0) {
    metaLines.push(
      `  ${chalk.dim("See also:")}   ${entry.seeAlso.map((s) => chalk.cyan(s)).join(", ")}`
    );
  }
  process.stdout.write("\n" + metaLines.join("\n") + "\n\n");
}

function renderList({ wantJson, wantQuiet }: { wantJson: boolean; wantQuiet: boolean }): void {
  if (wantQuiet) return;

  if (wantJson) {
    const rows = [...GLOSSARY]
      .sort((a, b) => a.term.localeCompare(b.term))
      .map((e) => ({ term: e.term, category: e.category, short: e.short }));
    process.stdout.write(JSON.stringify({ terms: rows }, null, 2) + "\n");
    return;
  }

  process.stdout.write("\n" + chalk.bold("Pax8 CTA glossary") + "\n");
  process.stdout.write(
    chalk.dim(`  ${GLOSSARY.length} terms · run `) +
      chalk.cyan("pax8-cta explain <term>") +
      chalk.dim(` for a full entry.\n\n`)
  );

  for (const category of CATEGORY_ORDER) {
    const entries = GLOSSARY.filter((e) => e.category === category);
    if (entries.length === 0) continue;
    entries.sort((a, b) => a.term.localeCompare(b.term));
    process.stdout.write("  " + chalk.bold(CATEGORY_LABEL[category]) + "\n");
    const width = Math.max(...entries.map((e) => e.term.length));
    for (const e of entries) {
      process.stdout.write(`    ${chalk.cyan(e.term.padEnd(width))}  ${chalk.dim(e.short)}\n`);
    }
    process.stdout.write("\n");
  }
}
