import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { calculateDuration, formatRelativeTime, formatTimestamp } from './utils'

describe('calculateDuration', () => {
  it('should return empty string when no startedAt', () => {
    expect(calculateDuration(undefined)).toBe('')
  })

  it('should return "<1s" for very short durations', () => {
    const now = new Date()
    const start = new Date(now.getTime() - 500).toISOString() // 500ms ago
    expect(calculateDuration(start, now.toISOString())).toBe('<1s')
  })

  it('should return seconds for durations under a minute', () => {
    const now = new Date()
    const start = new Date(now.getTime() - 45000).toISOString() // 45 seconds ago
    expect(calculateDuration(start, now.toISOString())).toBe('45s')
  })

  it('should return minutes and seconds for durations under an hour', () => {
    const now = new Date()
    const start = new Date(now.getTime() - 150000).toISOString() // 2.5 minutes ago
    expect(calculateDuration(start, now.toISOString())).toBe('2m 30s')
  })

  it('should return just minutes when seconds are 0', () => {
    const now = new Date()
    const start = new Date(now.getTime() - 120000).toISOString() // exactly 2 minutes ago
    expect(calculateDuration(start, now.toISOString())).toBe('2m')
  })

  it('should return hours and minutes for durations over an hour', () => {
    const now = new Date()
    const start = new Date(now.getTime() - 5400000).toISOString() // 1.5 hours ago
    expect(calculateDuration(start, now.toISOString())).toBe('1h 30m')
  })

  it('should return just hours when minutes are 0', () => {
    const now = new Date()
    const start = new Date(now.getTime() - 3600000).toISOString() // exactly 1 hour ago
    expect(calculateDuration(start, now.toISOString())).toBe('1h')
  })

  it('should calculate ongoing duration when completedAt is not provided', () => {
    const fakeNow = new Date('2024-01-15T12:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(fakeNow)

    const start = new Date('2024-01-15T11:58:00Z').toISOString() // 2 minutes before fakeNow
    expect(calculateDuration(start)).toBe('2m')

    vi.useRealTimers()
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return "—" when no dateString', () => {
    expect(formatRelativeTime(undefined)).toBe('—')
  })

  it('should return "just now" for very recent times', () => {
    const date = new Date('2024-01-15T11:59:45Z').toISOString() // 15 seconds ago
    expect(formatRelativeTime(date)).toBe('just now')
  })

  it('should return minutes ago for times under an hour', () => {
    const date = new Date('2024-01-15T11:30:00Z').toISOString() // 30 minutes ago
    expect(formatRelativeTime(date)).toBe('30m ago')
  })

  it('should return hours ago for times under a day', () => {
    const date = new Date('2024-01-15T07:00:00Z').toISOString() // 5 hours ago
    expect(formatRelativeTime(date)).toBe('5h ago')
  })

  it('should return days ago for times under a week', () => {
    const date = new Date('2024-01-12T12:00:00Z').toISOString() // 3 days ago
    expect(formatRelativeTime(date)).toBe('3d ago')
  })

  it('should return formatted date for older times', () => {
    const date = new Date('2024-01-01T12:00:00Z').toISOString() // 14 days ago
    const result = formatRelativeTime(date)
    expect(result).toContain('Jan')
    expect(result).toContain('1')
  })
})

describe('formatTimestamp', () => {
  it('should return empty string when no dateString', () => {
    expect(formatTimestamp(undefined)).toBe('')
  })

  it('should format a timestamp with hours, minutes, and seconds', () => {
    const date = new Date('2024-01-15T14:30:45Z').toISOString()
    const result = formatTimestamp(date)
    // The exact format depends on locale, but should contain the time components
    expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/)
  })
})
