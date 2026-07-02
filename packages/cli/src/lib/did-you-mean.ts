/**
 * Copyright 2024 Pax8, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export interface DidYouMeanOptions {
  /** Command that lists all valid candidates, e.g. "pax8-cta tenants list". */
  listCommand: string;
  /** Human-readable noun for the missing entity, e.g. "tenants". Used in the tail hint. */
  noun: string;
  /** Max number of suggestions to show (default 3). */
  maxSuggestions?: number;
}

/**
 * Build a "did you mean…" hint for a query that failed to match any candidate.
 *
 * Suggestions are ranked by (in order):
 *   1. Case-insensitive substring match (either direction)
 *   2. Levenshtein edit distance ≤ 3 (short queries get a proportionally tighter bound)
 *
 * Returns a multi-line string with a trailing "Run '<listCommand>' to see all <noun>." line.
 * When no candidates score, only the list-command tail is returned — never an empty string,
 * so callers can always append the result to an error and know the user has *some* recovery.
 */
export function didYouMean(
  query: string,
  candidates: readonly string[],
  opts: DidYouMeanOptions
): string {
  const max = opts.maxSuggestions ?? 3;
  const tail = `Run '${opts.listCommand}' to see all ${opts.noun}.`;

  const suggestions = rankSuggestions(query, candidates, max);
  if (suggestions.length === 0) {
    return tail;
  }

  const bulletList = suggestions.map((s) => `  - ${s}`).join("\n");
  return `Did you mean one of these?\n${bulletList}\n\n${tail}`;
}

/**
 * Pure ranker exposed for tests and specialized callers that want the raw list.
 */
export function rankSuggestions(
  query: string,
  candidates: readonly string[],
  max: number
): string[] {
  if (!query || candidates.length === 0) return [];

  const q = query.toLowerCase();
  const distanceThreshold = q.length <= 4 ? 2 : 3;

  const scored: Array<{ candidate: string; score: number }> = [];
  for (const candidate of candidates) {
    const c = candidate.toLowerCase();
    if (c === q) continue; // exact matches don't produce hints — caller wouldn't be here

    // Substring hits (either direction) sort ahead of pure edit-distance hits.
    // Full-string Levenshtein breaks ties among substring hits.
    if (c.includes(q) || q.includes(c)) {
      scored.push({ candidate, score: -1000 + levenshtein(q, c) });
      continue;
    }

    // Per-token edit distance catches typos on names with common suffixes:
    // "Fabricam" vs "Fabrikam Inc" — Levenshtein over the whole string is 5
    // (typo + 4 chars of " Inc"), which trips the threshold. Splitting the
    // candidate into tokens and scoring against the closest one lets us
    // recover the correct match.
    const tokens = c.split(/\s+/).filter((t) => t.length > 0);
    let bestTokenDist = Infinity;
    for (const t of tokens) {
      const d = levenshtein(q, t);
      if (d < bestTokenDist) bestTokenDist = d;
    }
    if (bestTokenDist <= distanceThreshold) {
      scored.push({ candidate, score: bestTokenDist });
      continue;
    }

    // Full-string Levenshtein as a last resort — useful for short single-token
    // names that don't gain anything from tokenization.
    const dist = levenshtein(q, c);
    if (dist <= distanceThreshold) {
      scored.push({ candidate, score: dist });
    }
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, max).map((s) => s.candidate);
}

/**
 * Classic iterative Levenshtein with a single-row buffer.
 * O(mn) time, O(min(m,n)) space. Adequate for the small candidate lists we see.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure b is the shorter string so the row size is smaller.
  if (a.length < b.length) {
    [a, b] = [b, a];
  }

  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let carry = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(
        prev[j] + 1, // deletion
        prev[j - 1] + 1, // insertion
        carry + cost // substitution
      );
      carry = above;
    }
  }

  return prev[b.length];
}
