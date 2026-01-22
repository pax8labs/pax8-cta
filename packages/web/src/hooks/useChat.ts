'use client'

import { useState, useCallback, useEffect } from 'react'
import { ChatMessage, ChatAction } from '@/types/chat'

const CHAT_STORAGE_KEY = 'agentsync-chat-messages'

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    // Load messages from localStorage on initialization
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(CHAT_STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          // Convert timestamp strings back to Date objects
          return parsed.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          }))
        }
      } catch (error) {
        console.error('Failed to load chat history:', error)
      }
    }
    return []
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [llmStatus, setLlmStatus] = useState<'online' | 'offline' | 'unknown'>('unknown')
  const [quotaMessageShown, setQuotaMessageShown] = useState(false)

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
      } catch (error) {
        console.error('Failed to save chat history:', error)
      }
    }
  }, [messages])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])

    // Add a temporary "thinking" message to show progress
    const thinkingMessage: ChatMessage = {
      id: `thinking-${Date.now()}`,
      role: 'assistant',
      content: '💭 Thinking...',
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, thinkingMessage])

    setIsLoading(true)
    setError(null)

    try {
      // Build message history for context
      const history = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, history }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to get response')
      }

      const data = await response.json()

      // Detect LLM status from response
      let responseContent = data.response
      const isQuotaError = responseContent.includes('Gemini API quota exceeded')
      const isMockMode = responseContent.includes("Note: I'm not AI")

      // Update LLM status
      if (isQuotaError || isMockMode) {
        if (llmStatus !== 'offline') {
          setLlmStatus('offline')
        }

        // Remove quota message if we've already shown it
        if (isQuotaError) {
          if (quotaMessageShown) {
            // Strip the quota message from response
            responseContent = responseContent.replace(/ℹ️\s*\*\*Note:\*\*[^\n]+\n\n/g, '')
          } else {
            setQuotaMessageShown(true)
          }
        }

        // Always remove the "Not AI" disclaimer
        responseContent = responseContent.replace(/_Note: I'm not AI, but I can try to help with basic queries\._\n\n/g, '')
      } else {
        if (llmStatus !== 'online') {
          setLlmStatus('online')
        }
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: responseContent,
        timestamp: new Date(data.timestamp),
      }

      // Add actions if any
      if (data.actions && data.actions.length > 0) {
        assistantMessage.action = data.actions[0] // For now, just use the first action
      }

      // Replace the thinking message with the actual response
      setMessages((prev) => prev.filter(m => m.id !== thinkingMessage.id).concat(assistantMessage))
    } catch (err) {
      console.error('Chat error:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')

      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
        timestamp: new Date(),
      }

      // Replace the thinking message with the error message
      setMessages((prev) => prev.filter(m => m.id !== thinkingMessage.id).concat(errorMessage))
    } finally {
      setIsLoading(false)
    }
  }, [messages, llmStatus, quotaMessageShown])

  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
    setQuotaMessageShown(false) // Reset quota flag when clearing chat
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CHAT_STORAGE_KEY)
    }
  }, [])

  return {
    messages,
    isLoading,
    error,
    llmStatus,
    sendMessage,
    clearMessages,
  }
}
