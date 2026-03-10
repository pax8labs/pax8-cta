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

import { ChatMessage as ChatMessageType } from "@/types/chat";
import { useRouter } from "next/navigation";

interface ChatMessageProps {
  message: ChatMessageType;
  onActionClick?: (action: ChatMessageType["action"]) => void;
}

export function ChatMessage({ message, onActionClick }: ChatMessageProps) {
  const router = useRouter();
  const isUser = message.role === "user";

  const handleActionClick = () => {
    if (message.action) {
      // Handle navigation actions immediately
      if (message.action.type === "navigate" && message.action.path) {
        router.push(message.action.path);
        return;
      }

      // For other actions, call the handler
      onActionClick?.(message.action);
    }
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[85%] rounded px-3 py-2 ${
          isUser
            ? "bg-blue-600 dark:bg-blue-700 text-white"
            : "bg-white dark:bg-[#252526] text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-800"
        }`}
      >
        {/* Message content */}
        <div className="whitespace-pre-wrap text-xs font-mono leading-relaxed">
          {formatMessageContent(message.content)}
        </div>

        {/* Action buttons */}
        {!isUser && message.action && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleActionClick}
              className={`px-2.5 py-1 rounded text-[11px] font-mono font-medium transition-colors ${
                message.action.type === "retry"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : message.action.type === "cancel"
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              $ {message.action.label}
            </button>
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`mt-1.5 text-[10px] font-mono ${
            isUser ? "text-blue-200" : "text-gray-400 dark:text-gray-600"
          }`}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

/**
 * Format message content with basic markdown-like formatting
 */
function formatMessageContent(content: string): JSX.Element {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];

  lines.forEach((line, index) => {
    // Bold text: **text**
    if (line.includes("**")) {
      const parts = line.split(/\*\*(.*?)\*\*/);
      elements.push(
        <div key={index}>
          {parts.map((part, i) =>
            i % 2 === 1 ? (
              <strong key={i} className="font-semibold">
                {part}
              </strong>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </div>
      );
    }
    // Bullet points: • text
    else if (line.trim().startsWith("•")) {
      elements.push(
        <div key={index} className="ml-2">
          {line}
        </div>
      );
    }
    // Regular line
    else {
      elements.push(<div key={index}>{line || "\u00A0"}</div>);
    }
  });

  return <>{elements}</>;
}

/**
 * Format timestamp
 */
function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
