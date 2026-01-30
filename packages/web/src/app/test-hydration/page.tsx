'use client'

/**
 * Test page to intentionally trigger hydration errors
 * Navigate to /test-hydration to see if GlobalErrorHandler catches it
 */
export default function TestHydrationPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Hydration Error Test Page</h1>

      <div className="space-y-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <h2 className="font-semibold mb-2">Test 1: Dynamic Date (will cause hydration error)</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This will show different timestamps on server vs client:
          </p>
          <p className="mt-2 font-mono text-sm">
            Current time: {new Date().toISOString()}
          </p>
        </div>

        <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
          <h2 className="font-semibold mb-2">Test 2: Random number (will cause hydration error)</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This will show different random numbers on server vs client:
          </p>
          <p className="mt-2 font-mono text-sm">
            Random: {Math.random()}
          </p>
        </div>

        <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
          <h2 className="font-semibold mb-2">Instructions</h2>
          <ol className="list-decimal list-inside text-sm space-y-1">
            <li>Open browser DevTools console (F12)</li>
            <li>Look for logs starting with <code className="bg-gray-200 px-1">[GlobalErrorHandler]</code></li>
            <li>You should see:
              <ul className="list-disc list-inside ml-4 mt-1">
                <li>🟢 Loaded and active</li>
                <li>🎣 console.error interception installed</li>
                <li>👂 Event listeners attached</li>
                <li>🔍 Hydration error detected (when error occurs)</li>
                <li>🚀 Reporting hydration error to GitHub...</li>
                <li>📤 Attempting to report error</li>
                <li>📥 GitHub report response</li>
              </ul>
            </li>
          </ol>
        </div>

        <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg">
          <h2 className="font-semibold mb-2">What to Check</h2>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>Does GlobalErrorHandler load? (Look for 🟢 message)</li>
            <li>Does it detect the hydration error? (Look for 🔍 message)</li>
            <li>Does it attempt to report? (Look for 🚀 and 📤 messages)</li>
            <li>What&apos;s the response? (Look for 📥 message - check if deduplicated/rate-limited)</li>
            <li>Was a GitHub issue created? (Check the issueUrl in the response)</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
