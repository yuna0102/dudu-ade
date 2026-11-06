import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import {
  resolveTerminalTabActivityStatus,
  type TerminalTabActivityStatus
} from '@/components/tab-bar/terminal-tab-activity-status'
import { listLocalBoardTerminals, type BoardTerminal } from './board-terminal-listing'
import { useDuduAdeStore } from './dudu-ade-store'
import type { TerminalHandoff } from '../../../../shared/dudu-ade-terminal-models'

const BOARD_REFRESH_MS = 5_000

/** Polls the local runtime while the board is open; structural changes only (output streams through each card). */
export function useBoardTerminals(): {
  terminals: BoardTerminal[]
  loaded: boolean
  refresh: () => void
} {
  const [terminals, setTerminals] = useState<BoardTerminal[]>([])
  const [loaded, setLoaded] = useState(false)
  const refresh = useCallback(() => {
    void listLocalBoardTerminals()
      .then((next) => {
        setTerminals((current) => (sameTerminals(current, next) ? current : next))
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true))
  }, [])
  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, BOARD_REFRESH_MS)
    return () => clearInterval(interval)
  }, [refresh])
  return { terminals, loaded, refresh }
}

function sameTerminals(a: BoardTerminal[], b: BoardTerminal[]): boolean {
  return (
    a.length === b.length &&
    a.every((terminal, index) => {
      const other = b[index]
      return (
        terminal.key === other.key &&
        terminal.ptyId === other.ptyId &&
        terminal.title === other.title &&
        terminal.connected === other.connected
      )
    })
  )
}

export type BoardTerminalMeta = {
  status: TerminalTabActivityStatus | undefined
  /** The tab's own name when the user gave it one (auto-category source). */
  tabName: string | null
  /** False until the tab shows up in the app store (startup), so auto-classify waits for it. */
  tabFound: boolean
}

/** Tab status and name per terminal, read as one string so unrelated store updates do not repaint the board. */
export function useBoardTerminalMeta(
  terminals: readonly BoardTerminal[]
): Map<string, BoardTerminalMeta> {
  const encoded = useAppStore((s) =>
    terminals
      .map((terminal) => {
        const tab = s.tabsByWorktree[terminal.worktreeId]?.find(
          (entry) => entry.id === terminal.tabId
        )
        if (!tab) {
          return `${terminal.key}\u00010\u0001\u0001`
        }
        const status = resolveTerminalTabActivityStatus({
          tab,
          agentStatusByPaneKey: s.agentStatusByPaneKey,
          agentStatusEpoch: s.agentStatusEpoch,
          runtimePaneTitlesByTabId: s.runtimePaneTitlesByTabId,
          ptyIdsByTabId: s.ptyIdsByTabId,
          terminalLayout: s.terminalLayoutsByTabId?.[tab.id]
        })
        return `${terminal.key}\u00011\u0001${status}\u0001${tab.customTitle ?? ''}`
      })
      .join('\u0002')
  )
  return useMemo(() => {
    const meta = new Map<string, BoardTerminalMeta>()
    for (const row of encoded ? encoded.split('\u0002') : []) {
      const [key, found, status, tabName] = row.split('\u0001')
      meta.set(key, {
        status: (status || undefined) as TerminalTabActivityStatus | undefined,
        tabName: tabName || null,
        tabFound: found === '1'
      })
    }
    return meta
  }, [encoded])
}

const MODEL_POLL_MS = 5_000

/** Polls Claude Code models per pane while the app runs; skipped on hosts without the desktop bridge. */
export function useTerminalModelPoller(): void {
  useEffect(() => {
    const read = window.api.shell.duduAdeTerminalAgentModels
    if (!read) {
      return
    }
    let last = ''
    const poll = (): void => {
      void read()
        .then((models) => {
          const encoded = JSON.stringify(models)
          if (encoded !== last) {
            last = encoded
            useDuduAdeStore.getState().setTerminalModels(models)
          }
        })
        .catch(() => undefined)
    }
    poll()
    const interval = setInterval(poll, MODEL_POLL_MS)
    return () => clearInterval(interval)
  }, [])
}

const HANDOFF_POLL_MS = 1_000
const HANDOFF_SHOW_MS = 4_000

/** Terminal-to-terminal sends of the last few seconds, as card keys; the host keeps them in memory only. */
export function useBoardHandoffFlows(terminals: BoardTerminal[]): { from: string; to: string }[] {
  const [handoffs, setHandoffs] = useState<TerminalHandoff[]>([])
  useEffect(() => {
    const read = window.api.shell.duduAdeTerminalHandoffs
    if (!read) {
      return
    }
    let last = ''
    const poll = (): void => {
      void read()
        .then((all) => {
          const now = Date.now()
          const shown = all.filter((handoff) => now - handoff.at < HANDOFF_SHOW_MS)
          const encoded = JSON.stringify(shown)
          if (encoded !== last) {
            last = encoded
            setHandoffs(shown)
          }
        })
        .catch(() => undefined)
    }
    poll()
    const interval = setInterval(poll, HANDOFF_POLL_MS)
    return () => clearInterval(interval)
  }, [])
  return useMemo(() => handoffFlows(handoffs, terminals), [handoffs, terminals])
}

export function handoffFlows(
  handoffs: TerminalHandoff[],
  terminals: BoardTerminal[]
): { from: string; to: string }[] {
  const keyOf = new Map(terminals.map((terminal) => [terminal.handle, terminal.key]))
  const flows = new Map<string, { from: string; to: string }>()
  for (const handoff of handoffs) {
    const from = keyOf.get(handoff.from)
    const to = keyOf.get(handoff.to)
    if (from && to && from !== to) {
      flows.set(`${from}>${to}`, { from, to })
    }
  }
  return [...flows.values()]
}
