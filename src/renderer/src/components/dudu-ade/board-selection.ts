import {
  cardHeight,
  hitTestFrames,
  type BoardCardGeometry,
  type BoardCategory,
  type BoardRect
} from './board-layout-state'

const AREA_PREFIX = 'area:'

export type AlignMode = 'left' | 'top' | 'distribute-x' | 'distribute-y'

/** Selection holds card keys and areas side by side; an area's key never collides with a card's. */
export function areaSelectionKey(id: string): string {
  return `${AREA_PREFIX}${id}`
}

export function selectedAreaIds(selected: ReadonlySet<string>): string[] {
  return [...selected]
    .filter((key) => key.startsWith(AREA_PREFIX))
    .map((key) => key.slice(AREA_PREFIX.length))
}

export function toggleSelection(selected: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(selected)
  if (!next.delete(key)) {
    next.add(key)
  }
  return next
}

function touches(a: BoardRect, b: BoardRect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

/** A selection box takes every card it touches, and an area only when it is fully inside, so a box drawn within an area picks its cards. */
export function selectionInBox(
  box: BoardRect,
  keys: readonly string[],
  cards: Record<string, BoardCardGeometry>,
  frames: readonly { id: string; rect: BoardRect }[]
): string[] {
  return [
    ...keys.filter((key) => {
      const card = cards[key]
      return card && touches(box, { x: card.x, y: card.y, w: card.w, h: cardHeight(card) })
    }),
    ...frames
      .filter(
        ({ rect }) =>
          rect.x >= box.x &&
          rect.y >= box.y &&
          rect.x + rect.w <= box.x + box.w &&
          rect.y + rect.h <= box.y + box.h
      )
      .map(({ id }) => areaSelectionKey(id))
  ]
}

/** Selected cards plus the cards of selected areas. */
export function selectedCardKeys(
  selected: ReadonlySet<string>,
  cards: Record<string, BoardCardGeometry>,
  categoryOf: Record<string, string | null>
): string[] {
  const areas = new Set(selectedAreaIds(selected))
  return Object.keys(cards).filter((key) => selected.has(key) || areas.has(categoryOf[key] ?? ''))
}

/** Everything selected, shifted from where it started; drags pass the total distance, so nothing drifts. */
export function moveSelection(
  base: {
    cards: Record<string, BoardCardGeometry>
    categories: readonly BoardCategory[]
    categoryOf: Record<string, string | null>
  },
  selected: ReadonlySet<string>,
  dx: number,
  dy: number
): { cards: Record<string, BoardCardGeometry>; categories: BoardCategory[] } {
  const areas = new Set(selectedAreaIds(selected))
  return {
    cards: Object.fromEntries(
      selectedCardKeys(selected, base.cards, base.categoryOf).map((key) => [
        key,
        { ...base.cards[key], x: base.cards[key].x + dx, y: base.cards[key].y + dy, placed: true }
      ])
    ),
    categories: base.categories.map((category) =>
      areas.has(category.id)
        ? {
            ...category,
            anchor: { x: category.anchor.x + dx, y: category.anchor.y + dy },
            ...(category.rect
              ? { rect: { ...category.rect, x: category.rect.x + dx, y: category.rect.y + dy } }
              : {})
          }
        : category
    )
  }
}

/**
 * Which area each moved card landed in, by the same point a single drag uses. Frames are the ones from
 * before the drag: an auto frame grows with its cards and would never let them leave. Cards of a selected
 * area travel with it and keep their area.
 */
export function membershipAfterMove(
  moved: Record<string, BoardCardGeometry>,
  frames: readonly { id: string; rect: BoardRect }[],
  selected: ReadonlySet<string>,
  categoryOf: Record<string, string | null>
): Map<string | null, string[]> {
  const movingAreas = new Set(selectedAreaIds(selected))
  const targets = frames.filter((frame) => !movingAreas.has(frame.id))
  const changes = new Map<string | null, string[]>()
  for (const [key, card] of Object.entries(moved)) {
    const current = categoryOf[key] ?? null
    if (current !== null && movingAreas.has(current)) {
      continue
    }
    const target = hitTestFrames({ x: card.x + card.w / 2, y: card.y + 16 }, targets)
    if (target !== current) {
      changes.set(target, [...(changes.get(target) ?? []), key])
    }
  }
  return changes
}

/** Left and top edges line up on the first card; distribute keeps the outer two and evens the gaps between them. */
export function alignCards(
  cards: Record<string, BoardCardGeometry>,
  keys: readonly string[],
  mode: AlignMode
): Record<string, BoardCardGeometry> {
  const members = keys.filter((key) => cards[key])
  if (members.length < 2) {
    return {}
  }
  const result: Record<string, BoardCardGeometry> = {}
  if (mode === 'left' || mode === 'top') {
    const axis = mode === 'left' ? 'x' : 'y'
    const edge = Math.min(...members.map((key) => cards[key][axis]))
    for (const key of members) {
      result[key] = { ...cards[key], [axis]: edge, placed: true }
    }
    return result
  }
  const axis = mode === 'distribute-x' ? 'x' : 'y'
  const size = (key: string): number => (axis === 'x' ? cards[key].w : cardHeight(cards[key]))
  const ordered = [...members].sort((a, b) => cards[a][axis] - cards[b][axis])
  const first = cards[ordered[0]][axis]
  const last = ordered.at(-1)!
  const span = cards[last][axis] + size(last) - first
  const gap = (span - ordered.reduce((sum, key) => sum + size(key), 0)) / (ordered.length - 1)
  let cursor = first
  for (const key of ordered) {
    result[key] = { ...cards[key], [axis]: cursor, placed: true }
    cursor += size(key) + gap
  }
  return result
}

/** The box around everything selected. */
export function selectionBounds(rects: readonly BoardRect[]): BoardRect | null {
  if (rects.length === 0) {
    return null
  }
  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  return {
    x,
    y,
    w: Math.max(...rects.map((rect) => rect.x + rect.w)) - x,
    h: Math.max(...rects.map((rect) => rect.y + rect.h)) - y
  }
}

/** What to outline: an area by its frame, a card by its own rect. */
export function selectionRects(
  selected: ReadonlySet<string>,
  frames: readonly { category: Pick<BoardCategory, 'id'>; rect: BoardRect }[],
  rectFor: (key: string) => BoardRect | null
): BoardRect[] {
  return [...selected].flatMap(
    (key) =>
      frames.find(({ category }) => areaSelectionKey(category.id) === key)?.rect ??
      rectFor(key) ??
      []
  )
}
