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

import { useState, useCallback } from "react";
import { toast } from "sonner";

interface TagEditorProps {
  agentId: string;
  tags: string[];
  onSave: () => void;
}

export function TagEditor({ agentId, tags, onSave }: TagEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [input, setInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = useCallback(() => {
    setIsEditing(true);
    setInput(tags.join(", "));
  }, [tags]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setInput("");
  }, []);

  const saveTags = useCallback(async () => {
    setIsSaving(true);
    try {
      const newTags = input
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const response = await fetch(`/api/agents/${agentId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newTags }),
      });

      if (!response.ok) {
        throw new Error("Failed to save tags");
      }

      toast.success("Tags updated");
      setIsEditing(false);
      onSave();
    } catch (err) {
      console.error("Save tags error:", err);
      toast.error("Failed to save tags");
    } finally {
      setIsSaving(false);
    }
  }, [agentId, input, onSave]);

  if (!isEditing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-slate-700 dark:text-slate-300">Tags</h4>
          <button
            onClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
            className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Edit
          </button>
        </div>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No tags</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-slate-700 dark:text-slate-300">Tags</h4>
      </div>
      <div className="space-y-2">
        {/* Show current tags being edited */}
        {tags.length > 0 && (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Current: {tags.join(", ")}
          </div>
        )}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="tag1, tag2, tag3"
          className="w-full px-2 py-1.5 text-xs text-slate-900 dark:text-white bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveTags();
            } else if (e.key === "Escape") {
              cancelEditing();
            }
          }}
        />
        <p className="text-xs text-slate-400">Separate tags with commas</p>
        <div className="flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              saveTags();
            }}
            disabled={isSaving}
            className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              cancelEditing();
            }}
            className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
