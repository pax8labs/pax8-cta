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

/**
 * Risk Assessment Modal Wrapper
 * Easy-to-integrate modal for showing deployment risk analysis
 */

import { useEffect } from "react";
import { X } from "lucide-react";
import { RiskAssessment } from "./RiskAssessment";
import { useRiskAnalysis } from "@/hooks/useRiskAnalysis";

interface RiskAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  tenantIds: string[];
  solutionFile?: string;
  solutionSize?: number;
  isProduction?: boolean;
}

export function RiskAssessmentModal({
  isOpen,
  onClose,
  onProceed,
  tenantIds,
  solutionFile,
  solutionSize,
  isProduction = false,
}: RiskAssessmentModalProps) {
  const { analysis, loading, error, analyze, reset } = useRiskAnalysis();

  // Auto-analyze when modal opens
  useEffect(() => {
    if (isOpen && tenantIds.length > 0) {
      analyze({
        tenantIds,
        solutionFile,
        solutionSize,
        isProduction,
      });
    }

    if (!isOpen) {
      reset();
    }
  }, [isOpen, tenantIds, solutionFile, solutionSize, isProduction, analyze, reset]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-700">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Content */}
          {loading && (
            <div className="p-12 text-center">
              <div className="animate-spin inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full" />
              <p className="mt-4 text-gray-600 dark:text-gray-400">Analyzing deployment risk...</p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                Checking {tenantIds.length} tenant{tenantIds.length > 1 ? "s" : ""}
              </p>
            </div>
          )}

          {error && (
            <div className="p-12">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
                  Analysis Failed
                </h3>
                <p className="text-red-700 dark:text-red-300">{error.message}</p>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() =>
                      analyze({
                        tenantIds,
                        solutionFile,
                        solutionSize,
                        isProduction,
                      })
                    }
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Retry Analysis
                  </button>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {analysis && !loading && !error && (
            <RiskAssessment
              analysis={analysis}
              onProceed={() => {
                onClose();
                onProceed();
              }}
              onCancel={onClose}
            />
          )}
        </div>
      </div>
    </>
  );
}
