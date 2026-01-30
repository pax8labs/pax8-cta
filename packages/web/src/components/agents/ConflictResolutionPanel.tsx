'use client'

import type { UploadConflict } from '@/types/agent'

interface ConflictResolutionPanelProps {
  conflict: UploadConflict
  conflictMode: 'update' | 'create' | null
  onModeChange: (mode: 'update' | 'create') => void
  newAgentName: string
  onNewAgentNameChange: (name: string) => void
  newAgentFriendlyName: string
  onNewAgentFriendlyNameChange: (name: string) => void
}

export function ConflictResolutionPanel({
  conflict,
  conflictMode,
  onModeChange,
  newAgentName,
  onNewAgentNameChange,
  newAgentFriendlyName,
  onNewAgentFriendlyNameChange,
}: ConflictResolutionPanelProps) {
  return (
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-start gap-3">
        <svg className="w-6 h-6 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-amber-900">Agent Already Exists</p>
          <p className="text-xs text-amber-700 mt-1">
            An agent with the unique name <span className="font-mono bg-amber-100 px-1 rounded">{conflict.existingAgent.uniqueName}</span> already exists.
          </p>

          {/* Existing agent info */}
          <div className="mt-3 p-2 bg-white border border-amber-200 rounded text-xs">
            <p className="font-medium text-slate-700">Existing Agent:</p>
            <div className="mt-1 text-slate-600">
              <span className="font-medium">{conflict.existingAgent.friendlyName}</span>
              <span className="ml-2 text-slate-400">v{conflict.existingAgent.version}</span>
              {conflict.existingAgent.status === 'archived' && (
                <span className="ml-2 text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">archived</span>
              )}
            </div>
            <p className="text-slate-400 mt-1">Created: {new Date(conflict.existingAgent.createdAt).toLocaleDateString()}</p>
          </div>

          {/* New agent info */}
          <div className="mt-2 p-2 bg-white border border-amber-200 rounded text-xs">
            <p className="font-medium text-slate-700">Uploaded Solution:</p>
            <div className="mt-1 text-slate-600">
              <span className="font-medium">{conflict.newAgent.friendlyName}</span>
              <span className="ml-2 text-slate-400">v{conflict.newAgent.version}</span>
            </div>
          </div>

          {/* Resolution options */}
          <div className="mt-4 space-y-3">
            <p className="text-xs font-medium text-amber-800">Choose how to proceed:</p>

            {/* Option 1: Update existing */}
            <div
              onClick={() => onModeChange('update')}
              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                conflictMode === 'update'
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  conflictMode === 'update' ? 'border-blue-500' : 'border-slate-300'
                }`}>
                  {conflictMode === 'update' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                </div>
                <span className="text-sm font-medium text-slate-900">Update Existing Agent</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 ml-6">
                Replace the existing agent&apos;s solution with this new version.
                {conflict.existingAgent.status === 'archived' && ' The agent will also be reactivated.'}
              </p>
            </div>

            {/* Option 2: Create new with different name */}
            <div
              onClick={() => onModeChange('create')}
              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                conflictMode === 'create'
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  conflictMode === 'create' ? 'border-blue-500' : 'border-slate-300'
                }`}>
                  {conflictMode === 'create' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                </div>
                <span className="text-sm font-medium text-slate-900">Create as New Agent</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 ml-6">
                Keep the existing agent and create a new one with a different name.
              </p>

              {/* Name inputs (only shown when this option is selected) */}
              {conflictMode === 'create' && (
                <div className="mt-3 ml-6 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Unique Name</label>
                    <input
                      type="text"
                      value={newAgentName}
                      onChange={(e) => onNewAgentNameChange(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="e.g., MyAgent_v2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Display Name</label>
                    <input
                      type="text"
                      value={newAgentFriendlyName}
                      onChange={(e) => onNewAgentFriendlyNameChange(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="e.g., My Agent (Copy)"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
