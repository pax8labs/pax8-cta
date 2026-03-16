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
import { Command } from "commander";
import { ConsoleCapture, containsText } from "./test-utils.js";

const mockQuestion = vi.fn();
const mockCloseInput = vi.fn();

vi.mock("../lib/input.js", () => ({
  question: (...args: unknown[]) => mockQuestion(...args),
  closeInput: (...args: unknown[]) => mockCloseInput(...args),
}));

import { parseCommandLine, startRepl } from "../lib/repl.js";

function createMockProgram(): Command {
  const program = new Command();
  program.command("test-cmd").action(() => {
    /* noop */
  });
  return program;
}

describe("REPL Module", () => {
  let consoleCapture: ConsoleCapture;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleCapture = new ConsoleCapture();
    consoleCapture.start();
  });

  afterEach(() => {
    consoleCapture.stop();
  });

  describe("parseCommandLine", () => {
    it("should split simple commands by spaces", () => {
      const result = parseCommandLine("agents list");
      expect(result).toEqual(["agents", "list"]);
    });

    it("should handle quoted strings", () => {
      const result = parseCommandLine('deploy --comment "this is a test"');
      expect(result).toEqual(["deploy", "--comment", "this is a test"]);
    });

    it("should handle single-quoted strings", () => {
      const result = parseCommandLine("tenants show 'Contoso Corp'");
      expect(result).toEqual(["tenants", "show", "Contoso Corp"]);
    });

    it("should handle empty input", () => {
      const result = parseCommandLine("");
      expect(result).toEqual([]);
    });

    it("should handle only whitespace", () => {
      const result = parseCommandLine("   ");
      expect(result).toEqual([]);
    });

    it("should handle multiple spaces between arguments", () => {
      const result = parseCommandLine("agents   list   --json");
      expect(result).toEqual(["agents", "list", "--json"]);
    });
  });

  describe("startRepl", () => {
    it('should exit on "exit" command', async () => {
      mockQuestion.mockResolvedValueOnce("exit");

      await startRepl(createMockProgram);

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "Goodbye!")).toBe(true);
      expect(mockCloseInput).toHaveBeenCalledTimes(1);
    });

    it('should exit on "quit" command', async () => {
      mockQuestion.mockResolvedValueOnce("quit");

      await startRepl(createMockProgram);

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "Goodbye!")).toBe(true);
      expect(mockCloseInput).toHaveBeenCalledTimes(1);
    });

    it("should skip empty input and continue prompting", async () => {
      mockQuestion.mockResolvedValueOnce("");
      mockQuestion.mockResolvedValueOnce("   ");
      mockQuestion.mockResolvedValueOnce("exit");

      await startRepl(createMockProgram);

      // question was called 3 times: empty, whitespace, then exit
      expect(mockQuestion).toHaveBeenCalledTimes(3);
      expect(mockCloseInput).toHaveBeenCalledTimes(1);
    });

    it("should dispatch commands to the commander program", async () => {
      const actionFn = vi.fn();

      function createProgramWithSpy(): Command {
        const program = new Command();
        program.command("test-cmd").action(actionFn);
        return program;
      }

      mockQuestion.mockResolvedValueOnce("test-cmd");
      mockQuestion.mockResolvedValueOnce("exit");

      await startRepl(createProgramWithSpy);

      expect(actionFn).toHaveBeenCalledTimes(1);
    });

    it("should handle unknown command errors gracefully", async () => {
      mockQuestion.mockResolvedValueOnce("nonexistent");
      mockQuestion.mockResolvedValueOnce("exit");

      await startRepl(createMockProgram);

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "Unknown command")).toBe(true);
    });

    it("should handle generic errors gracefully", async () => {
      function createFailingProgram(): Command {
        const program = new Command();
        program.command("fail-cmd").action(() => {
          throw new Error("Something went wrong");
        });
        return program;
      }

      mockQuestion.mockResolvedValueOnce("fail-cmd");
      mockQuestion.mockResolvedValueOnce("exit");

      await startRepl(createFailingProgram);

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "Something went wrong")).toBe(true);
    });
  });
});
