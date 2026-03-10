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

import { useEffect } from "react";

/**
 * Suppresses Next.js error overlay for hydration errors in demo mode
 * This prevents the error overlay from appearing in the lower left corner
 */
export function HydrationErrorSuppressor() {
  useEffect(() => {
    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

    if (!isDemoMode || process.env.NODE_ENV !== "development") {
      return;
    }

    // Patterns that indicate hydration-related errors
    const HYDRATION_PATTERNS = [
      "Hydration",
      "hydration",
      "Text content does not match",
      "server-rendered HTML",
      "did not match",
      "Minified React error #418",
      "Minified React error #423",
      "Minified React error #425",
    ];

    const isHydrationError = (message: string) => {
      return HYDRATION_PATTERNS.some((pattern) => message.includes(pattern));
    };

    // Observer to remove Next.js error overlay when it appears
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            // Check if this is the Next.js error overlay
            if (
              node.id?.includes("nextjs") ||
              node.id?.includes("error") ||
              node.id?.includes("toast") ||
              node.getAttribute("data-nextjs-dialog-overlay") !== null ||
              node.tagName === "NEXTJS-PORTAL" ||
              node.shadowRoot
            ) {
              // Check if it contains hydration error text
              const text = node.textContent || "";
              if (isHydrationError(text) || node.id?.includes("nextjs")) {
                console.log(
                  "[Demo Mode] Suppressing Next.js error overlay:",
                  node.id || node.tagName
                );
                node.style.display = "none";
                node.style.visibility = "hidden";
                node.style.opacity = "0";
                setTimeout(() => {
                  node.remove();
                }, 100);
              }
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Also check for existing error overlays on mount
    const removeExistingOverlays = () => {
      const overlays = document.querySelectorAll(
        '[id*="nextjs"], [data-nextjs-dialog-overlay], nextjs-portal, [data-nextjs-toast]'
      );
      overlays.forEach((overlay) => {
        if (overlay instanceof HTMLElement) {
          console.log(
            "[Demo Mode] Removing existing error overlay:",
            overlay.id || overlay.tagName
          );
          overlay.style.display = "none";
          overlay.remove();
        }
      });
    };

    removeExistingOverlays();

    // Periodically check for and remove error overlays (aggressive approach)
    const intervalId = setInterval(removeExistingOverlays, 500);

    // Also suppress console warnings for hydration in demo mode
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const message = args.join(" ");
      if (isHydrationError(message)) {
        // Silently ignore hydration warnings in demo mode
        return;
      }
      originalWarn.apply(console, args);
    };

    return () => {
      observer.disconnect();
      console.warn = originalWarn;
      clearInterval(intervalId);
    };
  }, []);

  return null;
}
