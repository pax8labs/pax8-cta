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

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuestion = vi.fn();
const mockClose = vi.fn();

const mockRlInstance = {
  question: mockQuestion,
  close: mockClose,
  once: vi.fn(),
};

const mockCreateInterface = vi.fn(() => mockRlInstance);

vi.mock("node:readline/promises", () => ({
  createInterface: mockCreateInterface,
}));

describe("Input Module", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset the module so the internal `rl` variable is null again
    vi.resetModules();
  });

  async function loadInput() {
    // Re-apply the mock after resetModules
    vi.doMock("node:readline/promises", () => ({
      createInterface: mockCreateInterface,
    }));
    // Stub stdin methods that question() calls defensively
    if (!process.stdin.resume) process.stdin.resume = () => process.stdin;
    if (!process.stdin.ref) (process.stdin as any).ref = () => process.stdin;
    vi.spyOn(process.stdin, "resume").mockImplementation(() => process.stdin);
    vi.spyOn(process.stdin, "ref" as any).mockImplementation(() => process.stdin);
    return await import("../lib/input.js");
  }

  it("should create a readline interface on first question() call (lazy init)", async () => {
    const { question } = await loadInput();

    mockQuestion.mockResolvedValueOnce("answer");

    await question("prompt: ");

    expect(mockCreateInterface).toHaveBeenCalledTimes(1);
    expect(mockCreateInterface).toHaveBeenCalledWith({
      input: process.stdin,
      output: process.stdout,
    });
    expect(mockQuestion).toHaveBeenCalledWith("prompt: ");
  });

  it("should reuse the same interface on subsequent question() calls (singleton)", async () => {
    const { question } = await loadInput();

    mockQuestion.mockResolvedValueOnce("first");
    mockQuestion.mockResolvedValueOnce("second");

    await question("q1: ");
    await question("q2: ");

    expect(mockCreateInterface).toHaveBeenCalledTimes(1);
    expect(mockQuestion).toHaveBeenCalledTimes(2);
  });

  it("should clean up when closeInput() is called", async () => {
    const { question, closeInput } = await loadInput();

    mockQuestion.mockResolvedValueOnce("answer");
    await question("prompt: ");

    expect(mockCreateInterface).toHaveBeenCalledTimes(1);

    closeInput();

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("should create a fresh interface after closeInput() on next question()", async () => {
    const { question, closeInput } = await loadInput();

    mockQuestion.mockResolvedValueOnce("first");
    await question("q1: ");

    expect(mockCreateInterface).toHaveBeenCalledTimes(1);

    closeInput();

    mockQuestion.mockResolvedValueOnce("second");
    await question("q2: ");

    expect(mockCreateInterface).toHaveBeenCalledTimes(2);
  });

  it("should handle multiple sequential question() calls correctly", async () => {
    const { question } = await loadInput();

    mockQuestion.mockResolvedValueOnce("alpha");
    mockQuestion.mockResolvedValueOnce("beta");
    mockQuestion.mockResolvedValueOnce("gamma");

    const r1 = await question("first: ");
    const r2 = await question("second: ");
    const r3 = await question("third: ");

    expect(r1).toBe("alpha");
    expect(r2).toBe("beta");
    expect(r3).toBe("gamma");
    expect(mockCreateInterface).toHaveBeenCalledTimes(1);
    expect(mockQuestion).toHaveBeenCalledTimes(3);
  });

  it("should fall back to question() for hidden prompts in non-TTY environments", async () => {
    const { questionHidden } = await loadInput();

    mockQuestion.mockResolvedValueOnce("secret-value");

    const value = await questionHidden("secret: ");

    expect(value).toBe("secret-value");
    expect(mockQuestion).toHaveBeenCalledWith("secret: ");
  });

  it("should close active readline before hidden prompt in TTY mode", async () => {
    const { question, questionHidden } = await loadInput();

    mockQuestion.mockResolvedValueOnce("answer");
    await question("prompt: ");

    const isTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    const originalIsTTY = process.stdin.isTTY;
    const stdin = process.stdin as NodeJS.ReadStream & {
      setRawMode?: (mode: boolean) => void;
    };
    const setRawModeDescriptor = Object.getOwnPropertyDescriptor(stdin, "setRawMode");
    const originalSetRawMode = stdin.setRawMode;
    const setRawModeSpy = vi.fn();
    const stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(stdin, "setRawMode", { configurable: true, value: setRawModeSpy });

    try {
      const hiddenPromise = questionHidden("hidden: ");
      process.stdin.emit("data", Buffer.from("top-secret\n"));

      const value = await hiddenPromise;

      expect(value).toBe("top-secret");
      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(setRawModeSpy).toHaveBeenCalledWith(true);
      expect(setRawModeSpy).toHaveBeenCalledWith(false);
      expect(stdoutWriteSpy).toHaveBeenCalledWith("hidden: ");
    } finally {
      stdoutWriteSpy.mockRestore();
      if (isTTYDescriptor) {
        Object.defineProperty(process.stdin, "isTTY", isTTYDescriptor);
      } else {
        Object.defineProperty(process.stdin, "isTTY", {
          configurable: true,
          writable: true,
          value: originalIsTTY,
        });
      }
      if (setRawModeDescriptor) {
        Object.defineProperty(stdin, "setRawMode", setRawModeDescriptor);
      } else {
        Object.defineProperty(stdin, "setRawMode", {
          configurable: true,
          writable: true,
          value: originalSetRawMode,
        });
      }
    }
  });

  it("should handle pasted hidden input chunks with newline and backspace", async () => {
    const { questionHidden } = await loadInput();

    const isTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    const originalIsTTY = process.stdin.isTTY;
    const stdin = process.stdin as NodeJS.ReadStream & {
      setRawMode?: (mode: boolean) => void;
    };
    const setRawModeDescriptor = Object.getOwnPropertyDescriptor(stdin, "setRawMode");
    const originalSetRawMode = stdin.setRawMode;
    const setRawModeSpy = vi.fn();
    const stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(stdin, "setRawMode", { configurable: true, value: setRawModeSpy });

    try {
      const hiddenPromise = questionHidden("hidden: ");
      process.stdin.emit("data", Buffer.from("abc\x7fd\n"));

      const value = await hiddenPromise;

      expect(value).toBe("abd");
      expect(setRawModeSpy).toHaveBeenCalledWith(true);
      expect(setRawModeSpy).toHaveBeenCalledWith(false);
      expect(stdoutWriteSpy).toHaveBeenCalledWith("hidden: ");
    } finally {
      stdoutWriteSpy.mockRestore();
      if (isTTYDescriptor) {
        Object.defineProperty(process.stdin, "isTTY", isTTYDescriptor);
      } else {
        Object.defineProperty(process.stdin, "isTTY", {
          configurable: true,
          writable: true,
          value: originalIsTTY,
        });
      }
      if (setRawModeDescriptor) {
        Object.defineProperty(stdin, "setRawMode", setRawModeDescriptor);
      } else {
        Object.defineProperty(stdin, "setRawMode", {
          configurable: true,
          writable: true,
          value: originalSetRawMode,
        });
      }
    }
  });
});
