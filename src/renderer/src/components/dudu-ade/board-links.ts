import {
  cardHeight,
  type BoardCardGeometry,
  type BoardLayout,
  type BoardRect
} from './board-layout-state'

type Point = { x: number; y: number }

/** Where the ray from the rect's center towards `toward` leaves the rect. */
function rectExit(rect: BoardRect, toward: Point): Point {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const dx = toward.x - cx
  const dy = toward.y - cy
  if (dx === 0 && dy === 0) {
    return { x: cx, y: cy }
  }
  const t = Math.min(
    dx === 0 ? Infinity : rect.w / 2 / Math.abs(dx),
    dy === 0 ? Infinity : rect.h / 2 / Math.abs(dy)
  )
  return { x: cx + dx * t, y: cy + dy * t }
}

/** Straight link between two card rects, clipped to their borders; null when they overlap. */
export function linkSegment(
  from: BoardRect,
  to: BoardRect
): { a: Point; b: Point; mid: Point } | null {
  const fromCenter = { x: from.x + from.w / 2, y: from.y + from.h / 2 }
  const toCenter = { x: to.x + to.w / 2, y: to.y + to.h / 2 }
  const overlap =
    from.x < to.x + to.w && to.x < from.x + from.w && from.y < to.y + to.h && to.y < from.y + from.h
  if (overlap) {
    return null
  }
  const a = rectExit(from, toCenter)
  const b = rectExit(to, fromCenter)
  return { a, b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
}

/** Topmost card (last drawn) under a board point. */
export function cardKeyAt(
  point: Point,
  keys: string[],
  cards: Record<string, BoardCardGeometry>
): string | null {
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    const card = cards[keys[index]]
    if (
      card &&
      point.x >= card.x &&
      point.x <= card.x + card.w &&
      point.y >= card.y &&
      point.y <= card.y + cardHeight(card)
    ) {
      return keys[index]
    }
  }
  return null
}

/** Chat sessions sit on the board like terminals; the suffix keeps their keys apart from pane keys. */
export function boardChatKey(worktreeId: string, tabId: string): string {
  return `${worktreeId}::${tabId}::chat`
}

/** Chat cards carry this key shape from boardChatKey. */
export function isBoardChatKey(key: string): boolean {
  return key.endsWith('::chat')
}

/** Moves a card's place, category, hidden flag and links to a new key (a terminal continued as a chat). */
function movedEntry<T>(
  record: Record<string, T> | undefined,
  from: string,
  to: string
): Record<string, T> | undefined {
  if (!record || !(from in record)) {
    return record
  }
  const { [from]: value, ...rest } = record
  return { ...rest, [to]: value }
}

export function rekeyBoardCard(board: BoardLayout, from: string, to: string): BoardLayout {
  if (from === to || !(from in board.cards)) {
    return board
  }
  const { [from]: geometry, ...cards } = board.cards
  const { [from]: category, ...categoryOf } = board.categoryOf
  const swap = (key: string): string => (key === from ? to : key)
  const { [from]: panel, ...assetPanels } = board.assetPanels
  // Assets remember the terminal that printed them, so the panel keeps the old key as a source.
  const moved = { ...(panel ?? { categories: [] }), sources: [...(panel?.sources ?? []), from] }
  return {
    ...board,
    cards: { ...cards, [to]: geometry },
    categoryOf: from in board.categoryOf ? { ...categoryOf, [to]: category } : categoryOf,
    hiddenKeys: board.hiddenKeys.map(swap),
    links: board.links.map((link) => ({ ...link, from: swap(link.from), to: swap(link.to) })),
    assetPanels: { ...assetPanels, [to]: moved },
    ...(board.names ? { names: movedEntry(board.names, from, to) } : {}),
    ...(board.seenAt ? { seenAt: movedEntry(board.seenAt, from, to) } : {})
  }
}
