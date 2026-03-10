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

import type { SourceSolution } from "@/types/agent";

// Extended solution type with additional fields from API
interface ExtendedSolution extends SourceSolution {
  displayName?: string;
  publisher?: string;
  hasBot?: boolean;
  botInfo?: {
    botName?: string;
    botType?: "copilot" | "classic";
    topicsCount?: number;
    knowledgeSources?: string[];
  };
}

interface SolutionPreviewProps {
  solution: SourceSolution;
  selectedEnvironment: string | null;
  importingId: string | null;
  onClose: () => void;
  onImport: () => void;
}

export function SolutionPreview({
  solution,
  selectedEnvironment,
  importingId,
  onClose,
  onImport,
}: SolutionPreviewProps) {
  const extSolution = solution as ExtendedSolution;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-medium text-slate-900">Agent Preview</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* Agent header */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-lg font-semibold text-slate-900">
                {extSolution.displayName || solution.name}
              </h4>
              {extSolution.hasBot && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  Copilot Agent
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 font-mono">{solution.uniqueName}</p>
          </div>

          {/* Description */}
          {solution.description && <p className="text-sm text-slate-600">{solution.description}</p>}

          {/* Bot details */}
          {extSolution.botInfo && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <h5 className="text-sm font-medium text-blue-900 mb-2">Agent Details</h5>
              <div className="space-y-1.5 text-sm">
                {extSolution.botInfo.botName && (
                  <div className="flex justify-between">
                    <span className="text-blue-700">Name:</span>
                    <span className="text-blue-900 font-medium">{extSolution.botInfo.botName}</span>
                  </div>
                )}
                {extSolution.botInfo.botType && (
                  <div className="flex justify-between">
                    <span className="text-blue-700">Type:</span>
                    <span className="text-blue-900">
                      {extSolution.botInfo.botType === "copilot" ? "Copilot Studio" : "Classic PVA"}
                    </span>
                  </div>
                )}
                {extSolution.botInfo.topicsCount !== undefined &&
                  extSolution.botInfo.topicsCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-blue-700">Topics:</span>
                      <span className="text-blue-900">{extSolution.botInfo.topicsCount}</span>
                    </div>
                  )}
              </div>
              {extSolution.botInfo.knowledgeSources &&
                extSolution.botInfo.knowledgeSources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-blue-200">
                    <p className="text-xs font-medium text-blue-800 mb-1">Knowledge Sources:</p>
                    <div className="flex flex-wrap gap-1">
                      {extSolution.botInfo.knowledgeSources.map((source, i) => (
                        <span
                          key={i}
                          className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded"
                        >
                          {source}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* Solution metadata */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <h5 className="text-sm font-medium text-slate-700 mb-2">Solution Info</h5>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-500">Version:</span>
                <span className="ml-1 text-slate-700">{solution.version}</span>
              </div>
              <div>
                <span className="text-slate-500">Publisher:</span>
                <span className="ml-1 text-slate-700">
                  {extSolution.publisher || solution.publisherId}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Type:</span>
                <span className="ml-1 text-slate-700">
                  {solution.isManaged ? "Managed" : "Unmanaged"}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Environment:</span>
                <span className="ml-1 text-slate-700 text-xs">
                  {selectedEnvironment?.split(".")[0].replace("https://", "")}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              onClick={onImport}
              disabled={importingId === solution.uniqueName}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Import Agent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
