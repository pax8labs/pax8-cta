#!/usr/bin/env node

if (process.env.CI === "true") process.exit(0);

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = (t) => c("32;1", t);
const cyan = (t) => c("36", t);
const dim = (t) => c("90", t);

console.log(`\n${green("✓ @pax8/cta installed successfully!")}\n`);
console.log(`${dim("Quick start:")}\n`);
console.log(
  `  ${cyan("pax8-cta demo on")} ${dim("— Try it with mock data, no credentials needed")}`
);
console.log(`  ${cyan("pax8-cta init")}    ${dim("— Initialize real config and authenticate")}`);
console.log(`  ${cyan("pax8-cta --help")}  ${dim("— Show all commands")}`);
console.log(`\n${dim("Documentation: https://github.com/pax8labs/pax8-cta")}\n`);
