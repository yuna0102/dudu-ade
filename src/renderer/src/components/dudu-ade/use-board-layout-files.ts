import { useCallback, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { paneKeyOf } from './board-agent-labels'
import {
  boardChangeKind,
  createLayoutAutoSaver,
  type LayoutAutoSaver
} from './board-layout-autosave'
import type { CardIdentity } from './board-identity'
import {
  buildLayoutSeed,
  buildWindows,
  layoutContent,
  mergeWithPrevious
} from './board-layout-seed'
import { applyRestore, parseRestoreSeed, type RestoreSeed } from './board-restore'
import type { BoardTerminal } from './board-terminal-listing'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'
import type { BoardTerminalMeta } from './use-board-terminals'

/** Saving the board by itself, the "save layout" menu and "go back to the saved layout". */
export function useBoardLayoutFiles(args: {
  identities: CardIdentity[]
  terminals: BoardTerminal[]
  meta: Map<string, BoardTerminalMeta>
  providerIds: Record<string, string>
  savedLayout: RestoreSeed | null
  layoutText: string | null
  restored: boolean
  /** Keeps the current layout so one undo brings it back. */
  rememberLayout: () => void
}): { saveLayout: () => void; restoreLayout: () => void } {
  const {
    identities,
    terminals,
    meta,
    providerIds,
    savedLayout,
    layoutText,
    restored,
    rememberLayout
  } = args
  const latest = useRef({ identities, terminals, meta, providerIds, savedLayout, restored })
  latest.current = { identities, terminals, meta, providerIds, savedLayout, restored }
  // What was last written, so windows that closed since keep their place in the next save too.
  const previous = useRef<RestoreSeed | null>(null)

  const build = useCallback((): string | null => {
    const now = latest.current
    if (!now.restored) {
      return null
    }
    const store = useDuduAdeStore.getState()
    const named = now.identities.filter((card) => card.name && card.key in store.board.cards)
    if (named.length === 0) {
      return null
    }
    const windows = buildWindows(now.terminals, now.identities, {
      tabTitleOf: (key) => now.meta.get(key)?.tabName ?? null,
      sessionIdOf: (terminal) => {
        const model = store.terminalModels[paneKeyOf(terminal)]
        return now.providerIds[terminal.key] ?? model?.resumeId ?? model?.sessionId ?? null
      }
    })
    const seed = buildLayoutSeed(store.board, now.identities, now.providerIds, new Date(), windows)
    const liveNames = new Set(now.identities.flatMap((card) => (card.name ? [card.name] : [])))
    const merged = mergeWithPrevious(seed, previous.current ?? now.savedLayout, liveNames)
    return JSON.stringify(merged, null, 2)
  }, [])

  const saver: LayoutAutoSaver = useMemo(
    () =>
      createLayoutAutoSaver({
        build,
        contentOf: layoutContent,
        write: async (text) => {
          const saved = (await window.api.shell.duduAdeWriteBoardLayout?.(text)) ?? false
          if (saved) {
            previous.current = parseRestoreSeed(text)
          }
          return saved
        },
        initialContent: layoutText ? layoutContent(layoutText) : null
      }),
    [build, layoutText]
  )
  useEffect(() => () => saver.dispose(), [saver])

  const board = useDuduAdeStore((state) => state.board)
  const lastBoard = useRef(board)
  useEffect(() => {
    const change = boardChangeKind(lastBoard.current, board)
    lastBoard.current = board
    if (change && restored) {
      saver.notify(change)
    }
  }, [board, restored, saver])
  // A window opening or changing surface changes the file without touching the board.
  useEffect(() => {
    if (restored) {
      saver.notify('content')
    }
  }, [identities, restored, saver])

  const saveLayout = useCallback((): void => {
    void saver
      .saveNow()
      .then((saved) => toast(saved ? DUDU_ADE_COPY.layoutSaved : DUDU_ADE_COPY.layoutSaveFailed))
  }, [saver])
  const restoreLayout = useCallback((): void => {
    void window.api.shell
      .duduAdeReadBoardLayout?.()
      .then((text) => {
        const seed = text ? parseRestoreSeed(text) : null
        if (!seed) {
          toast(DUDU_ADE_COPY.layoutNone)
          return
        }
        rememberLayout()
        useDuduAdeStore.getState().updateBoard((current) => {
          const restoredBoard = applyRestore(current, seed, latest.current.identities, {
            force: true
          })
          return restoredBoard ?? {}
        })
        toast(DUDU_ADE_COPY.layoutRestored)
      })
      .catch(() => toast(DUDU_ADE_COPY.layoutNone))
  }, [rememberLayout])
  return { saveLayout, restoreLayout }
}
