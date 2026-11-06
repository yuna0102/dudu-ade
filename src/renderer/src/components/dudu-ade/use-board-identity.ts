import { useEffect, useMemo, useState } from 'react'
import { cardIdentities, reconcileIdentity, type CardIdentity } from './board-identity'
import { paneKeyOf } from './board-agent-labels'
import { parseRestoreSeed, type RestoreSeed } from './board-restore'
import type { BoardTerminal } from './board-terminal-listing'
import { useDuduAdeStore } from './dudu-ade-store'
import type { BoardTerminalMeta } from './use-board-terminals'

const DESK_TABLE_REFRESH_MS = 60_000
/** Conversation ids arrive with the first model poll; naming before that would record titles instead of roles. */
const FIRST_NAMING_WAIT_MS = 6_000

/** The saved layout wins; the one-time restore file fills in what it does not say (chat names, aliases). */
export function chooseSeed(
  layout: RestoreSeed | null,
  restore: RestoreSeed | null
): RestoreSeed | null {
  return layout
    ? {
        ...layout,
        chatSessions: { ...restore?.chatSessions, ...layout.chatSessions },
        aliases: { ...restore?.aliases, ...layout.aliases }
      }
    : restore
}

/**
 * Keeps each window's card across restarts by name, and applies the saved layout, else the one-time restore file.
 * Runs on every change, so windows that open one by one are each handled as they appear.
 */
export function useBoardIdentity(args: {
  terminals: BoardTerminal[]
  meta: Map<string, BoardTerminalMeta>
  providerIds: Record<string, string>
  loaded: boolean
}): {
  identities: CardIdentity[]
  /** The saved layout file as it was when the app started; null when there is none. */
  savedLayout: RestoreSeed | null
  layoutText: string | null
  /** The saved layout has been read and applied, so saving can no longer lose it. */
  restored: boolean
} {
  const { terminals, meta, providerIds, loaded } = args
  // undefined while the files are being read, null when there is none or it is unreadable.
  const [seed, setSeed] = useState<RestoreSeed | null | undefined>(undefined)
  const [saved, setSaved] = useState<{ seed: RestoreSeed | null; text: string | null }>({
    seed: null,
    text: null
  })
  const [deskNames, setDeskNames] = useState<Record<string, string>>({})
  const [namingOpen, setNamingOpen] = useState(false)
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    const shell = window.api.shell
    const read = async (load: (() => Promise<string | null>) | undefined): Promise<string | null> =>
      (await load?.().catch(() => null)) ?? null
    void Promise.all([
      read(shell.duduAdeReadBoardLayout),
      read(shell.duduAdeReadBoardRestore)
    ]).then(([layoutText, restoreText]) => {
      const layout = layoutText ? parseRestoreSeed(layoutText) : null
      setSaved({ seed: layout, text: layout ? layoutText : null })
      setSeed(chooseSeed(layout, restoreText ? parseRestoreSeed(restoreText) : null))
    })
  }, [])
  useEffect(() => {
    const read = window.api.shell.duduAdeDeskSessionNames
    if (!read) {
      return
    }
    const refresh = (): void =>
      void read()
        .then(setDeskNames)
        .catch(() => undefined)
    refresh()
    const interval = setInterval(refresh, DESK_TABLE_REFRESH_MS)
    return () => clearInterval(interval)
  }, [])
  const terminalModels = useDuduAdeStore((state) => state.terminalModels)
  const hasModels = Object.keys(terminalModels).length > 0
  useEffect(() => {
    if (hasModels) {
      setNamingOpen(true)
      return
    }
    const timer = setTimeout(() => setNamingOpen(true), FIRST_NAMING_WAIT_MS)
    return () => clearTimeout(timer)
  }, [hasModels])
  const identities = useMemo(
    () =>
      cardIdentities(
        terminals,
        (key) => meta.get(key)?.tabName ?? null,
        seed?.chatSessions ?? {},
        providerIds,
        deskNames,
        (terminal) => {
          const model = terminalModels[paneKeyOf(terminal)]
          return [model?.resumeId, model?.sessionId]
        }
      ),
    [terminals, meta, seed, providerIds, deskNames, terminalModels]
  )
  const board = useDuduAdeStore((state) => state.board)
  useEffect(() => {
    if (!loaded || seed === undefined || !namingOpen) {
      return
    }
    const now = Date.now()
    // Read the store now: a sync that ran a moment ago in the same commit is already in it.
    if (reconcileIdentity(useDuduAdeStore.getState().board, identities, seed, now)) {
      useDuduAdeStore
        .getState()
        .updateBoard((current) => reconcileIdentity(current, identities, seed, now) ?? {})
    }
    setRestored(true)
  }, [board, identities, seed, loaded, namingOpen])
  return { identities, savedLayout: saved.seed, layoutText: saved.text, restored }
}
