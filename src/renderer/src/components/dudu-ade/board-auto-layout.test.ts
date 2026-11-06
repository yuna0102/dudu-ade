import { describe, expect, it } from 'vitest'
import { keysInsideRect, rectFromPoints, resizeAreaRect } from './board-areas'
import { panelSpace } from './board-asset-panels'
import {
  cardFootprint,
  grownKeys,
  linkRanks,
  overlappingPairs,
  pushApart,
  pushApartInAreas,
  tidyLayout
} from './board-auto-layout'
import { categoryFrameRect, emptyBoardLayout } from './board-layout-state'
import { BOARDS_STORAGE_KEY, loadBoardWorkspaces } from './board-workspaces-storage'
import { vi, afterEach } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

const rect = (x: number, y: number, w = 100, h = 100) => ({ x, y, w, h })

describe('areas', () => {
  it('draws from any corner and takes cards whose center is inside', () => {
    const drawn = rectFromPoints({ x: 300, y: 300 }, { x: 0, y: 0 })
    expect(drawn).toEqual(rect(0, 0, 300, 300))
    const cards = { in: rect(10, 10), edge: rect(280, 10), out: rect(500, 500) }
    expect(keysInsideRect(drawn, ['in', 'edge', 'out'], cards)).toEqual(['in'])
  })

  it('keeps a drawn size and grows only to wrap a card outside it', () => {
    const category = { anchor: { x: 0, y: 0 }, rect: rect(0, 0, 800, 600) }
    expect(categoryFrameRect(category, [])).toEqual(rect(0, 0, 800, 600))
    expect(categoryFrameRect(category, [rect(100, 100)])).toEqual(rect(0, 0, 800, 600))
    const grown = categoryFrameRect(category, [rect(900, 100)])
    expect(grown.x).toBe(0)
    expect(grown.w).toBeGreaterThan(1000)
  })

  it('resizes by edge without shrinking past its cards', () => {
    const base = rect(0, 0, 1000, 1000)
    expect(resizeAreaRect(base, { e: true }, 200, 50, null)).toEqual(rect(0, 0, 1200, 1000))
    expect(resizeAreaRect(base, { n: true, w: true }, 100, 100, null)).toEqual(
      rect(100, 100, 900, 900)
    )
    expect(resizeAreaRect(base, { e: true }, -900, 0, rect(0, 0, 700, 300)).w).toBe(700)
  })

  it('gives older boards no auto push setting, which reads as on', () => {
    const { autoPush: _unset, ...old } = emptyBoardLayout()
    const saved = JSON.stringify({ activeId: old.id, boards: [old] })
    vi.stubGlobal('window', {
      localStorage: { getItem: (key: string) => (key === BOARDS_STORAGE_KEY ? saved : null) }
    })
    expect(loadBoardWorkspaces().boards[0].autoPush === false).toBe(false)
  })
})

describe('push apart', () => {
  it('counts the asset panel in the footprint', () => {
    expect(cardFootprint({ x: 500, y: 0, w: 100, h: 100 }, 252)).toEqual(rect(248, -32, 352, 132))
    expect(panelSpace(undefined, 0)).toBe(0)
    expect(panelSpace(undefined, 3)).toBe(252)
    expect(panelSpace({ collapsed: true, categories: [] }, 3)).toBe(44)
  })

  it('moves only the card in the way, by the least distance', () => {
    const rects = { grew: rect(0, 0, 300, 100), next: rect(280, 0), far: rect(2000, 0) }
    const moved = pushApart({ rects, start: ['grew'], pinned: new Set() })
    expect(Object.keys(moved)).toEqual(['next'])
    expect(moved.next.x).toBe(316)
    expect(moved.next.y).toBe(0)
  })

  it('chains only as far as needed', () => {
    const rects = { a: rect(0, 0, 300, 100), b: rect(280, 0), c: rect(400, 0), d: rect(3000, 0) }
    const moved = pushApart({ rects, start: ['a'], pinned: new Set() })
    expect(Object.keys(moved).sort()).toEqual(['b', 'c'])
  })

  it('never moves a pinned card; the other card goes around it', () => {
    const rects = { grew: rect(0, 0, 300, 100), pin: rect(280, 0) }
    const moved = pushApart({ rects, start: ['grew'], pinned: new Set(['pin']) })
    expect(moved.pin).toBeUndefined()
    expect(moved.grew).toBeDefined()
  })

  it('leaves a pair the user already overlapped alone', () => {
    const before = { a: rect(0, 0), b: rect(50, 0) }
    const ignored = overlappingPairs(before)
    const after = { a: rect(0, 0, 150, 100), b: rect(50, 0) }
    expect(
      pushApart({ rects: after, start: grownKeys(before, after), pinned: new Set(), ignored })
    ).toEqual({})
  })

  it('treats growth, not a drag, as the trigger', () => {
    expect(grownKeys({ a: rect(0, 0) }, { a: rect(500, 500) })).toEqual([])
    expect(grownKeys({ a: rect(0, 0) }, { a: rect(-252, 0, 352, 100) })).toEqual(['a'])
    expect(grownKeys({}, { a: rect(0, 0) })).toEqual([])
  })
})

describe('tidy', () => {
  const links = [
    { id: '1', from: 'plan', to: 'dev' },
    { id: '2', from: 'ux', to: 'dev' },
    { id: '3', from: 'dev', to: 'qa' }
  ]
  const cards = {
    qa: rect(0, 0),
    dev: rect(0, 500),
    plan: rect(900, 0),
    ux: rect(900, 500)
  }

  it('ranks along the links and survives a cycle', () => {
    const ranks = linkRanks(['plan', 'ux', 'dev', 'qa'], links)
    expect([ranks.get('plan'), ranks.get('ux'), ranks.get('dev'), ranks.get('qa')]).toEqual([
      0, 0, 1, 2
    ])
    expect(
      linkRanks(
        ['a', 'b'],
        [
          { id: '', from: 'a', to: 'b' },
          { id: '', from: 'b', to: 'a' }
        ]
      ).size
    ).toBe(2)
  })

  it('lays linked cards out left to right', () => {
    const at = tidyLayout({
      keys: Object.keys(cards),
      cards,
      links,
      groupOf: () => null,
      leftSpace: () => 0
    })
    expect(at.plan.x).toBeLessThan(at.dev.x)
    expect(at.ux.x).toBe(at.plan.x)
    expect(at.dev.x).toBeLessThan(at.qa.x)
  })

  it('keeps pinned cards out of the result and clears them', () => {
    const pinned = { ...cards, qa: { ...cards.qa, pinned: true } }
    const at = tidyLayout({
      keys: Object.keys(pinned),
      cards: pinned,
      links,
      groupOf: () => null,
      leftSpace: () => 0
    })
    expect(at.qa).toBeUndefined()
    const rects = Object.fromEntries(
      Object.entries(at).map(([key, point]) => [key, { ...point, w: 100, h: 100 }])
    )
    expect(overlappingPairs({ ...rects, qa: pinned.qa })).toEqual(new Set())
  })

  it('keeps each area together', () => {
    const at = tidyLayout({
      keys: Object.keys(cards),
      cards,
      links: [],
      groupOf: (key) => (key === 'plan' || key === 'ux' ? 'a' : 'b'),
      leftSpace: () => 0
    })
    expect(at.plan.x).toBe(at.ux.x)
    expect(at.dev.x).toBe(at.qa.x)
    expect(at.plan.x).not.toBe(at.dev.x)
  })
})

describe('pushing with areas', () => {
  const area = { id: 'a', anchor: { x: 0, y: 0 }, rect: rect(0, 0, 1000, 400) }
  const areaOfA = (key: string): string | null => (key.startsWith('a') ? 'a' : null)
  const push = (args: {
    rects: Record<string, ReturnType<typeof rect>>
    previous: Record<string, ReturnType<typeof rect>>
    start: string[]
    areas?: (typeof area)[]
    pinned?: string[]
  }) =>
    pushApartInAreas({
      areas: [area],
      areaOf: areaOfA,
      ...args,
      pinned: new Set(args.pinned ?? [])
    })

  it('moves a card inside its area even when another direction is shorter', () => {
    // a2 touches the right edge: stepping right is the shortest way clear, but it leaves the area.
    const { moved, areaMoves } = push({
      rects: { a1: rect(100, 100, 840, 100), a2: rect(900, 100, 100, 100) },
      previous: { a1: rect(100, 100, 700, 100), a2: rect(900, 100, 100, 100) },
      start: ['a1']
    })
    expect(areaMoves).toEqual({})
    expect(moved.a2.x).toBe(900)
    expect(moved.a2.y).toBeGreaterThan(100)
    expect(moved.a2.y + moved.a2.h).toBeLessThanOrEqual(400)
  })

  it('lets the area grow only when no move fits inside', () => {
    const small = { ...area, rect: rect(0, 0, 320, 240) }
    const { moved } = push({
      areas: [small],
      rects: { a1: rect(20, 60, 280, 160), a2: rect(20, 60, 280, 160) },
      previous: { a1: rect(20, 60, 100, 100), a2: rect(160, 60, 100, 100) },
      start: ['a1']
    })
    expect(moved.a2).toBeDefined()
    const out = moved.a2
    expect(out.x + out.w > 320 || out.y + out.h > 240 || out.x < 0 || out.y < 0).toBe(true)
  })

  it('pushes a whole area when a growing neighbour reaches it, keeping its cards together', () => {
    const free = rect(-600, 100, 100, 100)
    const { moved, areaMoves } = push({
      rects: { free: { ...free, w: 700 }, a1: rect(100, 100), a2: rect(400, 100) },
      previous: { free, a1: rect(100, 100), a2: rect(400, 100) },
      start: ['free']
    })
    expect(areaMoves.a).toBeDefined()
    expect(moved.a1.x - 100).toBe(areaMoves.a.x)
    expect(moved.a2.x - 400).toBe(areaMoves.a.x)
    expect(moved.a1.y - 100).toBe(areaMoves.a.y)
    expect(moved.free).toBeUndefined()
  })

  it('pushes one area off another as a unit, and never moves a pinned area', () => {
    const other = { id: 'b', anchor: { x: 0, y: 0 }, rect: rect(1100, 0, 500, 400) }
    const areaOf = (key: string): string => key[0]
    const before = { a1: rect(100, 100), b1: rect(1200, 100) }
    const grew = { a1: rect(100, 100, 1200, 100), b1: rect(1200, 100) }
    const pushed = pushApartInAreas({
      rects: grew,
      previous: before,
      start: ['a1'],
      pinned: new Set(),
      areas: [area, other],
      areaOf
    })
    expect(pushed.areaMoves.b).toBeDefined()
    expect(pushed.areaMoves.a).toBeUndefined()
    expect(pushed.moved.b1.x - 1200).toBe(pushed.areaMoves.b.x)
    const held = pushApartInAreas({
      rects: grew,
      previous: before,
      start: ['a1'],
      pinned: new Set(['b1']),
      areas: [area, other],
      areaOf
    })
    expect(held.areaMoves.b).toBeUndefined()
    expect(held.areaMoves.a).toBeDefined()
  })

  it('leaves loose cards behaving as before and keeps old overlaps', () => {
    const rects = { x: rect(0, 0, 300), y: rect(200, 0), z: rect(205, 5) }
    const previous = { x: rect(0, 0), y: rect(200, 0), z: rect(205, 5) }
    const { moved } = pushApartInAreas({
      rects,
      previous,
      start: ['x'],
      pinned: new Set(),
      ignored: overlappingPairs(previous),
      areas: [],
      areaOf: () => null
    })
    expect(moved).toEqual(
      pushApart({ rects, start: ['x'], pinned: new Set(), ignored: overlappingPairs(previous) })
    )
  })
})
