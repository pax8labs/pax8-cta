'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Redirect /setup to /welcome
 * The setup wizard is now integrated into the welcome page
 */
export default function SetupPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/welcome')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-500">Redirecting to setup...</p>
      </div>
    </div>
  )
}
