import type { FormAllow } from './asset-meta'
import type { TerminalAgentModel } from '../../../../shared/dudu-ade-terminal-models'
import type { CollectedAssetKind } from './asset-path-extraction'
import type {
  BoardCardGeometry,
  BoardCategory,
  BoardLayout,
  BoardNote,
  BoardNoteKind,
  BoardViewport,
  BoardWorkspaces
} from './board-layout-state'

export type DuduAdePanel = 'board' | 'assets'

export type CollectedAssetSource = {
  terminalTitle: string | null
  worktreeId: string
  worktreePath: string
  branch: string
  tabId: string
  leafId: string
}

export type CollectedAsset = {
  id: string
  kind: CollectedAssetKind
  location: string
  firstSeenAt: number
  lastSeenAt: number
  source: CollectedAssetSource
  /** The conversation wrote this file, but it is no longer on disk. */
  missing?: boolean
}

/** `seenAt` is when the conversation really produced it; absent means now. */
export type FoundAsset = Omit<CollectedAsset, 'firstSeenAt' | 'lastSeenAt'> & { seenAt?: number }

export type AssetDockState = {
  open: boolean
  width: number
  pinnedIds: string[]
  /** Assets first seen after this get the "new" badge. */
  seenAt: number
}

export type FocusRequest = { key: string; at: number }

export type DuduAdeState = {
  panel: DuduAdePanel | null
  workspaces: BoardWorkspaces
  board: BoardLayout
  assets: CollectedAsset[]
  dock: AssetDockState
  previewAssetId: string | null
  focusRequest: FocusRequest | null
  terminalModels: Record<string, TerminalAgentModel>
  openPanel: (panel: DuduAdePanel) => void
  closePanel: () => void
  // Boards (workspaces)
  switchBoard: (id: string) => void
  addBoard: (name: string) => void
  renameBoard: (id: string, name: string) => void
  deleteBoard: (id: string) => void
  // Active board
  updateBoard: (update: (board: BoardLayout) => Partial<BoardLayout>) => void
  /** Every board: a card keeps its place under a new key. */
  carryCard: (from: string, to: string) => void
  setViewport: (viewport: BoardViewport) => void
  setCard: (key: string, geometry: BoardCardGeometry) => void
  setCards: (cards: Record<string, BoardCardGeometry>) => void
  removeCard: (key: string) => void
  showTerminal: (key: string, geometry: BoardCardGeometry) => void
  addAssetCard: (assetId: string, at?: { x: number; y: number }) => void
  addNote: (kind: BoardNoteKind, at: { x: number; y: number }, note?: Partial<BoardNote>) => string
  updateNote: (key: string, patch: Partial<BoardNote>) => void
  createCategory: (name: string, anchor: { x: number; y: number }) => string
  updateCategory: (id: string, patch: Partial<BoardCategory>) => void
  /** Moves a category's cards and its frame together. */
  moveCategory: (id: string, keys: readonly string[], dx: number, dy: number) => void
  deleteCategory: (id: string) => void
  assignCategory: (keys: readonly string[], categoryId: string | null) => void
  focusCard: (key: string) => void
  // Assets
  recordAssets: (found: FoundAsset[], now: number) => void
  setMissingAssets: (missing: ReadonlySet<string>, checked: ReadonlySet<string>) => void
  forgetAsset: (assetId: string) => void
  clearAssets: () => void
  /** Replaces cut artifact links with the one full address each is the start of. */
  repairAssetLinks: (fullUrls: readonly string[]) => void
  setDock: (patch: Partial<AssetDockState>) => void
  togglePinAsset: (assetId: string) => void
  setPreviewAsset: (assetId: string | null) => void
  /** The asset whose shown name is being edited, wherever it is listed. */
  renamingAssetId: string | null
  startRenameAsset: (assetId: string | null) => void
  /** The HTML asset whose artifact page the user is typing in. */
  linkingAssetId: string | null
  startLinkAsset: (assetId: string | null) => void
  /** The HTML asset whose form saving the user is being asked to allow. */
  formAllowingAssetId: string | null
  startFormAllow: (assetId: string | null) => void
  /** Per page file: how many times its preview was sent back to the page itself (after a saved form). */
  pageResets: Record<string, number>
  resetPage: (path: string) => void
  /** Sets or clears (null) what the active board says about one asset. */
  setAssetMeta: (
    assetId: string,
    patch: { name?: string | null; artifactUrl?: string | null; formAllow?: FormAllow | null }
  ) => void
  /** Files picked or typed by hand for a card: recorded as assets of its window and kept on its list. */
  addManualAssets: (cardKey: string, source: CollectedAssetSource, paths: readonly string[]) => void
  /** Also lists this asset on another card. */
  shareAsset: (assetId: string, cardKey: string) => void
  /** Off a card's list: dropped for good if added by hand, hidden if the collector found it. */
  removeAssetFromCard: (assetId: string, cardKey: string, collectedHere: boolean) => void
  setTerminalModels: (models: Record<string, TerminalAgentModel>) => void
}
