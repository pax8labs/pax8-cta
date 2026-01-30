import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SessionProvider } from '@/components/SessionProvider'
import { PostHogProvider } from '@/components/providers/posthog-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { ErrorBoundary, GlobalErrorHandler } from '@/components/error-boundary'
import { UserMenu } from '@/components/UserMenu'
import Image from 'next/image'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AgentSync',
  description: 'Multi-tenant Copilot Studio deployment automation for MSPs',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SessionProvider>
          <PostHogProvider>
            <ThemeProvider>
              <GlobalErrorHandler>
              <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                  <a href="/" className="flex items-center gap-3">
                    <Image
                      src="/pax8labs-logo.svg"
                      alt="Pax8 Labs"
                      width={100}
                      height={30}
                      className="h-7 w-auto dark:invert"
                      priority
                    />
                    <div className="border-l border-gray-300 dark:border-gray-600 h-6" />
                    <span className="text-lg font-semibold text-gray-900 dark:text-white">
                      AgentSync
                    </span>
                  </a>
                  <div className="flex items-center space-x-4">
                    <a
                      href="/"
                      className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 text-sm font-medium"
                    >
                      Dashboard
                    </a>
                    <a
                      href="/agents"
                      className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 text-sm font-medium"
                    >
                      Agents
                    </a>
                    <a
                      href="/tenants"
                      className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 text-sm font-medium"
                    >
                      Tenants
                    </a>
                    <a
                      href="/deployments"
                      className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 text-sm font-medium"
                    >
                      Deployments
                    </a>
                    <a
                      href="/settings"
                      className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 text-sm font-medium"
                    >
                      Settings
                    </a>
                    <div className="border-l border-gray-200 dark:border-gray-600 h-6 mx-2" />
                    <UserMenu />
                  </div>
                </div>
              </div>
            </nav>
            <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </main>
              </div>
              </GlobalErrorHandler>
            </ThemeProvider>
          </PostHogProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
