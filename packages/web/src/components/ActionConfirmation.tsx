'use client'

import { useState } from 'react'
import { ChatAction } from '@/types/chat'

export const SKIP_CONFIRMATIONS_KEY = 'agentsync-skip-confirmations'

interface ActionConfirmationProps {
  action: ChatAction
  message: string
  onConfirm: () => void
  onCancel: () => void
  isExecuting?: boolean
}

export function ActionConfirmation({
  action,
  message,
  onConfirm,
  onCancel,
  isExecuting = false,
}: ActionConfirmationProps) {
  const [skipFuture, setSkipFuture] = useState(false)
  const isDestructive = action.type === 'cancel'

  const handleConfirm = () => {
    if (skipFuture) {
      localStorage.setItem(SKIP_CONFIRMATIONS_KEY, 'true')
    }
    onConfirm()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Confirm Action
          </h3>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {message}
          </p>

          {isDestructive && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-300 font-medium">
                ⚠️ This action cannot be undone
              </p>
            </div>
          )}
        </div>

        {/* Don't ask again checkbox (only for non-destructive actions) */}
        {!isDestructive && (
          <div className="px-6 pb-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={skipFuture}
                onChange={(e) => setSkipFuture(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              Don't ask again for deployments
            </label>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isExecuting}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isExecuting}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isExecuting ? 'Executing...' : action.label}
          </button>
        </div>
      </div>
    </div>
  )
}
