import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { AgentType } from '../../../../shared/agent-status-types'
import type {
  RuntimeTerminalListResult,
  RuntimeTerminalRead,
  RuntimeTerminalSummary
} from '../../../../shared/runtime-terminal-contracts'

const LOCAL_RUNTIME = { kind: 'local' } as const
const TERMINAL_LIST_LIMIT = 200

export type BoardTerminal = {
  /** Stable across PTY restarts: worktree, tab and leaf. */
  key: string
  handle: string
  ptyId: string | null
  title: string | null
  /** The window's own name (set by the user or the desk), without the process title fallback. */
  paneTitle: string | null
  worktreeId: string
  worktreePath: string
  branch: string
  tabId: string
  leafId: string
  connected: boolean
  lastOutputAt: number | null
  /** Set for a structured chat session card (no PTY). */
  chat?: { sessionId: string; agent?: AgentType }
}

export function boardTerminalKey(
  terminal: Pick<RuntimeTerminalSummary, 'worktreeId' | 'tabId' | 'leafId'>
): string {
  return `${terminal.worktreeId}::${terminal.tabId}::${terminal.leafId}`
}

export function toBoardTerminal(summary: RuntimeTerminalSummary): BoardTerminal {
  return {
    key: boardTerminalKey(summary),
    handle: summary.handle,
    ptyId: summary.ptyId,
    title: summary.paneTitle || summary.title,
    paneTitle: summary.paneTitle || null,
    worktreeId: summary.worktreeId,
    worktreePath: summary.worktreePath,
    branch: summary.branch,
    tabId: summary.tabId,
    leafId: summary.leafId,
    connected: summary.connected,
    lastOutputAt: summary.lastOutputAt
  }
}

/** Every local terminal across workspaces; orphaned PTYs have no pane to show and are skipped. */
export async function listLocalBoardTerminals(): Promise<BoardTerminal[]> {
  const result = await callRuntimeRpc<RuntimeTerminalListResult>(LOCAL_RUNTIME, 'terminal.list', {
    limit: TERMINAL_LIST_LIMIT,
    includeVisualLayouts: false,
    includePreview: false
  })
  const seen = new Set<string>()
  const terminals: BoardTerminal[] = []
  for (const summary of result.terminals) {
    if (summary.orphaned) {
      continue
    }
    const terminal = toBoardTerminal(summary)
    if (seen.has(terminal.key)) {
      continue
    }
    seen.add(terminal.key)
    terminals.push(terminal)
  }
  return terminals
}

export async function readLocalTerminalTail(
  handle: string,
  limit: number
): Promise<RuntimeTerminalRead> {
  const result = await callRuntimeRpc<{ terminal: RuntimeTerminalRead }>(
    LOCAL_RUNTIME,
    'terminal.read',
    { terminal: handle, limit }
  )
  return result.terminal
}
