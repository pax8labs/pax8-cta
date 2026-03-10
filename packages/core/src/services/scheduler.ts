/**
 * Copyright 2024 Pax8 Labs
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

import { Schedule } from "../config/schema.js";

/**
 * Parsed cron expression
 */
interface ParsedCron {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

/**
 * Service for scheduled deployment operations
 */
export class SchedulerService {
  /**
   * Check if a deployment is allowed within the maintenance window
   */
  isWithinMaintenanceWindow(schedule: Schedule, date: Date = new Date()): boolean {
    if (!schedule.maintenanceWindow) {
      return true; // No maintenance window = always allowed
    }

    const { start, end, daysOfWeek } = schedule.maintenanceWindow;

    // Convert to target timezone
    const targetDate = this.convertToTimezone(date, schedule.timezone || "UTC");

    // Check day of week
    if (daysOfWeek && daysOfWeek.length > 0) {
      const dayOfWeek = targetDate.getDay();
      if (!daysOfWeek.includes(dayOfWeek)) {
        return false;
      }
    }

    // Parse start and end times
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);

    const currentHour = targetDate.getHours();
    const currentMinute = targetDate.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    const startTimeMinutes = startHour * 60 + startMinute;
    const endTimeMinutes = endHour * 60 + endMinute;

    // Handle windows that span midnight
    if (startTimeMinutes > endTimeMinutes) {
      // Window spans midnight (e.g., 22:00 - 06:00)
      return currentTimeMinutes >= startTimeMinutes || currentTimeMinutes < endTimeMinutes;
    }

    // Normal window (e.g., 02:00 - 06:00)
    return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes;
  }

  /**
   * Get the next maintenance window start time
   */
  getNextMaintenanceWindow(schedule: Schedule, from: Date = new Date()): Date | null {
    if (!schedule.maintenanceWindow) {
      return null;
    }

    const { start, daysOfWeek } = schedule.maintenanceWindow;
    const [startHour, startMinute] = start.split(":").map(Number);

    // Convert to target timezone
    const targetDate = this.convertToTimezone(from, schedule.timezone || "UTC");

    // Start from the current day
    const candidate = new Date(targetDate);
    candidate.setHours(startHour, startMinute, 0, 0);

    // If we're past today's window start, move to tomorrow
    if (candidate <= targetDate) {
      candidate.setDate(candidate.getDate() + 1);
    }

    // Find the next valid day
    for (let i = 0; i < 7; i++) {
      const dayOfWeek = candidate.getDay();

      if (!daysOfWeek || daysOfWeek.length === 0 || daysOfWeek.includes(dayOfWeek)) {
        // Convert back to local time
        return this.convertFromTimezone(candidate, schedule.timezone || "UTC");
      }

      candidate.setDate(candidate.getDate() + 1);
    }

    return null;
  }

  /**
   * Parse a cron expression
   */
  parseCron(cron: string): ParsedCron | null {
    const parts = cron.trim().split(/\s+/);

    if (parts.length !== 5) {
      return null;
    }

    try {
      return {
        minutes: this.parseCronPart(parts[0], 0, 59),
        hours: this.parseCronPart(parts[1], 0, 23),
        daysOfMonth: this.parseCronPart(parts[2], 1, 31),
        months: this.parseCronPart(parts[3], 1, 12),
        daysOfWeek: this.parseCronPart(parts[4], 0, 6),
      };
    } catch {
      return null;
    }
  }

  /**
   * Get the next scheduled run time based on cron expression
   */
  getNextCronRun(schedule: Schedule, from: Date = new Date()): Date | null {
    if (!schedule.cron) {
      return null;
    }

    const parsed = this.parseCron(schedule.cron);
    if (!parsed) {
      throw new Error(`Invalid cron expression: ${schedule.cron}`);
    }

    // Convert to target timezone
    const targetDate = this.convertToTimezone(from, schedule.timezone || "UTC");

    // Start from the next minute
    const candidate = new Date(targetDate);
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);

    // Search for up to 1 year
    const maxIterations = 366 * 24 * 60;

    for (let i = 0; i < maxIterations; i++) {
      if (this.matchesCron(candidate, parsed)) {
        // Also check maintenance window if configured
        if (!schedule.maintenanceWindow || this.isWithinMaintenanceWindow(schedule, candidate)) {
          return this.convertFromTimezone(candidate, schedule.timezone || "UTC");
        }
      }

      candidate.setMinutes(candidate.getMinutes() + 1);
    }

    return null;
  }

  /**
   * Check if a date matches a cron expression
   */
  matchesCron(date: Date, cron: ParsedCron): boolean {
    return (
      cron.minutes.includes(date.getMinutes()) &&
      cron.hours.includes(date.getHours()) &&
      cron.daysOfMonth.includes(date.getDate()) &&
      cron.months.includes(date.getMonth() + 1) &&
      cron.daysOfWeek.includes(date.getDay())
    );
  }

  /**
   * Validate a cron expression
   */
  validateCron(cron: string): { valid: boolean; error?: string } {
    const parts = cron.trim().split(/\s+/);

    if (parts.length !== 5) {
      return {
        valid: false,
        error: `Expected 5 parts, got ${parts.length}`,
      };
    }

    const names = ["minute", "hour", "day of month", "month", "day of week"];
    const ranges: [number, number][] = [
      [0, 59],
      [0, 23],
      [1, 31],
      [1, 12],
      [0, 6],
    ];

    for (let i = 0; i < 5; i++) {
      try {
        this.parseCronPart(parts[i], ranges[i][0], ranges[i][1]);
      } catch (error) {
        return {
          valid: false,
          error: `Invalid ${names[i]}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Parse a single part of a cron expression
   */
  private parseCronPart(part: string, min: number, max: number): number[] {
    const values: number[] = [];

    // Handle wildcards
    if (part === "*") {
      for (let i = min; i <= max; i++) {
        values.push(i);
      }
      return values;
    }

    // Handle comma-separated values
    const segments = part.split(",");

    for (const segment of segments) {
      // Handle step values (e.g., */5 or 0-30/5)
      if (segment.includes("/")) {
        const [range, stepStr] = segment.split("/");
        const step = parseInt(stepStr, 10);

        if (isNaN(step) || step < 1) {
          throw new Error(`Invalid step value: ${stepStr}`);
        }

        let rangeMin = min;
        let rangeMax = max;

        if (range !== "*") {
          if (range.includes("-")) {
            const [rMin, rMax] = range.split("-").map(Number);
            rangeMin = rMin;
            rangeMax = rMax;
          } else {
            rangeMin = parseInt(range, 10);
            rangeMax = max;
          }
        }

        for (let i = rangeMin; i <= rangeMax; i += step) {
          if (i >= min && i <= max && !values.includes(i)) {
            values.push(i);
          }
        }
      }
      // Handle ranges (e.g., 0-5)
      else if (segment.includes("-")) {
        const [rangeMin, rangeMax] = segment.split("-").map(Number);

        if (isNaN(rangeMin) || isNaN(rangeMax)) {
          throw new Error(`Invalid range: ${segment}`);
        }

        for (let i = rangeMin; i <= rangeMax; i++) {
          if (i >= min && i <= max && !values.includes(i)) {
            values.push(i);
          }
        }
      }
      // Handle single values
      else {
        const value = parseInt(segment, 10);

        if (isNaN(value)) {
          throw new Error(`Invalid value: ${segment}`);
        }

        if (value >= min && value <= max && !values.includes(value)) {
          values.push(value);
        }
      }
    }

    if (values.length === 0) {
      throw new Error(`No valid values in range ${min}-${max}`);
    }

    return values.sort((a, b) => a - b);
  }

  /**
   * Convert a date to a specific timezone
   */
  private convertToTimezone(date: Date, timezone: string): Date {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const values: Record<string, number> = {};

    for (const part of parts) {
      if (part.type !== "literal") {
        values[part.type] = parseInt(part.value, 10);
      }
    }

    return new Date(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second
    );
  }

  /**
   * Convert a date from a specific timezone to local
   */
  private convertFromTimezone(date: Date, timezone: string): Date {
    // Get the offset for the target timezone
    const targetStr = date.toLocaleString("en-US", { timeZone: timezone });
    const localStr = date.toLocaleString("en-US");

    const targetDate = new Date(targetStr);
    const localDate = new Date(localStr);

    const offset = localDate.getTime() - targetDate.getTime();

    return new Date(date.getTime() + offset);
  }

  /**
   * Create a human-readable description of a cron expression
   */
  describeCron(cron: string): string {
    const parsed = this.parseCron(cron);
    if (!parsed) {
      return "Invalid cron expression";
    }

    const parts: string[] = [];

    // Minutes
    if (parsed.minutes.length === 60) {
      parts.push("every minute");
    } else if (parsed.minutes.length === 1) {
      parts.push(`at minute ${parsed.minutes[0]}`);
    } else {
      parts.push(`at minutes ${parsed.minutes.join(", ")}`);
    }

    // Hours
    if (parsed.hours.length === 24) {
      parts.push("of every hour");
    } else if (parsed.hours.length === 1) {
      parts.push(`of ${parsed.hours[0]}:00`);
    } else {
      parts.push(`of hours ${parsed.hours.join(", ")}`);
    }

    // Days of week
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    if (parsed.daysOfWeek.length < 7) {
      parts.push(`on ${parsed.daysOfWeek.map((d) => dayNames[d]).join(", ")}`);
    }

    // Months
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    if (parsed.months.length < 12) {
      parts.push(`in ${parsed.months.map((m) => monthNames[m - 1]).join(", ")}`);
    }

    return parts.join(" ");
  }

  /**
   * Generate next N scheduled run times
   */
  getNextRuns(schedule: Schedule, count: number = 5): Date[] {
    const runs: Date[] = [];
    let from = new Date();

    for (let i = 0; i < count; i++) {
      const next = this.getNextCronRun(schedule, from);
      if (!next) break;

      runs.push(next);
      from = new Date(next.getTime() + 60000); // Add 1 minute
    }

    return runs;
  }
}
