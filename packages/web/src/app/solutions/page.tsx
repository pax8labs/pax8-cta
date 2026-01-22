'use client'

import { useState } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface Solution {
  id: string
  uniqueName: string
  friendlyName: string
  version: string
  isManaged: boolean
}

export default function SolutionsPage() {
  const { data, error, isLoading } = useSWR('/api/solutions', fetcher)
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportResult, setExportResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleExport = async (solution: Solution, managed: boolean) => {
    setExporting(solution.uniqueName)
    setExportResult(null)

    try {
      const response = await fetch('/api/solutions/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solutionName: solution.uniqueName,
          managed,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Export failed')
      }

      setExportResult({
        type: 'success',
        text: `Exported ${solution.friendlyName} to ${result.outputPath}`,
      })
    } catch (err) {
      setExportResult({
        type: 'error',
        text: err instanceof Error ? err.message : 'Export failed',
      })
    } finally {
      setExporting(null)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Solutions</h1>
          <p className="text-sm text-gray-500 mt-1">
            Solutions available in your source environment
          </p>
        </div>
      </div>

      {/* Source Environment Info */}
      {data?.sourceEnvironment && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-700">
            <span className="font-medium">Source Environment:</span>{' '}
            {data.sourceEnvironment}
          </p>
        </div>
      )}

      {/* Export Result */}
      {exportResult && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            exportResult.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {exportResult.text}
        </div>
      )}

      {/* Solutions List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {error ? (
          <div className="p-6 text-center">
            <p className="text-red-600 mb-2">Failed to load solutions</p>
            <p className="text-sm text-gray-500">
              Make sure PARTNER_CLIENT_SECRET is set and you have access to the source environment.
            </p>
          </div>
        ) : isLoading ? (
          <div className="p-6 text-center text-gray-500">Loading solutions...</div>
        ) : data?.solutions?.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No custom solutions found in the source environment.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Solution
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unique Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Version
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.solutions?.map((solution: Solution) => (
                <tr key={solution.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium text-gray-900">
                      {solution.friendlyName}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                      {solution.uniqueName}
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {solution.version}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        solution.isManaged
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {solution.isManaged ? 'Managed' : 'Unmanaged'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleExport(solution, true)}
                        disabled={exporting !== null}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {exporting === solution.uniqueName
                          ? 'Exporting...'
                          : 'Export Managed'}
                      </button>
                      <button
                        onClick={() => handleExport(solution, false)}
                        disabled={exporting !== null}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs font-medium hover:bg-gray-300 disabled:opacity-50 transition-colors"
                      >
                        Export Unmanaged
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 text-sm text-gray-500">
        <p>
          Exported solutions are saved to the{' '}
          <code className="bg-gray-100 px-1 rounded">solutions/</code> directory.
          Use them with the deploy command or web wizard.
        </p>
      </div>
    </div>
  )
}
