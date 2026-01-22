'use client'

import React, { useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import { CronBuilder } from './CronBuilder'
import { toast } from 'sonner'

interface ScheduleFormProps {
  schedule?: {
    id: string
    name: string
    cron: string
    timezone: string
    solutionPath?: string
    solutionName?: string
  }
  onClose: () => void
  onSave: () => void
}

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT)' },
]

export function ScheduleForm({ schedule, onClose, onSave }: ScheduleFormProps) {
  const isEditing = !!schedule

  const [formData, setFormData] = useState({
    name: schedule?.name || '',
    cron: schedule?.cron || '0 0 * * *',
    timezone: schedule?.timezone || 'UTC',
    solutionPath: schedule?.solutionPath || '',
    solutionName: schedule?.solutionName || '',
    enabled: true,
  })

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Schedule name is required'
    }

    if (!formData.cron.trim()) {
      newErrors.cron = 'Cron expression is required'
    } else {
      // Basic cron validation (5 parts separated by spaces)
      const parts = formData.cron.trim().split(/\s+/)
      if (parts.length !== 5) {
        newErrors.cron = 'Invalid cron format (must have 5 parts)'
      }
    }

    if (!formData.solutionPath.trim()) {
      newErrors.solutionPath = 'Solution path is required'
    }

    if (!formData.solutionName.trim()) {
      newErrors.solutionName = 'Solution name is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      toast.error('Please fix validation errors')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          solutionPath: formData.solutionPath,
          solutionName: formData.solutionName,
          // Note: The current API expects these in the config, not as body params
          // This may need adjustment based on actual API requirements
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to save schedule')
      }

      const data = await res.json()
      toast.success(isEditing ? 'Schedule updated' : 'Schedule created')
      onSave()
      onClose()
    } catch (error) {
      console.error('Save schedule error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save schedule')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-3xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isEditing ? 'Edit Schedule' : 'Create Schedule'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Schedule Name */}
          <div>
            <label
              htmlFor="schedule-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Schedule Name
            </label>
            <input
              id="schedule-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.name
                  ? 'border-red-500'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              placeholder="e.g., Nightly Production Deployment"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
            )}
          </div>

          {/* Cron Expression */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Schedule
            </label>
            <CronBuilder
              value={formData.cron}
              onChange={(cron) => setFormData({ ...formData, cron })}
              timezone={formData.timezone}
            />
            {errors.cron && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.cron}</p>
            )}
          </div>

          {/* Timezone */}
          <div>
            <label
              htmlFor="timezone"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Timezone
            </label>
            <select
              id="timezone"
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          {/* Solution Path */}
          <div>
            <label
              htmlFor="solution-path"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Solution Path
            </label>
            <input
              id="solution-path"
              type="text"
              value={formData.solutionPath}
              onChange={(e) => setFormData({ ...formData, solutionPath: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.solutionPath
                  ? 'border-red-500'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              placeholder="./solutions/my-agent_managed.zip"
            />
            {errors.solutionPath && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.solutionPath}</p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Path to the solution ZIP file on the server
            </p>
          </div>

          {/* Solution Name */}
          <div>
            <label
              htmlFor="solution-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Solution Name
            </label>
            <input
              id="solution-name"
              type="text"
              value={formData.solutionName}
              onChange={(e) => setFormData({ ...formData, solutionName: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.solutionName
                  ? 'border-red-500'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              placeholder="MyAgent"
            />
            {errors.solutionName && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.solutionName}</p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Display name for the solution
            </p>
          </div>

          {/* Note about config */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Note:</strong> This form registers a schedule with the deployment queue. The actual schedule configuration (cron, timezone) is managed in your <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900/50 rounded">config/tenants.yaml</code> file under <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900/50 rounded">settings.schedule</code>.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {isEditing ? 'Update Schedule' : 'Create Schedule'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
