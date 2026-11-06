/* eslint-disable max-lines -- one streaming and layout pass kept together; it has no natural seam */
import {
  BOARD_CARD_GAP,
  FRAME_LABEL,
  FRAME_PAD,
  GROUP_GAP,
  cardHeight,
  categoryFrameRect,
  type BoardCardGeometry,
  type BoardCategory,
  type BoardLink,
  type BoardRect
} from './board-layout-state'

const PUSH_GAP = BOARD_CARD_GAP / 2
/** Fixed room for the floating label; tied to zoom, zooming out would look like growth and push cards. */
export const CARD_LABEL_RESERVE = 32
const MAX_PUSHES = 400

/** A card plus the asset panel on its left. */
export function cardFootprint(card: BoardCardGeometry, leftSpace: number): BoardRect {
  return {
    x: card.x - leftSpace,
    y: card.y - CARD_LABEL_RESERVE,
    w: card.w + leftSpace,
    h: cardHeight(card) + CARD_LABEL_RESERVE
  }
}

function touching(a: BoardRect, b: BoardRect): boolean {
  return (
    a.x < b.x + b.w + PUSH_GAP &&
    b.x < a.x + a.w + PUSH_GAP &&
    a.y < b.y + b.h + PUSH_GAP &&
    b.y < a.y + a.h + PUSH_GAP
  )
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}\0${b}` : `${b}\0${a}`)

/** Overlaps that already exist are the user's choice and are left alone. */
export function overlappingPairs(rects: Record<string, BoardRect>): Set<string> {
  const keys = Object.keys(rects)
  const pairs = new Set<string>()
  keys.forEach((a, index) => {
    for (const b of keys.slice(index + 1)) {
      if (touching(rects[a], rects[b])) {
        pairs.add(pairKey(a, b))
      }
    }
  })
  return pairs
}

/** Cards that got bigger without being dragged; a move keeps its size and never counts. */
export function grownKeys(
  previous: Record<string, BoardRect>,
  next: Record<string, BoardRect>
): string[] {
  return Object.keys(next).filter((key) => {
    const before = previous[key]
    return before !== undefined && (next[key].w > before.w || next[key].h > before.h)
  })
}

function inside(rect: BoardRect, bounds: BoardRect): boolean {
  return (
    rect.x >= bounds.x &&
    rect.y >= bounds.y &&
    rect.x + rect.w <= bounds.x + bounds.w &&
    rect.y + rect.h <= bounds.y + bounds.h
  )
}

/** The smallest straight move that takes `moving` clear of `fixed`, staying inside `bounds` if any such move does. */
function clearOf(
  moving: BoardRect,
  fixed: BoardRect,
  bounds?: BoardRect
): { x: number; y: number } {
  const all = [
    { x: fixed.x + fixed.w + PUSH_GAP - moving.x, y: 0 },
    { x: fixed.x - PUSH_GAP - (moving.x + moving.w), y: 0 },
    { x: 0, y: fixed.y + fixed.h + PUSH_GAP - moving.y },
    { x: 0, y: fixed.y - PUSH_GAP - (moving.y + moving.h) }
  ]
  const fitting = bounds
    ? all.filter((step) =>
        inside({ ...moving, x: moving.x + step.x, y: moving.y + step.y }, bounds)
      )
    : []
  const options = fitting.length > 0 ? fitting : all
  return options.reduce((best, option) =>
    Math.abs(option.x) + Math.abs(option.y) < Math.abs(best.x) + Math.abs(best.y) ? option : best
  )
}

/**
 * Moves only the cards in the way, by the least distance, chaining as far as needed. A pinned card never
 * moves; if the card that grew hits one, the grower steps aside instead.
 */
export function pushApart(args: {
  rects: Record<string, BoardRect>
  start: readonly string[]
  pinned: ReadonlySet<string>
  ignored?: ReadonlySet<string>
  /** Prefer moves that stay in here; one that does not fit overflows. */
  bounds?: BoardRect
}): Record<string, BoardRect> {
  const rects = { ...args.rects }
  const moved: Record<string, BoardRect> = {}
  const queue = [...args.start]
  let budget = MAX_PUSHES
  while (queue.length > 0 && budget > 0) {
    const key = queue.shift()!
    for (const other of Object.keys(rects)) {
      if (
        other === key ||
        args.ignored?.has(pairKey(key, other)) ||
        !touching(rects[key], rects[other]) ||
        budget <= 0
      ) {
        continue
      }
      budget -= 1
      const target = args.pinned.has(other) ? key : other
      const fixed = target === key ? other : key
      if (args.pinned.has(target)) {
        continue
      }
      const step = clearOf(rects[target], rects[fixed], args.bounds)
      rects[target] = { ...rects[target], x: rects[target].x + step.x, y: rects[target].y + step.y }
      moved[target] = rects[target]
      queue.push(target)
    }
  }
  return moved
}

export type PushArea = Pick<BoardCategory, 'id' | 'anchor' | 'rect'>

const areaUnit = (id: string): string => `area:${id}`

/**
 * pushApart that respects areas: cards first make room inside their own area, the area grows only when that
 * does not fit, and then areas and loose cards push each other as whole units.
 */
export function pushApartInAreas(args: {
  rects: Record<string, BoardRect>
  /** Layout before this change; overlaps it already had stay, and it gives each area its room. */
  previous: Record<string, BoardRect>
  start: readonly string[]
  pinned: ReadonlySet<string>
  ignored?: ReadonlySet<string>
  areas: readonly PushArea[]
  areaOf: (key: string) => string | null | undefined
}): { moved: Record<string, BoardRect>; areaMoves: Record<string, { x: number; y: number }> } {
  const { previous, start, pinned, ignored, areas, areaOf } = args
  const rects = { ...args.rects }
  const areaIds = new Set(areas.map((area) => area.id))
  const members = new Map<string, string[]>()
  const loose: string[] = []
  for (const key of Object.keys(rects)) {
    const id = areaOf(key)
    if (id && areaIds.has(id)) {
      members.set(id, [...(members.get(id) ?? []), key])
    } else {
      loose.push(key)
    }
  }
  const frame = (area: PushArea, from: Record<string, BoardRect>): BoardRect =>
    categoryFrameRect(
      area,
      (members.get(area.id) ?? []).flatMap((key) => from[key] ?? [])
    )
  const pick = (keys: readonly string[]): Record<string, BoardRect> =>
    Object.fromEntries(keys.map((key) => [key, rects[key]]))

  for (const area of areas) {
    const keys = members.get(area.id) ?? []
    const startInArea = start.filter((key) => keys.includes(key))
    if (startInArea.length > 0) {
      const hadRoom = keys.some((key) => previous[key])
      Object.assign(
        rects,
        pushApart({
          rects: pick(keys),
          start: startInArea,
          pinned,
          ignored,
          bounds: frame(area, hadRoom ? previous : rects)
        })
      )
    }
  }

  // An undrawn area without cards shows nothing, so it takes no room.
  const shownAreas = areas.filter((area) => area.rect || members.has(area.id))
  const units = (from: Record<string, BoardRect>): Record<string, BoardRect> => ({
    ...Object.fromEntries(loose.flatMap((key) => (from[key] ? [[key, from[key]]] : []))),
    ...Object.fromEntries(shownAreas.map((area) => [areaUnit(area.id), frame(area, from)]))
  })
  const unitRects = units(rects)
  const before = units(previous)
  const unitStart = [
    ...start.filter((key) => loose.includes(key)),
    ...shownAreas
      .filter((area) => {
        const was = before[areaUnit(area.id)]
        const now = unitRects[areaUnit(area.id)]
        return (
          (members.get(area.id) ?? []).some((key) => start.includes(key)) ||
          (was && (now.w > was.w || now.h > was.h))
        )
      })
      .map((area) => areaUnit(area.id))
  ]
  const unitMoves = pushApart({
    rects: unitRects,
    start: unitStart,
    pinned: new Set([
      ...loose.filter((key) => pinned.has(key)),
      ...shownAreas
        .filter((area) => (members.get(area.id) ?? []).some((key) => pinned.has(key)))
        .map((area) => areaUnit(area.id))
    ]),
    ignored: overlappingPairs(before)
  })
  const areaMoves: Record<string, { x: number; y: number }> = {}
  for (const area of shownAreas) {
    const to = unitMoves[areaUnit(area.id)]
    if (!to) {
      continue
    }
    const step = {
      x: to.x - unitRects[areaUnit(area.id)].x,
      y: to.y - unitRects[areaUnit(area.id)].y
    }
    areaMoves[area.id] = step
    for (const key of members.get(area.id) ?? []) {
      rects[key] = { ...rects[key], x: rects[key].x + step.x, y: rects[key].y + step.y }
    }
  }
  for (const key of loose) {
    if (unitMoves[key]) {
      rects[key] = unitMoves[key]
    }
  }
  const moved = Object.fromEntries(
    Object.keys(rects).flatMap((key) =>
      rects[key].x !== args.rects[key].x || rects[key].y !== args.rects[key].y
        ? [[key, rects[key]]]
        : []
    )
  )
  return { moved, areaMoves }
}

/** Longest path from a card with nothing pointing at it; a cycle stops growing after one pass per card. */
export function linkRanks(
  keys: readonly string[],
  links: readonly BoardLink[]
): Map<string, number> {
  const ranks = new Map(keys.map((key) => [key, 0]))
  for (let pass = 0; pass < keys.length; pass += 1) {
    for (const { from, to } of links) {
      const fromRank = ranks.get(from)
      const toRank = ranks.get(to)
      if (fromRank !== undefined && toRank !== undefined && toRank <= fromRank && from !== to) {
        ranks.set(to, fromRank + 1)
      }
    }
  }
  return ranks
}

/**
 * Positions for "tidy": areas side by side, inside each one columns following the links from left to
 * right. Pinned cards stay and the rest go around them.
 */
export function tidyLayout(args: {
  keys: readonly string[]
  cards: Record<string, BoardCardGeometry>
  links: readonly BoardLink[]
  groupOf: (key: string) => string | null
  leftSpace: (key: string) => number
}): Record<string, { x: number; y: number }> {
  const { keys, cards, links, groupOf, leftSpace } = args
  const ranks = linkRanks(keys, links)
  const free = keys.filter((key) => !cards[key].pinned)
  if (free.length === 0) {
    return {}
  }
  const groups = new Map<string | null, string[]>()
  for (const key of free) {
    groups.set(groupOf(key), [...(groups.get(groupOf(key)) ?? []), key])
  }
  const minRank = (members: string[]): number =>
    Math.min(...members.map((key) => ranks.get(key) ?? 0))
  const ordered = [...groups.entries()].sort((a, b) => minRank(a[1]) - minRank(b[1]))
  const originX = Math.min(...free.map((key) => cards[key].x - leftSpace(key)))
  const originY = Math.min(...free.map((key) => cards[key].y - CARD_LABEL_RESERVE))
  const rects: Record<string, BoardRect> = {}
  let cursorX = originX
  for (const [groupId, members] of ordered) {
    const columns = [...new Set(members.map((key) => ranks.get(key) ?? 0))].sort((a, b) => a - b)
    const top = originY + (groupId === null ? 0 : FRAME_LABEL + FRAME_PAD)
    let columnX = cursorX + (groupId === null ? 0 : FRAME_PAD)
    for (const rank of columns) {
      let y = top
      let width = 0
      for (const key of members.filter((member) => (ranks.get(member) ?? 0) === rank)) {
        const footprint = cardFootprint(cards[key], leftSpace(key))
        rects[key] = { ...footprint, x: columnX, y }
        y += footprint.h + BOARD_CARD_GAP
        width = Math.max(width, footprint.w)
      }
      columnX += width + BOARD_CARD_GAP
    }
    cursorX = columnX + (groupId === null ? 0 : FRAME_PAD) + GROUP_GAP
  }
  const pinned = keys.filter((key) => cards[key].pinned)
  for (const key of pinned) {
    rects[key] = cardFootprint(cards[key], leftSpace(key))
  }
  Object.assign(
    rects,
    pushApartInAreas({
      rects,
      previous: {},
      start: pinned,
      pinned: new Set(pinned),
      areas: [...new Set(keys.map(groupOf))].flatMap((id) =>
        id ? [{ id, anchor: { x: originX, y: originY } }] : []
      ),
      areaOf: groupOf
    }).moved
  )
  return Object.fromEntries(
    free.map((key) => [
      key,
      { x: rects[key].x + leftSpace(key), y: rects[key].y + CARD_LABEL_RESERVE }
    ])
  )
}
