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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConsoleCapture, stripAnsi } from "./test-utils.js";
import {
  setPirateMode,
  isPirateMode,
  pirate,
  pirateSpinner,
  pirateSuccessQuip,
  pirateFailureQuip,
  pirateFarewell,
  showPirateBanner,
  showPirateWelcome,
  showPirateCompactBanner,
} from "../lib/theme.js";

describe("Pirate Mode", () => {
  beforeEach(() => {
    setPirateMode(false);
  });

  afterEach(() => {
    setPirateMode(false);
  });

  describe("setPirateMode / isPirateMode", () => {
    it("should default to off", () => {
      expect(isPirateMode()).toBe(false);
    });

    it("should toggle on", () => {
      setPirateMode(true);
      expect(isPirateMode()).toBe(true);
    });

    it("should toggle off", () => {
      setPirateMode(true);
      setPirateMode(false);
      expect(isPirateMode()).toBe(false);
    });
  });

  describe("pirateSpinner", () => {
    it("should pass through when pirate mode is off", () => {
      expect(pirateSpinner("Loading configuration...")).toBe("Loading configuration...");
    });

    it("should translate known spinner messages", () => {
      setPirateMode(true);
      expect(pirateSpinner("Loading configuration...")).toBe("Consultin' the treasure map...");
      expect(pirateSpinner("Loading manifest...")).toBe("Unrollin' the treasure map...");
      expect(pirateSpinner("Establishing shipping route...")).toBe("Chartin' the course...");
      expect(pirateSpinner("Connecting to shipping dock...")).toBe("Rowin' to the dock...");
      expect(pirateSpinner("Checking health...")).toBe("Checkin' the crew for scurvy...");
    });

    it("should apply word swaps to unknown messages", () => {
      setPirateMode(true);
      expect(pirateSpinner("Deploying to Contoso...")).toContain("Sailin' to");
    });
  });

  describe("pirate", () => {
    it("should pass through when pirate mode is off", () => {
      expect(pirate("Deployment Summary:")).toBe("Deployment Summary:");
    });

    it("should translate when pirate mode is on", () => {
      setPirateMode(true);
      expect(pirate("Deployment Summary:")).toContain("Plunder Report");
    });

    it("should translate shipping metaphors", () => {
      setPirateMode(true);
      expect(pirate("Shipping Destinations (5):")).toContain("Ports to Plunder");
      expect(pirate("Shipment dispatched successfully")).toContain("fleet has set sail");
      expect(pirate("Deploying directly to destinations")).toContain("Plunderin' the ports");
    });

    it("should translate status words", () => {
      setPirateMode(true);
      expect(pirate("Failed")).toBe("Sunk");
      expect(pirate("Success")).toBe("Plundered");
      expect(pirate("Error")).toBe("Blimey");
      expect(pirate("Warning")).toBe("Avast");
    });
  });

  describe("quips and farewells", () => {
    it("should return a success quip string", () => {
      const quip = pirateSuccessQuip();
      expect(typeof quip).toBe("string");
      expect(quip.length).toBeGreaterThan(5);
    });

    it("should return a failure quip string", () => {
      const quip = pirateFailureQuip();
      expect(typeof quip).toBe("string");
      expect(quip.length).toBeGreaterThan(5);
    });

    it("should return a farewell string", () => {
      const farewell = pirateFarewell();
      expect(typeof farewell).toBe("string");
      expect(farewell.length).toBeGreaterThan(5);
    });
  });

  describe("showPirateBanner", () => {
    let consoleCapture: ConsoleCapture;

    beforeEach(() => {
      consoleCapture = new ConsoleCapture();
      consoleCapture.start();
    });

    afterEach(() => {
      consoleCapture.stop();
    });

    it("should display pirate-themed banner", () => {
      showPirateBanner();

      const output = stripAnsi(consoleCapture.getAllOutput());
      expect(output).toContain("AGENT");
      expect(output).toContain("SYNC");
      expect(output).toContain("seven seas");
      expect(output).toContain("~"); // Wave borders
    });

    it("should include version", () => {
      showPirateBanner("2.0.0");

      const output = stripAnsi(consoleCapture.getAllOutput());
      expect(output).toContain("v2.0.0");
    });
  });

  describe("showPirateWelcome", () => {
    let consoleCapture: ConsoleCapture;

    beforeEach(() => {
      consoleCapture = new ConsoleCapture();
      consoleCapture.start();
    });

    afterEach(() => {
      consoleCapture.stop();
    });

    it("should display pirate welcome", () => {
      showPirateWelcome();

      const output = stripAnsi(consoleCapture.getAllOutput());
      expect(output).toContain("Ahoy");
      expect(output).toContain("Plunder all ports");
      expect(output).toContain("Lost at sea");
    });
  });

  describe("showPirateCompactBanner", () => {
    let consoleCapture: ConsoleCapture;

    beforeEach(() => {
      consoleCapture = new ConsoleCapture();
      consoleCapture.start();
    });

    afterEach(() => {
      consoleCapture.stop();
    });

    it("should display compact pirate banner", () => {
      showPirateCompactBanner();

      const output = stripAnsi(consoleCapture.getAllOutput());
      expect(output).toContain("AgentSync");
      expect(output).toContain("Plunderin'");
      expect(output).toContain("~");
    });
  });
});
