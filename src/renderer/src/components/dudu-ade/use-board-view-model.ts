import { useEffect, useMemo, useState } from 'react'
import type { TerminalAgentModel } from '../../../../shared/dudu-ade-terminal-models'
import { agentBucket, modelDistribution, paneKeyOf } from './board-agent-labels'
import {
  FRAME_LABEL,
  categoryFrameRect,
  isTerminalCardKey,
  type BoardLayout
} from './board-layout-state'
import { groupCardKeys, liveCardKeys, syncBoardTerminals } from './board-sync'
import type { BoardTerminal } from './board-terminal-listing'
import type { CategorySummary } from './BoardCategoryFrame'
import type { MissionMapGroup } from './BoardMissionMap'
import { cardDisplayTitle } from './BoardTerminalCard'
import { ALL_WORKSPACES } from './BoardToolbar'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore, type CollectedAsset } from './dudu-ade-store'
import type { BoardTerminalMeta } from './use-board-terminals'

const UNCATEGORIZED_COLOR = '#8E8C99'
// Tabs restore a moment after startup; after this, terminals without a known tab sort by workspace.
const TAB_LOOKUP_GRACE_MS = 8_000

/** Classifies and places new terminals; saved positions and the user's category edits always win. */
export function useBoardAutoSync({
  board,
  terminals,
  meta,
  loaded,
  workspaceName,
  updateBoard
}: {
  board: BoardLayout
  terminals: BoardTerminal[]
  meta: Map<string, BoardTerminalMeta>
  loaded: boolean
  workspaceName: (worktreeId: string, worktreePath: string) => string
  updateBoard: (update: (board: BoardLayout) => Partial<BoardLayout>) => void
}): void {
  const [graceOver, setGraceOver] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setGraceOver(true), TAB_LOOKUP_GRACE_MS)
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!loaded) {
      return
    }
    const list = terminals.map((terminal) => {
      const info = meta.get(terminal.key)
      const ready = info?.tabFound || graceOver
      return {
        key: terminal.key,
        categoryName: ready
          ? (info?.tabName ?? workspaceName(terminal.worktreeId, terminal.worktreePath))
          : null
      }
    })
    // The store, not this render's board: restoring may have just run in this same commit, and an update
    // worked out from the older board would put back every card it moved.
    if (syncBoardTerminals(useDuduAdeStore.getState().board, list)) {
      updateBoard((current) => syncBoardTerminals(current, list) ?? {})
    }
  }, [board, terminals, meta, loaded, graceOver, workspaceName, updateBoard])
}

/** Derived board view: which cards draw, category frames, their summaries, the mission map and minimap. */
export function useBoardViewModel({
  board,
  terminals,
  terminalsByKey,
  assetsById,
  workspaceFilter,
  meta,
  terminalModels,
  workspaceName
}: {
  board: BoardLayout
  terminals: BoardTerminal[]
  terminalsByKey: Map<string, BoardTerminal>
  assetsById: Map<string, CollectedAsset>
  workspaceFilter: string
  meta: Map<string, BoardTerminalMeta>
  terminalModels: Record<string, TerminalAgentModel>
  workspaceName: (worktreeId: string, worktreePath: string) => string
}) {
  const terminalKeySet = useMemo(
    () => new Set(terminals.map((terminal) => terminal.key)),
    [terminals]
  )
  const liveKeys = useMemo(() => {
    const keys = liveCardKeys(board, terminalKeySet).filter((key) =>
      key.startsWith('asset:') ? assetsById.has(key.slice('asset:'.length)) : true
    )
    if (workspaceFilter === ALL_WORKSPACES) {
      return keys
    }
    return keys.filter(
      (key) => !isTerminalCardKey(key) || terminalsByKey.get(key)?.worktreeId === workspaceFilter
    )
  }, [board, terminalKeySet, assetsById, workspaceFilter, terminalsByKey])

  const groups = useMemo(() => groupCardKeys(board, liveKeys), [board, liveKeys])
  const collapsedKeys = useMemo(() => {
    const collapsed = new Set(
      board.categories.filter((category) => category.collapsed).map((category) => category.id)
    )
    return new Set(liveKeys.filter((key) => collapsed.has(board.categoryOf[key] ?? '')))
  }, [board, liveKeys])

  const frames = useMemo(
    () =>
      board.categories.map((category) => {
        const keys = groups.find((group) => group.id === category.id)?.keys ?? []
        return {
          category,
          keys,
          rect: categoryFrameRect(
            category,
            keys.map((key) => board.cards[key])
          )
        }
      }),
    [board, groups]
  )

  const summaries = useMemo(() => {
    const result = new Map<string, CategorySummary>()
    for (const { category, keys } of frames) {
      const buckets = { working: 0, attention: 0, waiting: 0 }
      const models: (string | null)[] = []
      for (const key of keys) {
        const terminal = terminalsByKey.get(key)
        if (terminal) {
          buckets[agentBucket(meta.get(key)?.status)] += 1
          models.push(terminalModels[paneKeyOf(terminal)]?.model ?? null)
        }
      }
      result.set(category.id, { count: keys.length, buckets, models: modelDistribution(models) })
    }
    return result
  }, [frames, terminalsByKey, meta, terminalModels])

  const missionGroups: MissionMapGroup[] = useMemo(() => {
    const toItems = (keys: string[]): MissionMapGroup['items'] =>
      keys.flatMap((key) => {
        const terminal = terminalsByKey.get(key)
        return terminal
          ? [
              {
                key,
                title: cardDisplayTitle(terminal, board.names),
                status: meta.get(key)?.status,
                model: terminalModels[paneKeyOf(terminal)]
              }
            ]
          : []
      })
    return groups
      .map((group) => {
        const category = board.categories.find((entry) => entry.id === group.id)
        return {
          id: group.id ?? '__loose__',
          name: category?.name ?? DUDU_ADE_COPY.uncategorized,
          color: category?.color ?? UNCATEGORIZED_COLOR,
          items: toItems(group.keys)
        }
      })
      .filter((group) => group.items.length > 0)
  }, [groups, board.categories, board.names, terminalsByKey, meta, terminalModels])

  const minimapRects = useMemo(
    () => [
      ...frames.map(({ category, rect }) => ({
        rect: category.collapsed ? { ...rect, h: FRAME_LABEL } : rect,
        color: category.color
      })),
      ...liveKeys
        .filter((key) => !collapsedKeys.has(key) && !board.categoryOf[key])
        .map((key) => ({ rect: board.cards[key], color: UNCATEGORIZED_COLOR }))
    ],
    [frames, liveKeys, collapsedKeys, board]
  )

  const workspaces = useMemo(() => {
    const byId = new Map<string, string>()
    for (const terminal of terminals) {
      byId.set(terminal.worktreeId, workspaceName(terminal.worktreeId, terminal.worktreePath))
    }
    return [...byId.entries()]
  }, [terminals, workspaceName])

  return {
    terminalKeySet,
    liveKeys,
    collapsedKeys,
    frames,
    summaries,
    missionGroups,
    minimapRects,
    workspaces
  }
}
