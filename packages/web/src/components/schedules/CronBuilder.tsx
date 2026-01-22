'use client'

import React, { useState, useEffect } from 'react'
import { Calendar, Clock } from 'lucide-react'

interface CronBuilderProps {
  value: string
  onChange: (cron: string) => void
  timezone?: string
}

const PRESETS = [
  { label: 'Every day at midnight', value: '0 0 * * *', description: 'Runs once daily at 12:00 AM' },
  { label: 'Every day at 2 AM', value: '0 2 * * *', description: 'Runs once daily at 2:00 AM' },
  { label: 'Every weekday at 6 AM', value: '0 6 * * 1-5', description: 'Monday-Friday at 6:00 AM' },
  { label: 'Every Sunday at 3 AM', value: '0 3 * * 0', description: 'Weekly on Sunday at 3:00 AM' },
  { label: 'First day of month at midnight', value: '0 0 1 * *', description: 'Monthly on the 1st at 12:00 AM' },
  { label: 'Every 6 hours', value: '0 */6 * * *', description: 'Every 6 hours starting at midnight' },
  { label: 'Custom', value: '', description: 'Enter your own cron expression' },
]

export function CronBuilder({ value, onChange, timezone = 'UTC' }: CronBuilderProps) {
  const [selectedPreset, setSelectedPreset] = useState('')
  const [customCron, setCustomCron] = useState(value)
  const [nextRuns, setNextRuns] = useState<string[]>([])

  // Initialize preset selection based on value
  useEffect(() => {
    const preset = PRESETS.find(p => p.value === value)
    if (preset) {
      setSelectedPreset(preset.value)
    } else if (value) {
      setSelectedPreset('') // Custom
      setCustomCron(value)
    }
  }, [])

  // Calculate next runs when cron changes
  useEffect(() => {
    if (value) {
      calculateNextRuns(value)
    }
  }, [value, timezone])

  const calculateNextRuns = async (cron: string) => {
    try {
      // This would call an API endpoint to calculate next runs
      // For now, we'll just show placeholder
      setNextRuns([])
    } catch (error) {
      console.error('Failed to calculate next runs:', error)
      setNextRuns([])
    }
  }

  const handlePresetChange = (presetValue: string) => {
    setSelectedPreset(presetValue)
    if (presetValue) {
      onChange(presetValue)
      setCustomCron(presetValue)
    }
  }

  const handleCustomChange = (newCron: string) => {
    setCustomCron(newCron)
    onChange(newCron)
  }

  const isCustom = selectedPreset === ''

  return (
    <div className="space-y-4">
      {/* Preset Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Quick Presets
        </label>
        <div className="grid grid-cols-1 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handlePresetChange(preset.value)}
              className={`text-left px-4 py-3 rounded-lg border-2 transition-all ${
                selectedPreset === preset.value || (isCustom && preset.value === '')
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {preset.value === '' ? (
                      <Calendar className="w-4 h-4 text-gray-500" />
                    ) : (
                      <Clock className="w-4 h-4 text-gray-500" />
                    )}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {preset.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                    {preset.description}
                  </p>
                </div>
                {preset.value && (
                  <code className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded font-mono text-gray-600 dark:text-gray-400">
                    {preset.value}
                  </code>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Cron Input */}
      {isCustom && (
        <div>
          <label
            htmlFor="custom-cron"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Custom Cron Expression
          </label>
          <input
            id="custom-cron"
            type="text"
            value={customCron}
            onChange={(e) => handleCustomChange(e.target.value)}
            placeholder="0 0 * * *"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Format: minute hour day month weekday (e.g., <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">0 2 * * *</code> = 2 AM daily)
          </p>
        </div>
      )}

      {/* Cron Reference Card */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Cron Format Reference</h4>
        <div className="space-y-1 text-gray-600 dark:text-gray-400 font-mono">
          <div className="grid grid-cols-5 gap-2 font-semibold">
            <span>Minute</span>
            <span>Hour</span>
            <span>Day</span>
            <span>Month</span>
            <span>Weekday</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            <span>0-59</span>
            <span>0-23</span>
            <span>1-31</span>
            <span>1-12</span>
            <span>0-6</span>
          </div>
        </div>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          Use <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">*</code> for any value,{' '}
          <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">*/n</code> for every n,{' '}
          <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">a-b</code> for range
        </p>
      </div>

      {/* Preview Next Runs */}
      {value && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Current Expression
          </h4>
          <code className="block px-3 py-2 bg-white dark:bg-gray-800 rounded text-sm font-mono text-gray-900 dark:text-white border border-blue-200 dark:border-blue-800">
            {value}
          </code>
          <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
            Timezone: {timezone}
          </p>
        </div>
      )}
    </div>
  )
}
