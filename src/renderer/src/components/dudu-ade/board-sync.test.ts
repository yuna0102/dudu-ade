import { describe, expect, it } from 'vitest'
import { emptyBoardLayout } from './board-layout-state'
import { syncBoardTerminals } from './board-sync'
import { migrateV1Board } from './board-workspaces-storage'

describe('board terminal sync', () => {
  it('auto-classifies by name, lays out once, then leaves the user layout alone', () => {
    const board = emptyBoardLayout()
    const update = syncBoardTerminals(board, [
      { key: 'w::t1::a', categoryName: 'Desk A' },
      { key: 'w::t1::b', categoryName: 'Desk A' },
      { key: 'w::t2::a', categoryName: '헤드' }
    ])
    expect(update?.categories?.map((category) => category.name)).toEqual(['Desk A', '헤드'])
    const desk = update!.categories![0].id
    expect(update!.categoryOf!['w::t1::a']).toBe(desk)
    expect(update!.categoryOf!['w::t1::b']).toBe(desk)
    expect(Object.keys(update!.cards!)).toHaveLength(3)
    expect(update!.arrangePending).toBe(false)

    const settled = { ...board, ...update! }
    expect(syncBoardTerminals(settled, [{ key: 'w::t1::a', categoryName: 'Desk A' }])).toBeNull()
  })

  it('waits for tab names before the first layout and respects a terminal the user unfiled', () => {
    const board = emptyBoardLayout()
    expect(syncBoardTerminals(board, [{ key: 'k', categoryName: null }])).toBeNull()
    const unfiled = { ...board, arrangePending: false, categoryOf: { k: null } }
    const update = syncBoardTerminals(unfiled, [{ key: 'k', categoryName: '헤드' }])
    expect(update?.categoryOf?.k).toBeNull()
    expect(update?.cards?.k).toBeDefined()
  })

  it('places a new terminal inside its existing category area', () => {
    const board = {
      ...emptyBoardLayout(),
      arrangePending: false,
      categories: [{ id: 'c', name: '헤드', color: '#000', anchor: { x: 0, y: 0 } }],
      categoryOf: { old: 'c' },
      cards: { old: { x: 1000, y: 1000, w: 640, h: 400 } }
    }
    const update = syncBoardTerminals(board, [
      { key: 'old', categoryName: '헤드' },
      { key: 'new', categoryName: '헤드' }
    ])
    expect(update?.categoryOf?.new).toBe('c')
    expect(update?.cards?.new.y).toBe(1000)
    expect(update?.cards?.new.x).toBeGreaterThan(1000)
  })

  it('migrates a v1 board without losing card positions and asks for one category layout', () => {
    const migrated = migrateV1Board({
      viewport: { x: 1, y: 2, zoom: 0.5 },
      terminalCards: { t: { x: 10, y: 20, w: 640, h: 400 } },
      hiddenTerminalKeys: ['h'],
      assetCards: [{ assetId: 'image:/a.png', x: 5, y: 6, w: 320, h: 280 }]
    })
    const board = migrated!.boards[0]
    expect(board.cards.t).toEqual({ x: 10, y: 20, w: 640, h: 400 })
    expect(board.cards['asset:image:/a.png']).toMatchObject({ x: 5, y: 6 })
    expect(board.hiddenKeys).toEqual(['h'])
    expect(board.arrangePending).toBe(true)
    expect(migrateV1Board({ nope: true })).toBeNull()
  })
})
