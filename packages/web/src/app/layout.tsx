/**
 * Copyright 2024 Pax8 Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ErrorBoundary, GlobalErrorHandler } from "@/components/error-boundary";
import { ToastProvider } from "@/components/providers/toast-provider";
import { UserMenu } from "@/components/UserMenu";
import { ChatSidebar } from "@/components/ChatSidebar";
import { CommandPalette } from "@/components/CommandPalette";
import Image from "next/image";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AgentSync",
  description: "Multi-tenant Copilot Studio deployment automation for MSPs",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Get the CSP nonce from middleware
  const nonce = (await headers()).get("x-nonce");

  return (
    <html lang="en">
      <head>
        <script
          nonce={nonce ?? undefined}
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Always default to light mode
                document.documentElement.classList.remove('dark');
                // Reset scroll position to prevent browser restoration causing scroll jump
                if ('scrollRestoration' in history) {
                  history.scrollRestoration = 'manual';
                }
                window.scrollTo(0, 0);
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <SessionProvider>
          <PostHogProvider>
            <ThemeProvider>
              <ToastProvider>
                <GlobalErrorHandler>
                  {/* Skip to main content link for accessibility */}
                  <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded"
                  >
                    Skip to main content
                  </a>
                  {/* Main layout container */}
                  <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
                    {/* Navigation - full width at top */}
                    <nav
                      className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700"
                      aria-label="Main navigation"
                    >
                      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex justify-between h-16">
                          <a
                            href="/"
                            className="flex items-center gap-2 sm:gap-3"
                            aria-label="AgentSync Home"
                          >
                            <Image
                              src="/pax8labs-logo.svg"
                              alt="Pax8 Labs"
                              width={80}
                              height={24}
                              className="h-5 sm:h-7 w-auto dark:invert"
                              priority
                            />
                            <div className="hidden sm:block border-l border-gray-300 dark:border-gray-600 h-6" />
                            <span className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
                              AgentSync
                            </span>
                          </a>
                          <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-4">
                            <a
                              href="/"
                              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium"
                            >
                              Dashboard
                            </a>
                            <a
                              href="/agents"
                              className="hidden sm:block text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium"
                            >
                              Agents
                            </a>
                            <a
                              href="/tenants"
                              className="hidden md:block text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 text-sm font-medium"
                            >
                              Tenants
                            </a>
                            <a
                              href="/health"
                              className="hidden lg:block text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 text-sm font-medium"
                            >
                              Health
                            </a>
                            <a
                              href="/deployments"
                              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium"
                            >
                              Deployments
                            </a>
                            <a
                              href="/settings"
                              className="hidden lg:block text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 text-sm font-medium"
                            >
                              Settings
                            </a>
                            <div className="hidden sm:block border-l border-gray-200 dark:border-gray-600 h-6 mx-2" />
                            <UserMenu />
                          </div>
                        </div>
                      </div>
                    </nav>
                    {/* Content area below nav - main + sidebar side by side */}
                    <div className="flex flex-1">
                      <main
                        id="main-content"
                        className="flex-1 max-w-7xl w-full mx-auto py-6 px-4 sm:px-6 lg:px-8 overflow-y-auto"
                      >
                        <ErrorBoundary>{children}</ErrorBoundary>
                      </main>
                      {/* Sidebar area - sits beside main content, below nav */}
                      <ChatSidebar />
                    </div>
                    <CommandPalette />
                  </div>
                </GlobalErrorHandler>
              </ToastProvider>
            </ThemeProvider>
          </PostHogProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
