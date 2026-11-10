import {
  EMPTY_FRAME_SIZE,
  cardHeight,
  isTerminalCardKey,
  type BoardCardGeometry,
  type BoardLayout,
  type BoardRect
} from './board-layout-state'

export type AreaEdges = { n?: boolean; e?: boolean; s?: boolean; w?: boolean }

/** Smaller than this a drag was a slip, not an area. */
export const MIN_DRAWN_AREA = 40

export function rectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number }
): BoardRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y)
  }
}

/** Cards whose center is inside: a card only brushing the edge stays out. */
export function keysInsideRect(
  rect: BoardRect,
  keys: readonly string[],
  cards: Record<string, BoardCardGeometry>
): string[] {
  return keys.filter((key) => {
    const card = cards[key]
    if (!card) {
      return false
    }
    const cx = card.x + card.w / 2
    const cy = card.y + cardHeight(card) / 2
    return cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h
  })
}

/** Drags the named edges; the frame cannot get smaller than its cards or an empty frame. */
export function resizeAreaRect(
  rect: BoardRect,
  edges: AreaEdges,
  dx: number,
  dy: number,
  memberRect: BoardRect | null
): BoardRect {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.w
  let bottom = rect.y + rect.h
  if (edges.w) {
    left = Math.min(left + dx, right - EMPTY_FRAME_SIZE.w, memberRect?.x ?? Infinity)
  }
  if (edges.e) {
    right = Math.max(
      right + dx,
      left + EMPTY_FRAME_SIZE.w,
      memberRect ? memberRect.x + memberRect.w : -Infinity
    )
  }
  if (edges.n) {
    top = Math.min(top + dy, bottom - EMPTY_FRAME_SIZE.h, memberRect?.y ?? Infinity)
  }
  if (edges.s) {
    bottom = Math.max(
      bottom + dy,
      top + EMPTY_FRAME_SIZE.h,
      memberRect ? memberRect.y + memberRect.h : -Infinity
    )
  }
  return { x: left, y: top, w: right - left, h: bottom - top }
}

/** The next sync files terminals again by tab name; cards in an area the user drew stay there. */
export function withoutAutoFiling(board: BoardLayout): Pick<BoardLayout, 'categoryOf'> {
  return {
    categoryOf: Object.fromEntries(
      Object.entries(board.categoryOf).filter(
        ([key, id]) =>
          !isTerminalCardKey(key) ||
          board.categories.some((category) => category.id === id && category.rect)
      )
    )
  }
}
