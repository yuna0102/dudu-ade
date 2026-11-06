import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import { getStructuredAgentSessionStatusFeed } from '@/runtime/structured-agent-session-status-feed'
import { structuredAgentSessionIdFromTabId } from '../../../../shared/agent-session/view/structured-agent-session-tab-id'
import type { AgentSessionStatusSummary } from '../../../../shared/agent-session/agent-session-wire'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { TerminalAgentModel } from '../../../../shared/dudu-ade-terminal-models'
import type { WorktreeStatus } from '@/lib/worktree-status'
import { boardChatKey } from './board-links'
import { paneKeyOf } from './board-agent-labels'
import type { BoardTerminal } from './board-terminal-listing'
import type { BoardTerminalMeta } from './use-board-terminals'

const LOCAL_TARGET = { kind: 'local' } as const

type ChatTabRow = {
  worktreeId: string
  tabId: string
  sessionId: string
  title: string
  named: string | null
  agent?: AgentType
}

/** Chat tabs as rows, read as one string so unrelated store updates do not repaint the board. */
export function chatTabRows(
  unifiedTabsByWorktree: Record<
    string,
    readonly {
      id: string
      contentType: string
      label: string
      customLabel: string | null
      generatedLabel?: string | null
      agentSessionAgent?: AgentType
    }[]
  >
): ChatTabRow[] {
  const rows: ChatTabRow[] = []
  for (const [worktreeId, tabs] of Object.entries(unifiedTabsByWorktree)) {
    for (const tab of tabs) {
      const sessionId =
        tab.contentType === 'agent-session' ? structuredAgentSessionIdFromTabId(tab.id) : null
      if (sessionId) {
        rows.push({
          worktreeId,
          tabId: tab.id,
          sessionId,
          title: tab.customLabel || tab.generatedLabel || tab.label,
          named: tab.customLabel,
          agent: tab.agentSessionAgent
        })
      }
    }
  }
  return rows
}

export function chatBoardStatus(
  summary: AgentSessionStatusSummary | undefined
): WorktreeStatus | undefined {
  switch (summary?.status) {
    case 'working':
      return 'working'
    case 'attention':
      return 'permission'
    case 'idle':
      return 'done'
    default:
      return undefined
  }
}

/**
 * Structured chat sessions of this host as board cards, with status and model from the chat status feed.
 * shortcut: local host only, paired or remote hosts' chats are not listed; add their feeds if those get used.
 */
export function useBoardChats(): {
  chats: BoardTerminal[]
  meta: Map<string, BoardTerminalMeta>
  models: Record<string, TerminalAgentModel>
  /** Chat card key to the CLI conversation id it continues, once the host reports it. */
  providerIds: Record<string, string>
} {
  const encoded = useAppStore((s) => JSON.stringify(chatTabRows(s.unifiedTabsByWorktree)))
  const feed = useMemo(() => getStructuredAgentSessionStatusFeed(LOCAL_TARGET), [])
  useEffect(() => feed.activate(), [feed])
  const snapshot = useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot)
  const rows = useMemo(() => JSON.parse(encoded) as ChatTabRow[], [encoded])
  const chats = useMemo(
    () =>
      rows.map((row): BoardTerminal => ({
        key: boardChatKey(row.worktreeId, row.tabId),
        handle: row.tabId,
        ptyId: null,
        title: row.title,
        paneTitle: null,
        worktreeId: row.worktreeId,
        worktreePath: '',
        branch: '',
        tabId: row.tabId,
        leafId: 'chat',
        connected: true,
        lastOutputAt: null,
        chat: { sessionId: row.sessionId, agent: row.agent }
      })),
    [rows]
  )
  return useMemo(() => {
    const meta = new Map<string, BoardTerminalMeta>()
    const models: Record<string, TerminalAgentModel> = {}
    const providerIds: Record<string, string> = {}
    chats.forEach((chat, index) => {
      const summary = snapshot.get(chat.chat!.sessionId)
      meta.set(chat.key, {
        status: chatBoardStatus(summary),
        tabName: rows[index].named,
        tabFound: true
      })
      if (summary?.providerSession?.id) {
        providerIds[chat.key] = summary.providerSession.id
      }
      if (summary?.model) {
        models[paneKeyOf(chat)] = { model: summary.model, effort: null }
      }
    })
    return { chats, meta, models, providerIds }
  }, [chats, rows, snapshot])
}
