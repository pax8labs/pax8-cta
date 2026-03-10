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

"use client";

import { Toaster } from "sonner";

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
            toast: "dark:bg-gray-800 dark:border-gray-700",
            title: "dark:text-white",
            description: "dark:text-gray-300",
          },
        }}
      />
    </>
  );
}
