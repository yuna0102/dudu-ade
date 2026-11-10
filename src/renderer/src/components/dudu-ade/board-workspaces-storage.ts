import { readPersistedJson } from './dudu-ade-persistence'
import {
  assetCardKey,
  emptyBoardLayout,
  type BoardCardGeometry,
  type BoardViewport,
  type BoardWorkspaces
} from './board-layout-state'

export const BOARD_V1_STORAGE_KEY = 'dudu-ade:board:v1'
export const BOARDS_STORAGE_KEY = 'dudu-ade:boards:v2'

export function isBoardWorkspaces(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  const state = value as Partial<BoardWorkspaces>
  return (
    typeof state.activeId === 'string' &&
    Array.isArray(state.boards) &&
    state.boards.length > 0 &&
    state.boards.every(
      (board) =>
        !!board &&
        typeof board.id === 'string' &&
        !!board.viewport &&
        typeof board.viewport.zoom === 'number' &&
        !!board.cards &&
        Array.isArray(board.hiddenKeys) &&
        Array.isArray(board.categories) &&
        !!board.categoryOf &&
        !!board.notes
    )
  )
}

type BoardLayoutV1 = {
  viewport: BoardViewport
  terminalCards: Record<string, BoardCardGeometry>
  hiddenTerminalKeys: string[]
  assetCards: (BoardCardGeometry & { assetId: string })[]
}

/** First release stored one board without categories; keep its cards, then lay them out by category once. */
export function migrateV1Board(value: unknown): BoardWorkspaces | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const v1 = value as Partial<BoardLayoutV1>
  if (!v1.viewport || !v1.terminalCards || !Array.isArray(v1.assetCards)) {
    return null
  }
  const board = emptyBoardLayout()
  board.viewport = v1.viewport
  board.cards = { ...v1.terminalCards }
  for (const { assetId, ...geometry } of v1.assetCards) {
    board.cards[assetCardKey(assetId)] = geometry
  }
  board.hiddenKeys = Array.isArray(v1.hiddenTerminalKeys) ? [...v1.hiddenTerminalKeys] : []
  return { activeId: board.id, boards: [board] }
}

/** Saved boards, else the v1 board migrated (its key stays, so an older build still reads it), else a fresh board. */
export function loadBoardWorkspaces(): BoardWorkspaces {
  const saved = readPersistedJson<BoardWorkspaces | null>(
    BOARDS_STORAGE_KEY,
    null,
    isBoardWorkspaces
  )
  if (saved) {
    // Boards saved before links and asset panels existed have no such fields.
    const boards = saved.boards.map((board) => ({
      ...board,
      links: Array.isArray(board.links) ? board.links : [],
      assetPanels:
        board.assetPanels && typeof board.assetPanels === 'object' ? board.assetPanels : {}
    }))
    return {
      activeId: boards.some((board) => board.id === saved.activeId) ? saved.activeId : boards[0].id,
      boards
    }
  }
  const migrated = migrateV1Board(
    readPersistedJson<unknown>(BOARD_V1_STORAGE_KEY, null, () => true)
  )
  if (migrated) {
    return migrated
  }
  const board = emptyBoardLayout()
  return { activeId: board.id, boards: [board] }
}
