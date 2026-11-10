import { describe, expect, it } from 'vitest'
import {
  BOARD_MAX_ZOOM,
  FRAME_LABEL,
  FRAME_PAD,
  arrangeGroups,
  categoryFrameRect,
  hitTestFrames,
  TERMINAL_CARD_SIZE,
  findFreeSlot,
  fitViewportToCards,
  zoomViewportAt
} from './board-layout-state'

describe('board layout', () => {
  it('keeps the point under the cursor fixed while zooming and clamps zoom', () => {
    const next = zoomViewportAt({ x: 100, y: 50, zoom: 1 }, 2, { x: 300, y: 250 })
    expect(next).toEqual({ x: -100, y: -150, zoom: 2 })
    expect(zoomViewportAt({ x: 0, y: 0, zoom: 1 }, 99, { x: 0, y: 0 }).zoom).toBe(BOARD_MAX_ZOOM)
  })

  it('places a new card in the first slot that overlaps nothing', () => {
    const first = findFreeSlot([], TERMINAL_CARD_SIZE)
    expect(first).toMatchObject({ x: 0, y: 0 })
    const second = findFreeSlot([first], TERMINAL_CARD_SIZE)
    expect(second.x).toBeGreaterThan(first.x + first.w)
    expect(second.y).toBe(0)
  })

  it('fits all cards into the screen without zooming past 100%', () => {
    const viewport = fitViewportToCards(
      [
        { x: 0, y: 0, w: 640, h: 400 },
        { x: 2000, y: 1000, w: 640, h: 400 }
      ],
      { width: 1000, height: 800 }
    )
    expect(viewport?.zoom).toBeLessThan(1)
    expect(fitViewportToCards([{ x: 0, y: 0, w: 100, h: 100 }], { width: 1000, height: 800 })?.zoom).toBe(1)
  })
})

describe('board categories', () => {
  it('wraps a frame around its cards and falls back to the anchor when empty', () => {
    const anchor = { x: 500, y: 600 }
    expect(categoryFrameRect({ anchor }, [])).toMatchObject(anchor)
    const rect = categoryFrameRect({ anchor }, [{ x: 100, y: 200, w: 300, h: 100 }])
    expect(rect).toEqual({
      x: 100 - FRAME_PAD,
      y: 200 - FRAME_PAD - FRAME_LABEL,
      w: 300 + FRAME_PAD * 2,
      h: 100 + FRAME_PAD * 2 + FRAME_LABEL
    })
  })

  it('picks the smallest frame under the point, or none', () => {
    const frames = [
      { id: 'big', rect: { x: 0, y: 0, w: 1000, h: 1000 } },
      { id: 'small', rect: { x: 100, y: 100, w: 200, h: 200 } }
    ]
    expect(hitTestFrames({ x: 150, y: 150 }, frames)).toBe('small')
    expect(hitTestFrames({ x: 900, y: 900 }, frames)).toBe('big')
    expect(hitTestFrames({ x: 2000, y: 0 }, frames)).toBeNull()
  })

  it('lays groups out as non-overlapping blocks for every preset', () => {
    const size = { x: 0, y: 0, w: 640, h: 400 }
    const sizes = { a: size, b: size, c: size, d: size }
    const groups = [
      { id: 'g1', keys: ['a', 'b', 'c'] },
      { id: 'g2', keys: ['d'] }
    ]
    for (const preset of ['grid', 'columns', 'row'] as const) {
      const { cards, anchors } = arrangeGroups(groups, sizes, preset)
      const g1 = categoryFrameRect({ anchor: anchors.g1 }, ['a', 'b', 'c'].map((key) => cards[key]))
      const g2 = categoryFrameRect({ anchor: anchors.g2 }, [cards.d])
      expect(g1.x + g1.w <= g2.x || g2.x + g2.w <= g1.x || g1.y + g1.h <= g2.y).toBe(true)
      expect(anchors.g1).toEqual({ x: g1.x, y: g1.y })
    }
    const columns = arrangeGroups(groups, sizes, 'columns').cards
    expect(columns.a.x).toBe(columns.b.x)
    const row = arrangeGroups(groups, sizes, 'row').cards
    expect(row.a.y).toBe(row.c.y)
  })
})
