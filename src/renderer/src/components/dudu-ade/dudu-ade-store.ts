/* eslint-disable max-lines -- Why: board state and its persistence must update together in one store. */
import { create } from 'zustand'
import type { CollectedAssetKind } from './asset-path-extraction'
import {
  ASSET_CARD_SIZE,
  CATEGORY_COLORS,
  NOTE_CARD_SIZE,
  NOTE_KEY_PREFIX,
  assetCardKey,
  emptyBoardLayout,
  findFreeSlot,
  isTerminalCardKey,
  newBoardId,
  type BoardLayout,
  type BoardWorkspaces
} from './board-layout-state'
import { rekeyBoardCard } from './board-links'
import { BOARDS_STORAGE_KEY, loadBoardWorkspaces } from './board-workspaces-storage'
import { readPersistedJson, writePersistedJsonSoon } from './dudu-ade-persistence'
import type { AssetDockState, CollectedAsset, DuduAdeState } from './dudu-ade-store-types'

export type {
  AssetDockState,
  CollectedAsset,
  CollectedAssetSource,
  DuduAdePanel,
  FocusRequest
} from './dudu-ade-store-types'

const ASSETS_STORAGE_KEY = 'dudu-ade:assets:v1'
const DOCK_STORAGE_KEY = 'dudu-ade:dock:v1'
// Conversation history brings a window's whole past; roughly 2MB of localStorage at this count.
const MAX_ASSETS = 5000

function isDockState(value: unknown): boolean {
  const dock = value as Partial<AssetDockState> | null
  return !!dock && typeof dock.width === 'number' && Array.isArray(dock.pinnedIds)
}

function persistWorkspaces(workspaces: BoardWorkspaces): BoardWorkspaces {
  writePersistedJsonSoon(BOARDS_STORAGE_KEY, workspaces)
  return workspaces
}

function persistAssets(assets: CollectedAsset[]): CollectedAsset[] {
  writePersistedJsonSoon(ASSETS_STORAGE_KEY, assets)
  return assets
}

function activeBoard(workspaces: BoardWorkspaces): BoardLayout {
  return workspaces.boards.find((board) => board.id === workspaces.activeId) ?? workspaces.boards[0]
}

/** Applies a change to the active board and persists every board. */
function withActiveBoard(
  state: DuduAdeState,
  update: (board: BoardLayout) => Partial<BoardLayout>
): Pick<DuduAdeState, 'workspaces' | 'board'> {
  const current = activeBoard(state.workspaces)
  const board = { ...current, ...update(current) }
  const workspaces = persistWorkspaces({
    ...state.workspaces,
    boards: state.workspaces.boards.map((entry) => (entry.id === board.id ? board : entry))
  })
  return { workspaces, board }
}

/** Drops a card key from every board (forgotten assets). */
function withoutCardEverywhere(
  state: DuduAdeState,
  keys: Set<string>
): Pick<DuduAdeState, 'workspaces' | 'board'> {
  const strip = (board: BoardLayout): BoardLayout => ({
    ...board,
    cards: Object.fromEntries(Object.entries(board.cards).filter(([key]) => !keys.has(key))),
    categoryOf: Object.fromEntries(
      Object.entries(board.categoryOf).filter(([key]) => !keys.has(key))
    ),
    links: board.links.filter((link) => !keys.has(link.from) && !keys.has(link.to))
  })
  const workspaces = persistWorkspaces({
    ...state.workspaces,
    boards: state.workspaces.boards.map(strip)
  })
  return { workspaces, board: activeBoard(workspaces) }
}

const initialWorkspaces = loadBoardWorkspaces()

export const useDuduAdeStore = create<DuduAdeState>()((set) => ({
  panel: null,
  workspaces: initialWorkspaces,
  board: activeBoard(initialWorkspaces),
  assets: readPersistedJson<CollectedAsset[]>(ASSETS_STORAGE_KEY, [], Array.isArray),
  dock: readPersistedJson<AssetDockState>(
    DOCK_STORAGE_KEY,
    { open: true, width: 320, pinnedIds: [], seenAt: Date.now() },
    isDockState
  ),
  previewAssetId: null,
  focusRequest: null,
  terminalModels: {},
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null, previewAssetId: null }),
  switchBoard: (id) =>
    set((state) => {
      const workspaces = persistWorkspaces({ ...state.workspaces, activeId: id })
      return { workspaces, board: activeBoard(workspaces) }
    }),
  addBoard: (name) =>
    set((state) => {
      const board = emptyBoardLayout(name, false)
      const workspaces = persistWorkspaces({
        activeId: board.id,
        boards: [...state.workspaces.boards, board]
      })
      return { workspaces, board }
    }),
  renameBoard: (id, name) =>
    set((state) => {
      const workspaces = persistWorkspaces({
        ...state.workspaces,
        boards: state.workspaces.boards.map((board) =>
          board.id === id ? { ...board, name } : board
        )
      })
      return { workspaces, board: activeBoard(workspaces) }
    }),
  deleteBoard: (id) =>
    set((state) => {
      const boards = state.workspaces.boards.filter((board) => board.id !== id)
      if (boards.length === 0) {
        return {}
      }
      const activeId = state.workspaces.activeId === id ? boards[0].id : state.workspaces.activeId
      const workspaces = persistWorkspaces({ activeId, boards })
      return { workspaces, board: activeBoard(workspaces) }
    }),
  updateBoard: (update) => set((state) => withActiveBoard(state, update)),
  carryCard: (from, to) =>
    set((state) => {
      const workspaces = persistWorkspaces({
        ...state.workspaces,
        boards: state.workspaces.boards.map((board) => rekeyBoardCard(board, from, to))
      })
      return { workspaces, board: activeBoard(workspaces) }
    }),
  setViewport: (viewport) => set((state) => withActiveBoard(state, () => ({ viewport }))),
  setCard: (key, geometry) =>
    set((state) =>
      withActiveBoard(state, (board) => ({ cards: { ...board.cards, [key]: geometry } }))
    ),
  setCards: (cards) =>
    set((state) => withActiveBoard(state, (board) => ({ cards: { ...board.cards, ...cards } }))),
  removeCard: (key) =>
    set((state) =>
      withActiveBoard(state, (board) => {
        if (isTerminalCardKey(key)) {
          return { hiddenKeys: [...new Set([...board.hiddenKeys, key])] }
        }
        const { [key]: _removed, ...cards } = board.cards
        const { [key]: _note, ...notes } = board.notes
        const { [key]: _category, ...categoryOf } = board.categoryOf
        const links = board.links.filter((link) => link.from !== key && link.to !== key)
        return { cards, notes, categoryOf, links }
      })
    ),
  showTerminal: (key, geometry) =>
    set((state) =>
      withActiveBoard(state, (board) => ({
        hiddenKeys: board.hiddenKeys.filter((hidden) => hidden !== key),
        cards: { ...board.cards, [key]: geometry }
      }))
    ),
  addAssetCard: (assetId, at) =>
    set((state) =>
      withActiveBoard(state, (board) => {
        const key = assetCardKey(assetId)
        if (board.cards[key] && !at) {
          return {}
        }
        const geometry = at
          ? { ...ASSET_CARD_SIZE, ...at }
          : findFreeSlot(Object.values(board.cards), ASSET_CARD_SIZE, 6)
        return { cards: { ...board.cards, [key]: geometry } }
      })
    ),
  addNote: (kind, at, note) => {
    const key = `${NOTE_KEY_PREFIX}${newBoardId()}`
    set((state) =>
      withActiveBoard(state, (board) => {
        const size =
          kind === 'kanban' || kind === 'web' || kind === 'artifact' || kind === 'markdown'
            ? { w: 640, h: 400 }
            : kind === 'text'
              ? { w: 360, h: 160 }
              : NOTE_CARD_SIZE
        return {
          cards: { ...board.cards, [key]: { ...size, ...at } },
          notes: { ...board.notes, [key]: { kind, items: [], ...note } }
        }
      })
    )
    return key
  },
  updateNote: (key, patch) =>
    set((state) =>
      withActiveBoard(state, (board) =>
        board.notes[key]
          ? { notes: { ...board.notes, [key]: { ...board.notes[key], ...patch } } }
          : {}
      )
    ),
  createCategory: (name, anchor) => {
    const id = newBoardId()
    set((state) =>
      withActiveBoard(state, (board) => ({
        categories: [
          ...board.categories,
          {
            id,
            name,
            anchor,
            color: CATEGORY_COLORS[board.categories.length % CATEGORY_COLORS.length]
          }
        ]
      }))
    )
    return id
  },
  updateCategory: (id, patch) =>
    set((state) =>
      withActiveBoard(state, (board) => ({
        categories: board.categories.map((category) =>
          category.id === id ? { ...category, ...patch } : category
        )
      }))
    ),
  moveCategory: (id, keys, dx, dy) =>
    set((state) =>
      withActiveBoard(state, (board) => {
        const cards = { ...board.cards }
        for (const key of keys) {
          cards[key] = { ...cards[key], x: cards[key].x + dx, y: cards[key].y + dy }
        }
        const categories = board.categories.map((category) =>
          category.id === id
            ? {
                ...category,
                anchor: { x: category.anchor.x + dx, y: category.anchor.y + dy },
                ...(category.rect
                  ? { rect: { ...category.rect, x: category.rect.x + dx, y: category.rect.y + dy } }
                  : {})
              }
            : category
        )
        return { cards, categories }
      })
    ),
  deleteCategory: (id) =>
    set((state) =>
      withActiveBoard(state, (board) => ({
        categories: board.categories.filter((category) => category.id !== id),
        // Members stay on the board, unclassified, and are not auto-sorted back in.
        categoryOf: Object.fromEntries(
          Object.entries(board.categoryOf).map(([key, value]) => [key, value === id ? null : value])
        )
      }))
    ),
  assignCategory: (keys, categoryId) =>
    set((state) =>
      withActiveBoard(state, (board) => {
        const categoryOf = { ...board.categoryOf }
        for (const key of keys) {
          categoryOf[key] = categoryId
        }
        return { categoryOf }
      })
    ),
  focusCard: (key) => set({ focusRequest: { key, at: Date.now() }, previewAssetId: null }),
  recordAssets: (found, now) =>
    set((state) => {
      if (found.length === 0) {
        return {}
      }
      const byId = new Map(state.assets.map((asset) => [asset.id, asset]))
      for (const { seenAt = now, ...asset } of found) {
        const existing = byId.get(asset.id)
        // The earliest producer stays the source, so the window that wrote a file beats one that later mentioned it.
        byId.set(
          asset.id,
          !existing
            ? { ...asset, firstSeenAt: seenAt, lastSeenAt: seenAt }
            : seenAt < existing.firstSeenAt
              ? { ...existing, source: asset.source, firstSeenAt: seenAt }
              : { ...existing, lastSeenAt: Math.max(existing.lastSeenAt, seenAt) }
        )
      }
      const assets = [...byId.values()]
        .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
        .slice(0, MAX_ASSETS)
      return { assets: persistAssets(assets) }
    }),
  setMissingAssets: (missing, checked) =>
    set((state) => {
      let changed = false
      const assets = state.assets.map((asset) => {
        if (!checked.has(asset.id) || !!asset.missing === missing.has(asset.id)) {
          return asset
        }
        changed = true
        return { ...asset, missing: missing.has(asset.id) }
      })
      return changed ? { assets: persistAssets(assets) } : {}
    }),
  forgetAsset: (assetId) =>
    set((state) => ({
      assets: persistAssets(state.assets.filter((asset) => asset.id !== assetId)),
      ...withoutCardEverywhere(state, new Set([assetCardKey(assetId)]))
    })),
  clearAssets: () =>
    set((state) => ({
      assets: persistAssets([]),
      ...withoutCardEverywhere(state, new Set(state.assets.map((asset) => assetCardKey(asset.id))))
    })),
  setDock: (patch) =>
    set((state) => {
      const dock = { ...state.dock, ...patch }
      writePersistedJsonSoon(DOCK_STORAGE_KEY, dock)
      return { dock }
    }),
  togglePinAsset: (assetId) =>
    set((state) => {
      const pinned = state.dock.pinnedIds.includes(assetId)
      const dock = {
        ...state.dock,
        pinnedIds: pinned
          ? state.dock.pinnedIds.filter((id) => id !== assetId)
          : [assetId, ...state.dock.pinnedIds]
      }
      writePersistedJsonSoon(DOCK_STORAGE_KEY, dock)
      return { dock }
    }),
  setPreviewAsset: (assetId) => set({ previewAssetId: assetId }),
  setTerminalModels: (models) => set({ terminalModels: models })
}))

export function collectedAssetId(kind: CollectedAssetKind, location: string): string {
  return `${kind}:${location}`
}
