'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function NewDeploymentPage() {
  const router = useRouter()
  const { data: tenantsData } = useSWR('/api/tenants', fetcher)

  const [solutionFile, setSolutionFile] = useState<File | null>(null)
  const [selectedTenants, setSelectedTenants] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tenants = tenantsData?.tenants?.filter((t: any) => t.enabled) || []

  // Get unique tags
  const allTags = [...new Set(tenants.flatMap((t: any) => t.tags || []))] as string[]

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSolutionFile(file)
    }
  }

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked)
    if (checked) {
      setSelectedTenants(tenants.map((t: any) => t.tenantId))
    } else {
      setSelectedTenants([])
    }
  }

  const handleTenantToggle = (tenantId: string) => {
    setSelectedTenants((prev) =>
      prev.includes(tenantId)
        ? prev.filter((id) => id !== tenantId)
        : [...prev, tenantId]
    )
  }

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) => {
      const newTags = prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag]

      // Update selected tenants based on tags
      if (newTags.length > 0) {
        const matchingTenants = tenants
          .filter((t: any) => newTags.some((tag) => t.tags?.includes(tag)))
          .map((t: any) => t.tenantId)
        setSelectedTenants(matchingTenants)
      }

      return newTags
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!solutionFile) {
      setError('Please select a solution file')
      return
    }

    if (selectedTenants.length === 0) {
      setError('Please select at least one tenant')
      return
    }

    setIsSubmitting(true)

    try {
      // Create form data for file upload
      const formData = new FormData()
      formData.append('solution', solutionFile)
      formData.append('tenantIds', JSON.stringify(selectedTenants))

      const response = await fetch('/api/deployments/create', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create deployment')
      }

      const { deploymentId } = await response.json()
      router.push(`/deployments/${deploymentId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deployment')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <a
          href="/deployments"
          className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block"
        >
          &larr; Back to Deployments
        </a>
        <h1 className="text-2xl font-semibold text-gray-900">New Deployment</h1>
        <p className="text-gray-500 mt-1">
          Deploy a Copilot Studio solution to multiple tenants
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Step 1: Solution File */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            1. Select Solution File
          </h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              className="hidden"
              id="solution-file"
            />
            <label
              htmlFor="solution-file"
              className="cursor-pointer text-blue-600 hover:text-blue-800"
            >
              {solutionFile ? (
                <span className="text-green-600">
                  Selected: {solutionFile.name} (
                  {(solutionFile.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              ) : (
                <span>Click to select a solution .zip file</span>
              )}
            </label>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Export your solution from Copilot Studio using the CLI:{' '}
            <code className="bg-gray-100 px-1 rounded">
              csd export --solution YourSolution
            </code>
          </p>
        </div>

        {/* Step 2: Select Tenants */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            2. Select Target Tenants
          </h2>

          {/* Tag Filters */}
          {allTags.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Filter by tags:
              </p>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleTagToggle(tag)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Select All */}
          <div className="flex items-center mb-4 pb-4 border-b">
            <input
              type="checkbox"
              id="select-all"
              checked={selectAll}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="h-4 w-4 text-blue-600 rounded border-gray-300"
            />
            <label
              htmlFor="select-all"
              className="ml-2 text-sm font-medium text-gray-700"
            >
              Select all ({tenants.length} tenants)
            </label>
          </div>

          {/* Tenant List */}
          <div className="max-h-64 overflow-y-auto space-y-2">
            {tenants.map((tenant: any) => (
              <div
                key={tenant.tenantId}
                className="flex items-center p-2 rounded hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  id={tenant.tenantId}
                  checked={selectedTenants.includes(tenant.tenantId)}
                  onChange={() => handleTenantToggle(tenant.tenantId)}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                <label
                  htmlFor={tenant.tenantId}
                  className="ml-3 flex-1 cursor-pointer"
                >
                  <span className="font-medium text-gray-900">
                    {tenant.name}
                  </span>
                  <span className="text-sm text-gray-500 ml-2">
                    {new URL(tenant.environmentUrl).hostname}
                  </span>
                  {tenant.tags?.map((tag: string) => (
                    <span
                      key={tag}
                      className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"
                    >
                      {tag}
                    </span>
                  ))}
                </label>
              </div>
            ))}
          </div>

          <p className="text-sm text-gray-500 mt-4">
            {selectedTenants.length} tenant(s) selected
          </p>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <a
            href="/deployments"
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={isSubmitting || !solutionFile || selectedTenants.length === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Creating Deployment...' : 'Start Deployment'}
          </button>
        </div>
      </form>
    </div>
  )
}
