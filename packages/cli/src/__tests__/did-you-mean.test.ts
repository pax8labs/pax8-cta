/**
 * Copyright 2024 Pax8, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, it, expect } from "vitest";
import { didYouMean, rankSuggestions } from "../lib/did-you-mean.js";

const TENANTS = [
  "Fabrikam Inc",
  "Litware Inc",
  "Tailspin Toys",
  "Coho Vineyard",
  "Contoso Ltd",
  "Woodgrove Bank",
];

describe("didYouMean (#462)", () => {
  it("suggests close matches on a typo", () => {
    const hint = didYouMean("Fabricam", TENANTS, {
      listCommand: "pax8-cta tenants list",
      noun: "tenants",
    });
    expect(hint).toContain("Did you mean");
    expect(hint).toContain("Fabrikam Inc");
    expect(hint).toContain("Run 'pax8-cta tenants list' to see all tenants.");
  });

  it("suggests substring matches", () => {
    const hint = didYouMean("Coho", TENANTS, {
      listCommand: "pax8-cta tenants list",
      noun: "tenants",
    });
    expect(hint).toContain("Coho Vineyard");
  });

  it("falls back to a bare list-command tail when nothing scores", () => {
    const hint = didYouMean("xxxxxxxxx", TENANTS, {
      listCommand: "pax8-cta tenants list",
      noun: "tenants",
    });
    // No suggestion header, just the tail.
    expect(hint).not.toContain("Did you mean");
    expect(hint).toBe("Run 'pax8-cta tenants list' to see all tenants.");
  });

  it("returns just the tail when candidates is empty", () => {
    const hint = didYouMean("anything", [], {
      listCommand: "pax8-cta tenants list",
      noun: "tenants",
    });
    expect(hint).toBe("Run 'pax8-cta tenants list' to see all tenants.");
  });

  it("caps suggestions at maxSuggestions", () => {
    const many = ["a1", "a2", "a3", "a4", "a5", "a6"];
    const hint = didYouMean("a", many, {
      listCommand: "pax8-cta X list",
      noun: "things",
      maxSuggestions: 2,
    });
    const bulletLines = hint.split("\n").filter((l) => l.startsWith("  - "));
    expect(bulletLines).toHaveLength(2);
  });
});

describe("rankSuggestions (#462)", () => {
  it("ranks substring hits ahead of pure edit-distance matches", () => {
    // "Litware Inc" contains "Lit" as a substring; "Cot" is only close to "Lit"
    // by edit distance (1 substitution). The substring hit should win.
    const ranked = rankSuggestions("Lit", ["Cot", "Litware Inc"], 5);
    expect(ranked[0]).toBe("Litware Inc");
  });

  it("skips exact case-insensitive matches (caller wouldn't be here for those)", () => {
    const ranked = rankSuggestions("Fabrikam Inc", TENANTS, 5);
    expect(ranked).not.toContain("Fabrikam Inc");
  });

  it("returns empty for empty query", () => {
    expect(rankSuggestions("", TENANTS, 5)).toEqual([]);
  });

  it("uses tighter edit-distance threshold for short queries", () => {
    // "cat" (len 3) — threshold is 2. "cot" (dist 1) matches, "cargo" (dist 3) does not.
    const ranked = rankSuggestions("cat", ["cot", "cargo"], 5);
    expect(ranked).toContain("cot");
    expect(ranked).not.toContain("cargo");
  });
});
