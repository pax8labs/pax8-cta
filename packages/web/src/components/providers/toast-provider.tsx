'use client'

import { Toaster } from 'sonner'

/**
 * Toast notification provider using Sonner
 * Provides consistent toast notifications across the app
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        expand={false}
        richColors
        closeButton
        toastOptions={{
          duration: 4000,
          classNames: {
            toast: 'dark:bg-gray-800 dark:border-gray-700',
            title: 'dark:text-white',
            description: 'dark:text-gray-300',
          },
        }}
      />
    </>
  )
}
