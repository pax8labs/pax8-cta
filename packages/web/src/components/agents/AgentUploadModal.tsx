'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { FlaskSpinner } from '@/components/ui/flask-spinner'
import type { SolutionMetadata, UploadConflict, Environment, SourceSolution } from '@/types/agent'
import { ConflictResolutionPanel } from './ConflictResolutionPanel'
import { EnvironmentBrowser } from './EnvironmentBrowser'
import { SolutionPreview } from './SolutionPreview'

interface AgentUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function AgentUploadModal({ isOpen, onClose, onSuccess }: AgentUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importMode, setImportMode] = useState<'upload' | 'browse'>('upload')

  // Upload state
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadedMetadata, setUploadedMetadata] = useState<SolutionMetadata | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Conflict state
  const [uploadConflict, setUploadConflict] = useState<UploadConflict | null>(null)
  const [conflictMode, setConflictMode] = useState<'update' | 'create' | null>(null)
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentFriendlyName, setNewAgentFriendlyName] = useState('')
  const [resolvingConflict, setResolvingConflict] = useState(false)

  // Environment browser state
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [loadingEnvironments, setLoadingEnvironments] = useState(false)
  const [selectedEnvironment, setSelectedEnvironment] = useState<string | null>(null)
  const [sourceSolutions, setSourceSolutions] = useState<SourceSolution[]>([])
  const [loadingSourceSolutions, setLoadingSourceSolutions] = useState(false)
  const [sourceEnvironmentUrl, setSourceEnvironmentUrl] = useState<string | null>(null)
  const [showAgentsOnly, setShowAgentsOnly] = useState(true)
  const [importingFromSource, setImportingFromSource] = useState<string | null>(null)
  const [previewSolution, setPreviewSolution] = useState<SourceSolution | null>(null)

  // Handle Escape key to close modal
  const handleEscapeKey = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape' && !uploadingFile && !resolvingConflict && !importingFromSource) {
      onClose()
    }
  }, [onClose, uploadingFile, resolvingConflict, importingFromSource])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey)
      return () => document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isOpen, handleEscapeKey])

  if (!isOpen) return null

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      toast.error('Please select a .zip file exported from Copilot Studio')
      return
    }

    setSelectedFile(file)
    setUploadError(null)
    setUploadingFile(true)
    setUploadedMetadata(null)
    setUploadConflict(null)
    setConflictMode(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/solutions/upload', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json()

      if (result.conflict) {
        setUploadConflict({
          existingAgent: result.existingAgent,
          newAgent: result.newAgent,
          metadata: result.metadata,
          urlTemplates: result.urlTemplates,
          solutionBase64: result.solutionBase64,
        })
        setUploadedMetadata(result.metadata)
        setNewAgentName(result.metadata.uniqueName + '_v2')
        setNewAgentFriendlyName(result.metadata.friendlyName + ' (Copy)')
        return
      }

      if (!response.ok) throw new Error(result.error || 'Failed to parse solution')

      setUploadedMetadata(result.metadata)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process solution file'
      setUploadError(message)
      toast.error(message)
      setSelectedFile(null)
    } finally {
      setUploadingFile(false)
    }
  }

  const handleResolveConflict = async (action: 'update' | 'create') => {
    if (!uploadConflict) return

    setResolvingConflict(true)
    setUploadError(null)

    try {
      const response = await fetch('/api/solutions/upload/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          originalUniqueName: uploadConflict.existingAgent.uniqueName,
          newUniqueName: action === 'create' ? newAgentName : undefined,
          newFriendlyName: action === 'create' ? newAgentFriendlyName : undefined,
          metadata: uploadConflict.metadata,
          urlTemplates: uploadConflict.urlTemplates,
          solutionBase64: uploadConflict.solutionBase64,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to resolve conflict')

      toast.success('Agent saved successfully')
      handleClose()
      onSuccess()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resolve conflict'
      setUploadError(message)
      toast.error(message)
    } finally {
      setResolvingConflict(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleConfirmUpload = () => {
    toast.success('Agent added successfully')
    handleClose()
    onSuccess()
  }

  const handleCancelUpload = () => {
    setSelectedFile(null)
    setUploadedMetadata(null)
    setUploadError(null)
    setUploadConflict(null)
    setConflictMode(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClose = () => {
    handleCancelUpload()
    setImportMode('upload')
    onClose()
  }

  const loadEnvironments = async () => {
    setLoadingEnvironments(true)
    try {
      const response = await fetch('/api/environments')
      const data = await response.json()
      if (data.environments) {
        setEnvironments(data.environments)
        if (data.environments.length > 0 && !selectedEnvironment) {
          const defaultEnv = data.environments.find((e: Environment) => e.isDefault) || data.environments[0]
          const envUrl = defaultEnv.instanceUrl || defaultEnv.environmentUrl
          setSelectedEnvironment(envUrl)
          loadSourceSolutions(envUrl)
        }
      }
    } catch (err) {
      console.error('Failed to load environments:', err)
      toast.error('Failed to load environments')
    } finally {
      setLoadingEnvironments(false)
    }
  }

  const loadSourceSolutions = async (envUrl?: string) => {
    const url = envUrl || selectedEnvironment
    if (!url) return

    setLoadingSourceSolutions(true)
    setSourceSolutions([])
    try {
      const params = new URLSearchParams()
      params.set('environmentUrl', url)
      if (showAgentsOnly) {
        params.set('botsOnly', 'true')
      }
      const response = await fetch(`/api/solutions/source?${params.toString()}`)
      const data = await response.json()
      if (data.solutions) {
        setSourceSolutions(data.solutions)
        setSourceEnvironmentUrl(data.sourceEnvironment)
      }
    } catch (err) {
      console.error('Failed to load source solutions:', err)
      toast.error('Failed to load solutions')
    } finally {
      setLoadingSourceSolutions(false)
    }
  }

  const handleImportFromSource = async (solution: SourceSolution) => {
    setImportingFromSource(solution.uniqueName)
    setUploadError(null)
    try {
      const response = await fetch('/api/solutions/import-from-environment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solutionUniqueName: solution.uniqueName,
          environmentUrl: sourceEnvironmentUrl,
          displayName: solution.name,
          description: solution.description,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to import')

      toast.success('Agent imported successfully')
      handleClose()
      onSuccess()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import solution'
      setUploadError(message)
      toast.error(message)
    } finally {
      setImportingFromSource(null)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-agent-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 id="import-agent-title" className="font-medium text-slate-900">Import Agent</h3>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close import dialog"
          >
            ✕
          </button>
        </div>

        {/* Import Mode Tabs */}
        <div className="border-b border-slate-200">
          <div className="flex">
            <button
              onClick={() => setImportMode('upload')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                importMode === 'upload'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Upload ZIP
            </button>
            <button
              onClick={() => {
                setImportMode('browse')
                if (environments.length === 0) loadEnvironments()
              }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                importMode === 'browse'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Browse Power Platform
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {uploadError && (
            <div className="p-2 bg-rose-50 border border-rose-200 rounded text-sm text-rose-700">{uploadError}</div>
          )}

          {/* Browse from Power Platform */}
          {importMode === 'browse' && (
            <EnvironmentBrowser
              environments={environments}
              loadingEnvironments={loadingEnvironments}
              selectedEnvironment={selectedEnvironment}
              onEnvironmentChange={(url) => {
                setSelectedEnvironment(url)
                loadSourceSolutions(url)
              }}
              solutions={sourceSolutions}
              loadingSolutions={loadingSourceSolutions}
              showAgentsOnly={showAgentsOnly}
              onShowAgentsOnlyChange={(checked) => {
                setShowAgentsOnly(checked)
                if (selectedEnvironment) {
                  setTimeout(() => loadSourceSolutions(selectedEnvironment), 0)
                }
              }}
              importingId={importingFromSource}
              onImport={handleImportFromSource}
              onPreview={setPreviewSolution}
            />
          )}

          {/* Solution Preview Modal */}
          {previewSolution && (
            <SolutionPreview
              solution={previewSolution}
              selectedEnvironment={selectedEnvironment}
              importingId={importingFromSource}
              onClose={() => setPreviewSolution(null)}
              onImport={() => {
                handleImportFromSource(previewSolution)
                setPreviewSolution(null)
              }}
            />
          )}

          {/* File upload area */}
          {importMode === 'upload' && !uploadedMetadata && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-slate-400'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="hidden"
                id="solution-file-input"
              />
              {uploadingFile ? (
                <div className="py-4">
                  <FlaskSpinner size="sm" message="Parsing solution..." />
                </div>
              ) : (
                <>
                  <svg className="w-10 h-10 text-slate-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-slate-600 mb-2">
                    Drag & drop your solution .zip file here
                  </p>
                  <p className="text-xs text-slate-400 mb-3">or</p>
                  <label
                    htmlFor="solution-file-input"
                    className="inline-block px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    Browse files
                  </label>
                  <p className="text-xs text-slate-400 mt-4">
                    Export your agent from Copilot Studio as a managed solution
                  </p>
                </>
              )}
            </div>
          )}

          {/* Conflict resolution UI */}
          {importMode === 'upload' && uploadConflict && (
            <ConflictResolutionPanel
              conflict={uploadConflict}
              conflictMode={conflictMode}
              onModeChange={setConflictMode}
              newAgentName={newAgentName}
              onNewAgentNameChange={setNewAgentName}
              newAgentFriendlyName={newAgentFriendlyName}
              onNewAgentFriendlyNameChange={setNewAgentFriendlyName}
            />
          )}

          {/* Parsed solution preview (upload mode only) - show only when no conflict */}
          {importMode === 'upload' && uploadedMetadata && !uploadConflict && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-emerald-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-emerald-900">{uploadedMetadata.friendlyName}</p>
                  <p className="text-xs text-emerald-700 mt-1">
                    {uploadedMetadata.uniqueName} • v{uploadedMetadata.version}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded ${uploadedMetadata.isManaged ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
                      {uploadedMetadata.isManaged ? 'Managed' : 'Unmanaged'}
                    </span>
                    <span className="text-emerald-600">by {uploadedMetadata.publisherName}</span>
                  </div>
                  {uploadedMetadata.description && (
                    <p className="text-xs text-emerald-600 mt-2">{uploadedMetadata.description}</p>
                  )}

                  {/* Knowledge Sources */}
                  {uploadedMetadata.knowledgeSources && uploadedMetadata.knowledgeSources.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-emerald-200">
                      <p className="text-xs font-medium text-emerald-800 mb-1">Knowledge Sources:</p>
                      <div className="flex flex-wrap gap-1">
                        {uploadedMetadata.knowledgeSources.map((source, i) => (
                          <span key={i} className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                            {source}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Connection References */}
                  {uploadedMetadata.connectionReferences && uploadedMetadata.connectionReferences.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-emerald-200">
                      <p className="text-xs font-medium text-emerald-800 mb-1">Connections Required:</p>
                      <div className="flex flex-wrap gap-1">
                        {uploadedMetadata.connectionReferences.map((conn, i) => (
                          <span key={i} className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded" title={conn.connectorId}>
                            {conn.displayName || conn.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tenant-Specific Values (URLs that need remapping) */}
                  {uploadedMetadata.tenantSpecificValues && uploadedMetadata.tenantSpecificValues.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-emerald-200">
                      <p className="text-xs font-medium text-amber-700 mb-1">
                        ⚠️ Tenant-Specific Configuration Required:
                      </p>
                      <div className="space-y-1.5">
                        {uploadedMetadata.tenantSpecificValues.map((val, i) => (
                          <div key={i} className="text-xs bg-amber-50 border border-amber-200 rounded p-2">
                            <div className="font-mono text-amber-800 break-all">{val.value}</div>
                            <div className="text-amber-600 mt-1">
                              {val.type === 'sharepoint_url' && 'SharePoint URL'}
                              {val.type === 'dataverse_url' && 'Dataverse URL'}
                              {val.type === 'custom_url' && 'Custom URL'}
                              {' — needs mapping per tenant'}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-amber-600 mt-2">
                        These URLs are specific to your source environment and will need to be configured for each target tenant during deployment.
                      </p>
                    </div>
                  )}

                  {selectedFile && (
                    <p className="text-xs text-emerald-500 mt-2">{selectedFile.name}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {importMode === 'upload' && (
            <div className="pt-2 flex gap-2 justify-end">
              {uploadConflict ? (
                <>
                  <button
                    type="button"
                    onClick={handleCancelUpload}
                    className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolveConflict(conflictMode!)}
                    disabled={!conflictMode || resolvingConflict || (conflictMode === 'create' && !newAgentName.trim())}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resolvingConflict ? 'Processing...' : conflictMode === 'update' ? 'Update Agent' : conflictMode === 'create' ? 'Create New Agent' : 'Select an Option'}
                  </button>
                </>
              ) : uploadedMetadata ? (
                <>
                  <button
                    type="button"
                    onClick={handleCancelUpload}
                    className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
                  >
                    Upload different file
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmUpload}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Add Agent
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
