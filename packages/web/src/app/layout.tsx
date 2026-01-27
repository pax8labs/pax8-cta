import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SessionProvider } from '@/components/SessionProvider'
import { UserMenu } from '@/components/UserMenu'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Copilot Studio Deployer',
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
          <div className="min-h-screen">
            <nav className="bg-white shadow-sm border-b">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                  <div className="flex items-center gap-3">
                    <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect width="100" height="100" rx="20" fill="#0D1117"/>
                      <path d="M25 35L50 20L75 35V65L50 80L25 65V35Z" stroke="#00D4AA" strokeWidth="3" fill="none"/>
                      <circle cx="50" cy="50" r="12" fill="#00D4AA"/>
                      <circle cx="50" cy="25" r="5" fill="#00D4AA"/>
                      <circle cx="25" cy="62" r="5" fill="#00D4AA"/>
                      <circle cx="75" cy="62" r="5" fill="#00D4AA"/>
                    </svg>
                    <div className="flex flex-col">
                      <span className="text-lg font-semibold text-gray-900 leading-tight">
                        AgentSync
                      </span>
                      <span className="text-[10px] text-gray-400 tracking-wider uppercase">
                        Powered by Labs
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <a
                      href="/"
                      className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium"
                    >
                      Dashboard
                    </a>
                    <a
                      href="/agents"
                      className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium"
                    >
                      Agents
                    </a>
                    <a
                      href="/tenants"
                      className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium"
                    >
                      Tenants
                    </a>
                    <a
                      href="/deployments"
                      className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium"
                    >
                      Deployments
                    </a>
                    <div className="border-l border-gray-200 h-6 mx-2" />
                    <UserMenu />
                  </div>
                </div>
              </div>
            </nav>
            <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
              {children}
            </main>
          </div>
        </SessionProvider>
      </body>
    </html>
  )
}
