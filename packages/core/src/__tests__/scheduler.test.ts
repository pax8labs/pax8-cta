import { describe, it, expect } from 'vitest';
import { SchedulerService } from '../services/scheduler.js';
import { Schedule } from '../config/schema.js';

describe('SchedulerService', () => {
  const scheduler = new SchedulerService();

  describe('parseCron', () => {
    it('should parse a simple cron expression', () => {
      const result = scheduler.parseCron('0 2 * * 6');
      expect(result).not.toBeNull();
      expect(result?.minutes).toEqual([0]);
      expect(result?.hours).toEqual([2]);
      expect(result?.daysOfWeek).toEqual([6]);
    });

    it('should parse wildcards', () => {
      const result = scheduler.parseCron('* * * * *');
      expect(result).not.toBeNull();
      expect(result?.minutes).toHaveLength(60);
      expect(result?.hours).toHaveLength(24);
    });

    it('should parse ranges', () => {
      const result = scheduler.parseCron('0-5 * * * *');
      expect(result).not.toBeNull();
      expect(result?.minutes).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('should parse step values', () => {
      const result = scheduler.parseCron('*/15 * * * *');
      expect(result).not.toBeNull();
      expect(result?.minutes).toEqual([0, 15, 30, 45]);
    });

    it('should parse comma-separated values', () => {
      const result = scheduler.parseCron('0,30 * * * *');
      expect(result).not.toBeNull();
      expect(result?.minutes).toEqual([0, 30]);
    });

    it('should return null for invalid cron', () => {
      expect(scheduler.parseCron('invalid')).toBeNull();
      expect(scheduler.parseCron('0 2 * *')).toBeNull();
    });
  });

  describe('validateCron', () => {
    it('should validate a correct cron expression', () => {
      const result = scheduler.validateCron('0 2 * * 6');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid minute values', () => {
      const result = scheduler.validateCron('60 * * * *');
      expect(result.valid).toBe(false);
    });

    it('should reject invalid hour values', () => {
      const result = scheduler.validateCron('* 25 * * *');
      expect(result.valid).toBe(false);
    });

    it('should reject invalid day of week values', () => {
      const result = scheduler.validateCron('* * * * 8');
      expect(result.valid).toBe(false);
    });
  });

  describe('describeCron', () => {
    it('should describe a cron expression', () => {
      const description = scheduler.describeCron('0 2 * * 6');
      expect(description).toContain('minute 0');
      expect(description).toContain('2:00');
      expect(description).toContain('Sat');
    });

    it('should handle every minute', () => {
      const description = scheduler.describeCron('* * * * *');
      expect(description).toContain('every minute');
    });
  });

  describe('isWithinMaintenanceWindow', () => {
    it('should return true when no maintenance window is configured', () => {
      const schedule: Schedule = {
        timezone: 'UTC',
      };

      expect(scheduler.isWithinMaintenanceWindow(schedule)).toBe(true);
    });

    it('should check time correctly within window', () => {
      const schedule: Schedule = {
        timezone: 'UTC',
        maintenanceWindow: {
          start: '02:00',
          end: '06:00',
        },
      };

      // Create a date at 3:00 AM UTC
      const date = new Date('2024-01-15T03:00:00.000Z');
      expect(scheduler.isWithinMaintenanceWindow(schedule, date)).toBe(true);
    });

    it('should check time correctly outside window', () => {
      const schedule: Schedule = {
        timezone: 'UTC',
        maintenanceWindow: {
          start: '02:00',
          end: '06:00',
        },
      };

      // Create a date at 10:00 AM UTC
      const date = new Date('2024-01-15T10:00:00.000Z');
      expect(scheduler.isWithinMaintenanceWindow(schedule, date)).toBe(false);
    });

    it('should check day of week', () => {
      const schedule: Schedule = {
        timezone: 'UTC',
        maintenanceWindow: {
          start: '02:00',
          end: '06:00',
          daysOfWeek: [0, 6], // Sunday and Saturday
        },
      };

      // Monday at 3:00 AM
      const monday = new Date('2024-01-15T03:00:00.000Z');
      expect(scheduler.isWithinMaintenanceWindow(schedule, monday)).toBe(false);

      // Saturday at 3:00 AM
      const saturday = new Date('2024-01-13T03:00:00.000Z');
      expect(scheduler.isWithinMaintenanceWindow(schedule, saturday)).toBe(true);
    });

    it('should handle overnight windows', () => {
      const schedule: Schedule = {
        timezone: 'UTC',
        maintenanceWindow: {
          start: '22:00',
          end: '06:00',
        },
      };

      // 23:00 should be within window
      const late = new Date('2024-01-15T23:00:00.000Z');
      expect(scheduler.isWithinMaintenanceWindow(schedule, late)).toBe(true);

      // 03:00 should be within window
      const early = new Date('2024-01-16T03:00:00.000Z');
      expect(scheduler.isWithinMaintenanceWindow(schedule, early)).toBe(true);

      // 10:00 should be outside window
      const day = new Date('2024-01-15T10:00:00.000Z');
      expect(scheduler.isWithinMaintenanceWindow(schedule, day)).toBe(false);
    });
  });

  describe('getNextCronRun', () => {
    it('should find the next run time', () => {
      const schedule: Schedule = {
        cron: '0 * * * *', // Every hour at minute 0
        timezone: 'UTC',
      };

      const from = new Date('2024-01-15T10:30:00.000Z');
      const next = scheduler.getNextCronRun(schedule, from);

      expect(next).not.toBeNull();
      expect(next?.getUTCMinutes()).toBe(0);
      expect(next?.getUTCHours()).toBe(11);
    });

    it('should return null when no cron is configured', () => {
      const schedule: Schedule = {
        timezone: 'UTC',
      };

      const next = scheduler.getNextCronRun(schedule);
      expect(next).toBeNull();
    });
  });

  describe('getNextRuns', () => {
    it('should return multiple scheduled run times', () => {
      const schedule: Schedule = {
        cron: '0 * * * *', // Every hour
        timezone: 'UTC',
      };

      const runs = scheduler.getNextRuns(schedule, 5);
      expect(runs).toHaveLength(5);

      // Each run should be 1 hour apart
      for (let i = 1; i < runs.length; i++) {
        const diff = runs[i].getTime() - runs[i - 1].getTime();
        expect(diff).toBe(3600000); // 1 hour in ms
      }
    });
  });
});
