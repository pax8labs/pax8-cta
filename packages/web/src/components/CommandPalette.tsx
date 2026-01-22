'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Terminal, X, ArrowRight, Loader2 } from 'lucide-react'

interface CommandResult {
  type: 'success' | 'error' | 'info'
  content: string | React.ReactNode
  raw?: unknown
}

interface CommandHistory {
  command: string
  result: CommandResult
  timestamp: Date
}

// Available commands with their handlers
const COMMANDS = {
  'deployments': {
    description: 'List deployments',
    usage: 'deployments [list|inspect] [--status <status>]',
    examples: ['deployments list', 'deployments list --status failed', 'deployments inspect <id>'],
  },
  'agents': {
    description: 'List agents',
    usage: 'agents [list|inspect]',
    examples: ['agents list', 'agents inspect SalesAssistant'],
  },
  'tenants': {
    description: 'List tenants',
    usage: 'tenants [list|inspect]',
    examples: ['tenants list', 'tenants inspect contoso'],
  },
  'fleet': {
    description: 'Fleet operations',
    usage: 'fleet [list|inspect] [tenant]',
    examples: ['fleet list', 'fleet inspect contoso'],
  },
  'help': {
    description: 'Show available commands',
    usage: 'help [command]',
    examples: ['help', 'help deployments'],
  },
  'clear': {
    description: 'Clear command history',
    usage: 'clear',
    examples: ['clear'],
  },
  'go': {
    description: 'Navigate to a page',
    usage: 'go <page>',
    examples: ['go deployments', 'go agents', 'go settings'],
  },
} as const

type CommandName = keyof typeof COMMANDS

export function CommandPalette() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<CommandHistory[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [historyIndex, setHistoryIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const historyRef = useRef<HTMLDivElement>(null)
  const initializedFromURL = useRef(false)

  // Sync state with URL parameter
  const updateURL = useCallback((open: boolean) => {
    const params = new URLSearchParams(searchParams.toString())
    if (open) {
      params.set('cli', 'open')
    } else {
      params.delete('cli')
    }
    const newURL = params.toString() ? `${pathname}?${params.toString()}` : pathname
    router.replace(newURL, { scroll: false })
  }, [searchParams, pathname, router])

  // Open CLI if URL has ?cli=open (only once on mount)
  useEffect(() => {
    if (initializedFromURL.current) return
    const cliParam = searchParams.get('cli')
    if (cliParam === 'open') {
      initializedFromURL.current = true
      setIsOpen(true)
    }
  }, [searchParams])

  // Update URL when isOpen changes (but not when initialized from URL)
  const handleSetIsOpen = useCallback((open: boolean | ((prev: boolean) => boolean)) => {
    setIsOpen(prev => {
      const newValue = typeof open === 'function' ? open(prev) : open
      updateURL(newValue)
      return newValue
    })
  }, [updateURL])

  // Handle keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        handleSetIsOpen(prev => !prev)
      }
      if (e.key === 'Escape' && isOpen) {
        handleSetIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleSetIsOpen])

  // Focus input when opened (with preventScroll to avoid page jumping)
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus({ preventScroll: true })
    }
  }, [isOpen])

  // Scroll to bottom of history
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight
    }
  }, [history])

  // Parse command and arguments
  const parseCommand = (input: string): { command: string; args: string[]; flags: Record<string, string> } => {
    const parts = input.trim().split(/\s+/)
    const command = parts[0]?.toLowerCase() || ''
    const args: string[] = []
    const flags: Record<string, string> = {}

    for (let i = 1; i < parts.length; i++) {
      if (parts[i].startsWith('--')) {
        const key = parts[i].slice(2)
        const value = parts[i + 1] && !parts[i + 1].startsWith('--') ? parts[++i] : 'true'
        flags[key] = value
      } else {
        args.push(parts[i])
      }
    }

    return { command, args, flags }
  }

  // Execute command
  const executeCommand = useCallback(async (input: string): Promise<CommandResult> => {
    const { command, args, flags } = parseCommand(input)

    if (!command) {
      return { type: 'info', content: 'Type a command or "help" for available commands' }
    }

    // Help command
    if (command === 'help') {
      if (args[0] && args[0] in COMMANDS) {
        const cmd = COMMANDS[args[0] as CommandName]
        return {
          type: 'info',
          content: (
            <div className="space-y-2">
              <div><span className="text-blue-400">{args[0]}</span> - {cmd.description}</div>
              <div className="text-gray-400">Usage: {cmd.usage}</div>
              <div className="text-gray-400">Examples:</div>
              {cmd.examples.map((ex, i) => (
                <div key={i} className="text-gray-500 ml-2">$ {ex}</div>
              ))}
            </div>
          ),
        }
      }
      return {
        type: 'info',
        content: (
          <div className="space-y-1">
            <div className="text-gray-300 mb-2">Available commands:</div>
            {Object.entries(COMMANDS).map(([name, cmd]) => (
              <div key={name} className="flex gap-4">
                <span className="text-blue-400 w-24">{name}</span>
                <span className="text-gray-400">{cmd.description}</span>
              </div>
            ))}
          </div>
        ),
      }
    }

    // Clear command
    if (command === 'clear') {
      setHistory([])
      return { type: 'info', content: 'History cleared' }
    }

    // Go (navigation) command
    if (command === 'go') {
      const page = args[0]?.toLowerCase()
      const routes: Record<string, string> = {
        'home': '/',
        'dashboard': '/',
        'agents': '/agents',
        'tenants': '/tenants',
        'deployments': '/deployments',
        'health': '/health',
        'settings': '/settings',
      }
      if (page && routes[page]) {
        window.location.href = routes[page]
        return { type: 'success', content: `Navigating to ${page}...` }
      }
      return { type: 'error', content: `Unknown page: ${page}. Try: ${Object.keys(routes).join(', ')}` }
    }

    // Deployments command
    if (command === 'deployments') {
      const subcommand = args[0] || 'list'

      if (subcommand === 'list') {
        try {
          const params = new URLSearchParams()
          if (flags.status) params.set('status', flags.status)

          const res = await fetch(`/api/deployments?${params}`)
          const data = await res.json()

          if (!data.deployments?.length) {
            return { type: 'info', content: 'No deployments found' }
          }

          return {
            type: 'success',
            content: (
              <div className="space-y-1 font-mono text-sm">
                <div className="flex gap-4 text-gray-400 border-b border-gray-700 pb-1">
                  <span className="w-32">ID</span>
                  <span className="w-24">Agent</span>
                  <span className="w-20">Status</span>
                  <span className="w-24">Progress</span>
                </div>
                {data.deployments.slice(0, 10).map((d: { id: string; agentName: string; status: string; progress?: { completed: number; total: number; failed: number } }) => (
                  <div key={d.id} className="flex gap-4">
                    <span className="w-32 text-gray-300 truncate">{d.id}</span>
                    <span className="w-24 text-blue-400 truncate">{d.agentName}</span>
                    <span className={`w-20 ${getStatusColor(d.status)}`}>{d.status}</span>
                    <span className="w-24 text-gray-400">
                      {d.progress ? `${d.progress.completed}/${d.progress.total}${d.progress.failed ? ` (${d.progress.failed} failed)` : ''}` : '-'}
                    </span>
                  </div>
                ))}
                {data.deployments.length > 10 && (
                  <div className="text-gray-500 mt-2">... and {data.deployments.length - 10} more</div>
                )}
              </div>
            ),
            raw: data,
          }
        } catch {
          return { type: 'error', content: 'Failed to fetch deployments' }
        }
      }

      if (subcommand === 'inspect' && args[1]) {
        try {
          const res = await fetch(`/api/deployments/${args[1]}`)
          if (!res.ok) return { type: 'error', content: `Deployment not found: ${args[1]}` }
          const data = await res.json()
          return {
            type: 'success',
            content: (
              <pre className="text-sm text-gray-300 overflow-auto">
                {JSON.stringify(data, null, 2)}
              </pre>
            ),
            raw: data,
          }
        } catch {
          return { type: 'error', content: `Failed to fetch deployment: ${args[1]}` }
        }
      }

      return { type: 'error', content: `Unknown subcommand: ${subcommand}. Try: list, inspect` }
    }

    // Agents command
    if (command === 'agents') {
      const subcommand = args[0] || 'list'

      if (subcommand === 'list') {
        try {
          const res = await fetch('/api/agents')
          const data = await res.json()

          if (!data.agents?.length) {
            return { type: 'info', content: 'No agents found' }
          }

          return {
            type: 'success',
            content: (
              <div className="space-y-1 font-mono text-sm">
                <div className="flex gap-4 text-gray-400 border-b border-gray-700 pb-1">
                  <span className="w-32">Name</span>
                  <span className="w-16">Version</span>
                  <span className="w-24">Tenants</span>
                  <span className="w-20">Status</span>
                </div>
                {data.agents.map((a: { id: string; name: string; version: string; deployedTenants?: unknown[]; status: string }) => (
                  <div key={a.id} className="flex gap-4">
                    <span className="w-32 text-blue-400 truncate">{a.name}</span>
                    <span className="w-16 text-gray-300">{a.version}</span>
                    <span className="w-24 text-gray-400">{a.deployedTenants?.length || 0} deployed</span>
                    <span className={`w-20 ${getStatusColor(a.status)}`}>{a.status}</span>
                  </div>
                ))}
              </div>
            ),
            raw: data,
          }
        } catch {
          return { type: 'error', content: 'Failed to fetch agents' }
        }
      }

      return { type: 'error', content: `Unknown subcommand: ${subcommand}. Try: list` }
    }

    // Tenants command
    if (command === 'tenants' || command === 'fleet') {
      const subcommand = args[0] || 'list'

      if (subcommand === 'list') {
        try {
          const res = await fetch('/api/tenants')
          const data = await res.json()

          if (!data.tenants?.length) {
            return { type: 'info', content: 'No tenants found' }
          }

          return {
            type: 'success',
            content: (
              <div className="space-y-1 font-mono text-sm">
                <div className="flex gap-4 text-gray-400 border-b border-gray-700 pb-1">
                  <span className="w-32">Name</span>
                  <span className="w-24">Environment</span>
                  <span className="w-20">Status</span>
                </div>
                {data.tenants.map((t: { id: string; name: string; environment: string; status: string }) => (
                  <div key={t.id} className="flex gap-4">
                    <span className="w-32 text-blue-400 truncate">{t.name}</span>
                    <span className="w-24 text-gray-300">{t.environment}</span>
                    <span className={`w-20 ${getStatusColor(t.status)}`}>{t.status}</span>
                  </div>
                ))}
              </div>
            ),
            raw: data,
          }
        } catch {
          return { type: 'error', content: 'Failed to fetch tenants' }
        }
      }

      if (subcommand === 'inspect' && args[1]) {
        try {
          const res = await fetch(`/api/tenants/${args[1]}`)
          if (!res.ok) return { type: 'error', content: `Tenant not found: ${args[1]}` }
          const data = await res.json()
          return {
            type: 'success',
            content: (
              <pre className="text-sm text-gray-300 overflow-auto">
                {JSON.stringify(data, null, 2)}
              </pre>
            ),
            raw: data,
          }
        } catch {
          return { type: 'error', content: `Failed to fetch tenant: ${args[1]}` }
        }
      }

      return { type: 'error', content: `Unknown subcommand: ${subcommand}. Try: list, inspect` }
    }

    return { type: 'error', content: `Unknown command: ${command}. Type "help" for available commands.` }
  }, [])

  // Get status color class
  const getStatusColor = (status: string): string => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'healthy':
      case 'active':
        return 'text-green-400'
      case 'failed':
      case 'unhealthy':
      case 'error':
        return 'text-red-400'
      case 'in_progress':
      case 'pending':
      case 'deploying':
        return 'text-yellow-400'
      case 'awaiting_approval':
        return 'text-purple-400'
      default:
        return 'text-gray-400'
    }
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    setIsLoading(true)
    const result = await executeCommand(input)

    setHistory(prev => [...prev, { command: input, result, timestamp: new Date() }])
    setInput('')
    setHistoryIndex(-1)
    setIsLoading(false)
  }

  // Handle arrow keys for history navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const commandHistory = history.map(h => h.command)

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex
      setHistoryIndex(newIndex)
      if (newIndex >= 0) {
        setInput(commandHistory[commandHistory.length - 1 - newIndex] || '')
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newIndex = historyIndex > 0 ? historyIndex - 1 : -1
      setHistoryIndex(newIndex)
      if (newIndex >= 0) {
        setInput(commandHistory[commandHistory.length - 1 - newIndex] || '')
      } else {
        setInput('')
      }
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => handleSetIsOpen(true)}
        className="fixed bottom-4 right-4 p-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-full shadow-lg transition-colors z-50"
        title="Open command palette (⌘K)"
      >
        <Terminal className="w-5 h-5" />
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => handleSetIsOpen(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-gray-900 rounded-lg shadow-2xl border border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Terminal className="w-4 h-4" />
            <span>Command Palette</span>
            <span className="text-gray-600 ml-2">Press ⌘K to toggle</span>
          </div>
          <button
            onClick={() => handleSetIsOpen(false)}
            className="text-gray-500 hover:text-gray-300 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* History */}
        <div
          ref={historyRef}
          className="max-h-[50vh] overflow-y-auto p-4 space-y-4 font-mono text-sm"
        >
          {history.length === 0 && (
            <div className="text-gray-500 text-center py-8">
              Type a command or &quot;help&quot; to get started
            </div>
          )}
          {history.map((item, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center gap-2 text-gray-400">
                <span className="text-green-400">$</span>
                <span>{item.command}</span>
              </div>
              <div className={`pl-4 ${
                item.result.type === 'error' ? 'text-red-400' :
                item.result.type === 'success' ? 'text-gray-300' :
                'text-gray-400'
              }`}>
                {item.result.content}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t border-gray-700">
          <div className="flex items-center px-4 py-3 bg-gray-800">
            <span className="text-green-400 mr-2">$</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command..."
              className="flex-1 bg-transparent text-gray-200 placeholder-gray-500 outline-none font-mono"
              disabled={isLoading}
            />
            {isLoading ? (
              <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
            ) : (
              <button
                type="submit"
                className="text-gray-500 hover:text-gray-300 p-1"
                disabled={!input.trim()}
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>

        {/* Quick suggestions */}
        {input && !isLoading && (
          <div className="border-t border-gray-700 px-4 py-2 bg-gray-850">
            <div className="flex flex-wrap gap-2">
              {Object.keys(COMMANDS)
                .filter(cmd => cmd.startsWith(input.toLowerCase()))
                .slice(0, 5)
                .map(cmd => (
                  <button
                    key={cmd}
                    onClick={() => setInput(cmd + ' ')}
                    className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
                  >
                    {cmd}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
