import { describe, expect, it } from 'vitest'
import {
  alignCards,
  areaSelectionKey,
  membershipAfterMove,
  moveSelection,
  selectedCardKeys,
  selectionBounds,
  selectionInBox,
  selectionRects,
  toggleSelection
} from './board-selection'

const card = (x: number, y: number, w = 100, h = 100) => ({ x, y, w, h })
const area = (id: string, rect?: ReturnType<typeof card>) => ({
  id,
  name: id,
  color: '#000',
  anchor: { x: 0, y: 0 },
  ...(rect ? { rect } : {})
})

describe('selection', () => {
  it('toggles a key without touching the original', () => {
    const start = new Set(['a'])
    expect([...toggleSelection(start, 'b')]).toEqual(['a', 'b'])
    expect([...toggleSelection(start, 'a')]).toEqual([])
    expect([...start]).toEqual(['a'])
  })

  it('box takes cards it touches, and areas only when fully inside', () => {
    const cards = {
      hit: card(90, 0),
      miss: card(500, 0),
      folded: { ...card(0, 150, 100, 400), collapsed: true }
    }
    const frames = [
      { id: 'in', rect: card(10, 10, 20, 20) },
      { id: 'cut', rect: card(50, 50, 500, 500) }
    ]
    expect(selectionInBox(card(0, 0, 100, 100), Object.keys(cards), cards, frames)).toEqual([
      'hit',
      areaSelectionKey('in')
    ])
  })

  it('a selected area brings its cards', () => {
    const cards = { a: card(0, 0), b: card(0, 0), c: card(0, 0) }
    const selected = new Set(['a', areaSelectionKey('x')])
    expect(selectedCardKeys(selected, cards, { b: 'x', c: 'y' })).toEqual(['a', 'b'])
  })
})

describe('moving together', () => {
  const base = {
    cards: { a: card(0, 0), b: card(200, 0), c: card(400, 0), inArea: card(50, 50) },
    categories: [area('x', card(0, 0, 500, 500)), area('y')],
    categoryOf: { inArea: 'x', c: 'y' }
  }

  it('shifts every selected card by the same distance and leaves the rest', () => {
    const moved = moveSelection(base, new Set(['a', 'b']), 10, -5)
    // A move is the user's own placement, so it is marked for restoring to leave alone.
    expect(moved.cards).toEqual({
      a: { ...card(10, -5), placed: true },
      b: { ...card(210, -5), placed: true }
    })
    expect(moved.categories).toEqual(base.categories)
  })

  it('takes a selected area, its rect and its cards along', () => {
    const moved = moveSelection(base, new Set([areaSelectionKey('x')]), 10, 20)
    expect(moved.cards).toEqual({ inArea: { ...card(60, 70), placed: true } })
    expect(moved.categories[0].rect).toEqual(card(10, 20, 500, 500))
    expect(moved.categories[0].anchor).toEqual({ x: 10, y: 20 })
    expect(moved.categories[1]).toEqual(base.categories[1])
  })

  it('refiles by where each card landed', () => {
    const frames = [{ id: 'x', rect: card(0, 0, 500, 500) }]
    const changes = membershipAfterMove(
      { entered: card(100, 100), left: card(900, 900), stays: card(50, 50) },
      frames,
      new Set(),
      { left: 'x', stays: 'x' }
    )
    expect(changes.get('x')).toEqual(['entered'])
    expect(changes.get(null)).toEqual(['left'])
  })

  it('keeps cards of a selected area in it, even out of the old frame', () => {
    const frames = [{ id: 'x', rect: card(0, 0, 500, 500) }]
    const changes = membershipAfterMove(
      { member: card(900, 900) },
      frames,
      new Set([areaSelectionKey('x')]),
      { member: 'x' }
    )
    expect(changes.size).toBe(0)
  })
})

describe('alignment', () => {
  const cards = { a: card(30, 10), b: card(0, 50, 200), c: card(500, 0) }

  it('lines up left and top edges', () => {
    const left = alignCards(cards, ['a', 'c'], 'left')
    expect([left.a.x, left.c.x]).toEqual([30, 30])
    const top = alignCards(cards, ['a', 'b'], 'top')
    expect([top.a.y, top.b.y]).toEqual([10, 10])
  })

  it('evens the gaps between cards of different widths', () => {
    const at = alignCards(cards, ['a', 'b', 'c'], 'distribute-x')
    expect(at.b.x).toBe(0)
    expect(at.c.x).toBe(500)
    const gapOne = at.a.x - (at.b.x + at.b.w)
    const gapTwo = at.c.x - (at.a.x + at.a.w)
    expect(gapOne).toBeCloseTo(gapTwo)
  })

  it('needs at least two cards', () => {
    expect(alignCards(cards, ['a'], 'left')).toEqual({})
  })
})

describe('bounds', () => {
  it('wraps all rects, or nothing', () => {
    expect(selectionBounds([card(0, 0), card(200, 300)])).toEqual(card(0, 0, 300, 400))
    expect(selectionBounds([])).toBeNull()
  })
})

describe('outlines', () => {
  it('uses the frame for an area and the card rect otherwise, skipping what is gone', () => {
    const frames = [{ category: { id: 'x' }, rect: card(1, 1) }]
    const rects = selectionRects(new Set([areaSelectionKey('x'), 'a', 'gone']), frames, (key) =>
      key === 'a' ? card(2, 2) : null
    )
    expect(rects).toEqual([card(1, 1), card(2, 2)])
  })
})
