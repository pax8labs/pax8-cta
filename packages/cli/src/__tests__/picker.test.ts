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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockQuestion = vi.fn();

vi.mock("../lib/input.js", () => ({
  question: mockQuestion,
}));

const mockIsQuietMode = vi.fn(() => false);
vi.mock("../lib/spinner.js", () => ({
  isQuietMode: mockIsQuietMode,
  createSpinner: vi.fn(),
}));

describe("pickFromList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsQuietMode.mockReturnValue(false);
  });

  it("returns the chosen item for a valid number selection", async () => {
    const { pickFromList } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("2");

    const result = await pickFromList(["alpha", "beta", "gamma"], {
      prompt: "Pick one:",
      isInteractive: true,
    });

    expect(result).toBe("beta");
  });

  it("returns the first item when user picks 1", async () => {
    const { pickFromList } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("1");

    const result = await pickFromList(["alpha", "beta", "gamma"], {
      prompt: "Pick one:",
      isInteractive: true,
    });

    expect(result).toBe("alpha");
  });

  it("returns undefined when user picks 0 (skip)", async () => {
    const { pickFromList } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("0");

    const result = await pickFromList(["alpha", "beta"], {
      prompt: "Pick one:",
      isInteractive: true,
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined for non-numeric input", async () => {
    const { pickFromList } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("not a number");

    const result = await pickFromList(["alpha", "beta"], {
      prompt: "Pick one:",
      isInteractive: true,
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined for empty input (just Enter)", async () => {
    const { pickFromList } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("");

    const result = await pickFromList(["alpha", "beta"], {
      prompt: "Pick one:",
      isInteractive: true,
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined for out-of-range numbers", async () => {
    const { pickFromList } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("99");

    const result = await pickFromList(["alpha", "beta"], {
      prompt: "Pick one:",
      isInteractive: true,
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined for an empty list without prompting", async () => {
    const { pickFromList } = await import("../lib/picker.js");

    const result = await pickFromList([], {
      prompt: "Pick one:",
      isInteractive: true,
    });

    expect(result).toBeUndefined();
    expect(mockQuestion).not.toHaveBeenCalled();
  });

  it("returns undefined when not interactive (skips prompt entirely)", async () => {
    const { pickFromList } = await import("../lib/picker.js");

    const result = await pickFromList(["alpha", "beta"], {
      prompt: "Pick one:",
      isInteractive: false,
    });

    expect(result).toBeUndefined();
    expect(mockQuestion).not.toHaveBeenCalled();
  });

  it("uses y/n confirm flow when there's only one item", async () => {
    const { pickFromList } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("y");

    const result = await pickFromList(["only"], {
      prompt: "Try with",
      isInteractive: true,
    });

    expect(result).toBe("only");
  });

  it("returns undefined when single-item confirm is declined", async () => {
    const { pickFromList } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("n");

    const result = await pickFromList(["only"], {
      prompt: "Try with",
      isInteractive: true,
    });

    expect(result).toBeUndefined();
  });

  it("respects the label callback when rendering items", async () => {
    const { pickFromList } = await import("../lib/picker.js");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockQuestion.mockResolvedValueOnce("1");

    const items = [{ name: "Contoso" }, { name: "Fabrikam" }];
    const result = await pickFromList(items, {
      prompt: "Pick:",
      label: (it) => it.name,
      isInteractive: true,
    });

    expect(result).toEqual({ name: "Contoso" });
    const allOutput = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(allOutput).toContain("Contoso");
    expect(allOutput).toContain("Fabrikam");
    logSpy.mockRestore();
  });
});

describe("confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true for 'y'", async () => {
    const { confirm } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("y");
    expect(await confirm("ok? ")).toBe(true);
  });

  it("returns true for 'yes'", async () => {
    const { confirm } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("yes");
    expect(await confirm("ok? ")).toBe(true);
  });

  it("is case-insensitive ('Y', 'YES', 'Yes')", async () => {
    const { confirm } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("Y");
    expect(await confirm("ok? ")).toBe(true);
    mockQuestion.mockResolvedValueOnce("YES");
    expect(await confirm("ok? ")).toBe(true);
    mockQuestion.mockResolvedValueOnce("Yes");
    expect(await confirm("ok? ")).toBe(true);
  });

  it("trims whitespace before checking", async () => {
    const { confirm } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("  yes  ");
    expect(await confirm("ok? ")).toBe(true);
  });

  it("returns false for 'n'", async () => {
    const { confirm } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("n");
    expect(await confirm("ok? ")).toBe(false);
  });

  it("returns false for empty input", async () => {
    const { confirm } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("");
    expect(await confirm("ok? ")).toBe(false);
  });

  it("returns false for arbitrary text", async () => {
    const { confirm } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("maybe");
    expect(await confirm("ok? ")).toBe(false);
  });

  it("returns false for partial matches like 'ya' or 'yep'", async () => {
    const { confirm } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("ya");
    expect(await confirm("ok? ")).toBe(false);
    mockQuestion.mockResolvedValueOnce("yep");
    expect(await confirm("ok? ")).toBe(false);
  });
});

describe("confirmWithDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits on 'y' without showing details", async () => {
    const { confirmWithDetails } = await import("../lib/picker.js");
    const showDetails = vi.fn();
    mockQuestion.mockResolvedValueOnce("y");

    const result = await confirmWithDetails("Deploy?", { showDetails });

    expect(result).toBe(true);
    expect(showDetails).not.toHaveBeenCalled();
  });

  it("bails on empty input (Enter = no)", async () => {
    const { confirmWithDetails } = await import("../lib/picker.js");
    const showDetails = vi.fn();
    mockQuestion.mockResolvedValueOnce("");

    const result = await confirmWithDetails("Deploy?", { showDetails });

    expect(result).toBe(false);
    expect(showDetails).not.toHaveBeenCalled();
  });

  it("bails on 'n'", async () => {
    const { confirmWithDetails } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("n");
    expect(await confirmWithDetails("Deploy?", { showDetails: vi.fn() })).toBe(false);
  });

  it("runs showDetails and re-prompts on 'd', then commits", async () => {
    const { confirmWithDetails } = await import("../lib/picker.js");
    const showDetails = vi.fn();
    // First answer 'd' (view details), then 'y' (commit).
    mockQuestion.mockResolvedValueOnce("d").mockResolvedValueOnce("y");

    const result = await confirmWithDetails("Deploy?", { showDetails });

    expect(showDetails).toHaveBeenCalledTimes(1);
    expect(mockQuestion).toHaveBeenCalledTimes(2);
    expect(result).toBe(true);
  });

  it("accepts 'details' as a synonym for 'd'", async () => {
    const { confirmWithDetails } = await import("../lib/picker.js");
    const showDetails = vi.fn();
    mockQuestion.mockResolvedValueOnce("details").mockResolvedValueOnce("n");

    const result = await confirmWithDetails("Deploy?", { showDetails });

    expect(showDetails).toHaveBeenCalledTimes(1);
    expect(result).toBe(false);
  });

  it("loops details repeatedly until a decision is made", async () => {
    const { confirmWithDetails } = await import("../lib/picker.js");
    const showDetails = vi.fn();
    mockQuestion
      .mockResolvedValueOnce("d")
      .mockResolvedValueOnce("d")
      .mockResolvedValueOnce("d")
      .mockResolvedValueOnce("y");

    const result = await confirmWithDetails("Deploy?", { showDetails });

    expect(showDetails).toHaveBeenCalledTimes(3);
    expect(result).toBe(true);
  });

  it("renders [y/N/d] label when a details callback is present", async () => {
    const { confirmWithDetails } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("n");

    await confirmWithDetails("Deploy?", { showDetails: vi.fn() });

    expect(mockQuestion).toHaveBeenCalledWith(expect.stringContaining("[y/N/d]"));
  });

  it("degrades to a plain [y/N] confirm when no details callback", async () => {
    const { confirmWithDetails } = await import("../lib/picker.js");
    mockQuestion.mockResolvedValueOnce("y");

    const result = await confirmWithDetails("Deploy?");

    expect(result).toBe(true);
    expect(mockQuestion).toHaveBeenCalledWith(expect.stringContaining("[y/N]"));
    expect(mockQuestion).not.toHaveBeenCalledWith(expect.stringContaining("[y/N/d]"));
  });

  it("does not treat 'd' as details when no callback (bails instead)", async () => {
    const { confirmWithDetails } = await import("../lib/picker.js");
    // Without a showDetails callback, 'd' is just "not yes" → false, single prompt.
    mockQuestion.mockResolvedValueOnce("d");

    const result = await confirmWithDetails("Deploy?");

    expect(result).toBe(false);
    expect(mockQuestion).toHaveBeenCalledTimes(1);
  });
});

describe("isInteractivePrompt", () => {
  let originalStdoutTTY: boolean | undefined;
  let originalStdinTTY: boolean | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsQuietMode.mockReturnValue(false);
    originalStdoutTTY = process.stdout.isTTY;
    originalStdinTTY = process.stdin.isTTY;
    // Default to TTY for tests that don't override it
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalStdoutTTY,
    });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: originalStdinTTY,
    });
  });

  it("returns true when TTY and no opt-out flags", async () => {
    const { isInteractivePrompt } = await import("../lib/picker.js");
    expect(isInteractivePrompt({})).toBe(true);
  });

  it("returns false when json: true", async () => {
    const { isInteractivePrompt } = await import("../lib/picker.js");
    expect(isInteractivePrompt({ json: true })).toBe(false);
  });

  it("returns false when quiet: true", async () => {
    const { isInteractivePrompt } = await import("../lib/picker.js");
    expect(isInteractivePrompt({ quiet: true })).toBe(false);
  });

  it("returns false when isQuietMode() is true", async () => {
    mockIsQuietMode.mockReturnValue(true);
    const { isInteractivePrompt } = await import("../lib/picker.js");
    expect(isInteractivePrompt({})).toBe(false);
  });

  it("returns false when stdout is not a TTY (piped)", async () => {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
    const { isInteractivePrompt } = await import("../lib/picker.js");
    expect(isInteractivePrompt({})).toBe(false);
  });

  it("returns false when stdin is not a TTY (piped input)", async () => {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    const { isInteractivePrompt } = await import("../lib/picker.js");
    expect(isInteractivePrompt({})).toBe(false);
  });

  it("returns false with no opts argument when stdout is not a TTY", async () => {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
    const { isInteractivePrompt } = await import("../lib/picker.js");
    expect(isInteractivePrompt()).toBe(false);
  });
});
