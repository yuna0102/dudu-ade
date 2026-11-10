/* eslint-disable max-lines -- Why: board shape and its geometry helpers are read together. */
import type { BoardAssetPanel } from './board-asset-panels'
import type { AssetMeta } from './asset-meta'

export type BoardViewport = { x: number; y: number; zoom: number }

export type BoardCardGeometry = {
  x: number
  y: number
  w: number
  h: number
  collapsed?: boolean
  /** The user resized this terminal card, so its PTY follows the card instead of being scaled. */
  fitPty?: boolean
  /** Auto layout never moves this card; others go around it. */
  pinned?: boolean
  /** The user put this card here (drag, resize, align), so restoring never overwrites it. */
  placed?: boolean
}

export type BoardRect = { x: number; y: number; w: number; h: number }

export type BoardCategory = {
  id: string
  name: string
  color: string
  collapsed?: boolean
  /** Frame position while the category has no cards. */
  anchor: { x: number; y: number }
  /** The name the area first had, so windows still find it after the user renames it. */
  autoName?: string
  /** An area the user drew or resized; the frame stays this big and only grows to wrap its cards. */
  rect?: BoardRect
}

export type BoardNoteKind =
  | 'sticky'
  | 'text'
  | 'checklist'
  | 'kanban'
  | 'web'
  | 'git'
  | 'artifact'
  | 'markdown'

export type BoardNoteItem = { id: string; text: string; done?: boolean; column?: number }

export type BoardNote = {
  kind: BoardNoteKind
  text?: string
  color?: string
  items?: BoardNoteItem[]
  url?: string
  worktreeId?: string
  /** artifact: what it is called, and a local page to preview beside or instead of the link. */
  title?: string
  localHtml?: string
  /** markdown: the file the card reads and saves. */
  filePath?: string
}

/** A user-drawn arrow between two cards (e.g. planning to dev to QA). */
export type BoardLink = {
  id: string
  from: string
  to: string
  label?: string
  /** How the two windows work together, in plain words; the windows read it and act on it. */
  rule?: string
  twoWay?: boolean
  /** on-finish: remind the sending window of the rule whenever it finishes work. */
  trigger?: 'manual' | 'on-finish'
  /** What the windows were last told; differs from the current rule until applied again. */
  appliedFingerprint?: string
}

export type BoardLayout = {
  id: string
  name: string
  viewport: BoardViewport
  /** Card key: terminal pane key (worktree::tab::leaf), `asset:<id>` or `note:<id>`. */
  cards: Record<string, BoardCardGeometry>
  /** Terminals the user took off this board. */
  hiddenKeys: string[]
  /** The first board follows every terminal; extra boards only show terminals added by hand. */
  autoAddTerminals: boolean
  categories: BoardCategory[]
  /** Absent key: not classified yet (auto). null: the user took it out of every category. */
  categoryOf: Record<string, string | null>
  notes: Record<string, BoardNote>
  links: BoardLink[]
  /** false turns off pushing cards apart on this board; absent means on. */
  autoPush?: boolean
  /** Card key to window name, so a window reopened under a new key takes its old place back. */
  names?: Record<string, string>
  /** When each card key was last seen alive (ms); decides which old key is newest and when an unnamed one is dropped. */
  seenAt?: Record<string, number>
  /** The restore file whose values were applied to this board, and what of it is already done. */
  restoredFrom?: string
  restoredProgress?: {
    viewport?: boolean
    areas?: boolean
    notes?: boolean
    assetMeta?: boolean
    cards?: string[]
    links?: string[]
  }
  /** Per card: the asset panel's collapsed state and categories. */
  assetPanels: Record<string, BoardAssetPanel>
  /** Per asset id: the name shown for it and the artifact page it is a copy of. The file itself is never renamed. */
  assetMeta?: Record<string, AssetMeta>
  /** Lay everything out by category once the first terminals arrive. */
  arrangePending?: boolean
}

export type BoardWorkspaces = { activeId: string; boards: BoardLayout[] }

export type LayoutPreset = 'grid' | 'columns' | 'row'

export const BOARD_MIN_ZOOM = 0.1
export const BOARD_MAX_ZOOM = 2
export const TERMINAL_CARD_SIZE = { w: 640, h: 400 }
export const ASSET_CARD_SIZE = { w: 320, h: 280 }
export const NOTE_CARD_SIZE = { w: 280, h: 240 }
export const BOARD_CARD_GAP = 32
export const BOARD_HEADER_HEIGHT = 32
export const FRAME_PAD = 20
export const FRAME_LABEL = 40
export const GROUP_GAP = 64
export const EMPTY_FRAME_SIZE = { w: 360, h: 160 }
const GRID_WRAP_WIDTH = 4200

export const CATEGORY_COLORS = ['#6E48E5', '#8B6CF0', '#A78BFA', '#5B3CC4', '#8E8C99'] as const

export const ASSET_KEY_PREFIX = 'asset:'
export const NOTE_KEY_PREFIX = 'note:'

export function assetCardKey(assetId: string): string {
  return `${ASSET_KEY_PREFIX}${assetId}`
}

export function isTerminalCardKey(key: string): boolean {
  return !key.startsWith(ASSET_KEY_PREFIX) && !key.startsWith(NOTE_KEY_PREFIX)
}

export function newBoardId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function emptyBoardLayout(name = '메인 보드', autoAddTerminals = true): BoardLayout {
  return {
    id: newBoardId(),
    name,
    viewport: { x: 40, y: 40, zoom: 0.6 },
    cards: {},
    hiddenKeys: [],
    autoAddTerminals,
    categories: [],
    categoryOf: {},
    notes: {},
    links: [],
    assetPanels: {},
    arrangePending: autoAddTerminals
  }
}

export function clampZoom(zoom: number): number {
  return Math.min(BOARD_MAX_ZOOM, Math.max(BOARD_MIN_ZOOM, zoom))
}

/** Zoom around a screen point so the content under the cursor stays put. */
export function zoomViewportAt(
  viewport: BoardViewport,
  nextZoom: number,
  anchor: { x: number; y: number }
): BoardViewport {
  const zoom = clampZoom(nextZoom)
  const ratio = zoom / viewport.zoom
  return {
    zoom,
    x: anchor.x - (anchor.x - viewport.x) * ratio,
    y: anchor.y - (anchor.y - viewport.y) * ratio
  }
}

export function cardHeight(card: BoardCardGeometry): number {
  return card.collapsed ? BOARD_HEADER_HEIGHT : card.h
}

function overlaps(a: BoardCardGeometry, b: BoardCardGeometry): boolean {
  return (
    a.x < b.x + b.w + BOARD_CARD_GAP / 2 &&
    b.x < a.x + a.w + BOARD_CARD_GAP / 2 &&
    a.y < b.y + cardHeight(b) + BOARD_CARD_GAP / 2 &&
    b.y < a.y + a.h + BOARD_CARD_GAP / 2
  )
}

/** First free slot (row-major from `origin`, `columns` wide) that overlaps no existing card. */
export function findFreeSlot(
  occupied: readonly BoardCardGeometry[],
  size: { w: number; h: number },
  columns = 3,
  origin = { x: 0, y: 0 }
): BoardCardGeometry {
  const stepX = Math.max(size.w, ASSET_CARD_SIZE.w) + BOARD_CARD_GAP
  const stepY = Math.max(size.h, ASSET_CARD_SIZE.h) + BOARD_CARD_GAP
  for (let index = 0; index < 400; index += 1) {
    const candidate = {
      x: origin.x + (index % columns) * stepX,
      y: origin.y + Math.floor(index / columns) * stepY,
      ...size
    }
    if (!occupied.some((card) => overlaps(card, candidate))) {
      return candidate
    }
  }
  const bottom = occupied.reduce((max, card) => Math.max(max, card.y + card.h), origin.y)
  return { x: origin.x, y: bottom + BOARD_CARD_GAP, ...size }
}

export function boundsOf(cards: readonly BoardCardGeometry[]): BoardRect | null {
  if (cards.length === 0) {
    return null
  }
  const minX = Math.min(...cards.map((card) => card.x))
  const minY = Math.min(...cards.map((card) => card.y))
  const maxX = Math.max(...cards.map((card) => card.x + card.w))
  const maxY = Math.max(...cards.map((card) => card.y + cardHeight(card)))
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** A category frame wraps its cards (plus label row); empty categories sit at their anchor. */
export function categoryFrameRect(
  category: Pick<BoardCategory, 'anchor' | 'rect'>,
  members: readonly BoardCardGeometry[]
): BoardRect {
  const bounds = boundsOf(members)
  if (!bounds) {
    return category.rect ?? { ...category.anchor, ...EMPTY_FRAME_SIZE }
  }
  const wrap = {
    x: bounds.x - FRAME_PAD,
    y: bounds.y - FRAME_PAD - FRAME_LABEL,
    w: bounds.w + FRAME_PAD * 2,
    h: bounds.h + FRAME_PAD * 2 + FRAME_LABEL
  }
  if (!category.rect) {
    return wrap
  }
  const x = Math.min(wrap.x, category.rect.x)
  const y = Math.min(wrap.y, category.rect.y)
  return {
    x,
    y,
    w: Math.max(wrap.x + wrap.w, category.rect.x + category.rect.w) - x,
    h: Math.max(wrap.y + wrap.h, category.rect.y + category.rect.h) - y
  }
}

/** Smallest frame containing the point wins, so nested-looking overlaps pick the tighter one. */
export function hitTestFrames(
  point: { x: number; y: number },
  frames: readonly { id: string; rect: BoardRect }[]
): string | null {
  let best: { id: string; area: number } | null = null
  for (const { id, rect } of frames) {
    const inside =
      point.x >= rect.x &&
      point.x <= rect.x + rect.w &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.h
    const area = rect.w * rect.h
    if (inside && (!best || area < best.area)) {
      best = { id, area }
    }
  }
  return best?.id ?? null
}

export type ArrangeGroup = { id: string | null; keys: string[] }

function groupColumns(count: number, preset: LayoutPreset): number {
  if (preset === 'columns') {
    return 1
  }
  if (preset === 'row') {
    return Math.max(1, count)
  }
  return Math.max(1, Math.ceil(Math.sqrt(count)))
}

/**
 * Lays groups out side by side as blocks (each block leaves room for its frame), cards inside a
 * block row-major with the preset's column count. Returns card geometry and each group's frame origin.
 */
export function arrangeGroups(
  groups: readonly ArrangeGroup[],
  sizes: Record<string, BoardCardGeometry>,
  preset: LayoutPreset,
  origin = { x: 0, y: 0 }
): { cards: Record<string, BoardCardGeometry>; anchors: Record<string, { x: number; y: number }> } {
  const cards: Record<string, BoardCardGeometry> = {}
  const anchors: Record<string, { x: number; y: number }> = {}
  let cursorX = origin.x
  let cursorY = origin.y
  let rowHeight = 0
  for (const group of groups) {
    const columns = groupColumns(group.keys.length, preset)
    const cellW = Math.max(
      EMPTY_FRAME_SIZE.w - FRAME_PAD * 2,
      ...group.keys.map((key) => sizes[key]?.w ?? 0)
    )
    const placed: Record<string, BoardCardGeometry> = {}
    let innerH = 0
    for (let rowStart = 0; rowStart < group.keys.length; rowStart += columns) {
      const rowKeys = group.keys.slice(rowStart, rowStart + columns)
      const rowH = Math.max(...rowKeys.map((key) => (sizes[key] ? cardHeight(sizes[key]) : 0)))
      rowKeys.forEach((key, column) => {
        const size = sizes[key] ?? { ...TERMINAL_CARD_SIZE, x: 0, y: 0 }
        placed[key] = { ...size, x: column * (cellW + BOARD_CARD_GAP), y: innerH }
      })
      innerH += rowH + BOARD_CARD_GAP
    }
    innerH = Math.max(0, innerH - BOARD_CARD_GAP)
    const usedColumns = Math.min(columns, Math.max(1, group.keys.length))
    const innerW = usedColumns * cellW + (usedColumns - 1) * BOARD_CARD_GAP
    const blockW = innerW + FRAME_PAD * 2
    const blockH = Math.max(EMPTY_FRAME_SIZE.h, innerH + FRAME_PAD * 2 + FRAME_LABEL)
    if (preset === 'grid' && cursorX > origin.x && cursorX + blockW > origin.x + GRID_WRAP_WIDTH) {
      cursorX = origin.x
      cursorY += rowHeight + GROUP_GAP
      rowHeight = 0
    }
    const innerX = cursorX + FRAME_PAD
    const innerY = cursorY + FRAME_PAD + FRAME_LABEL
    for (const [key, geometry] of Object.entries(placed)) {
      cards[key] = { ...geometry, x: innerX + geometry.x, y: innerY + geometry.y }
    }
    if (group.id) {
      anchors[group.id] = { x: cursorX, y: cursorY }
    }
    cursorX += blockW + GROUP_GAP
    rowHeight = Math.max(rowHeight, blockH)
  }
  return { cards, anchors }
}

/** Viewport that shows every rect inside a screen box, capped at 100%. */
export function fitViewportToCards(
  cards: readonly BoardCardGeometry[],
  screen: { width: number; height: number },
  padding = 48
): BoardViewport | null {
  const bounds = boundsOf(cards)
  if (!bounds || screen.width <= 0 || screen.height <= 0) {
    return null
  }
  const zoom = clampZoom(
    Math.min(
      1,
      (screen.width - padding * 2) / Math.max(1, bounds.w),
      (screen.height - padding * 2) / Math.max(1, bounds.h)
    )
  )
  return { zoom, x: padding - bounds.x * zoom, y: padding - bounds.y * zoom }
}

/** Centers a rect on screen at the zoom that fits it (never past 100%). */
export function centerViewportOn(
  rect: BoardRect,
  screen: { width: number; height: number }
): BoardViewport {
  const fitZoom = Math.min((screen.width * 0.8) / rect.w, (screen.height * 0.8) / rect.h)
  const zoom = clampZoom(Math.min(1, fitZoom))
  return {
    zoom,
    x: screen.width / 2 - (rect.x + rect.w / 2) * zoom,
    y: screen.height / 2 - (rect.y + rect.h / 2) * zoom
  }
}
