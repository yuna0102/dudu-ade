// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AREA_PALETTE,
  RECENT_COLOR_LIMIT,
  isHexColor,
  parseHexColor,
  withRecentColor
} from './board-area-colors'
import { BoardCategoryFrame, nextAreaName } from './BoardCategoryFrame'
import { BoardColorPanel } from './BoardColorPopover'
import { emptyBoardLayout, type BoardCategory } from './board-layout-state'
import { applyRestore } from './board-restore'
import { parseRestoreSeed } from './board-restore-parse'
import { syncBoardTerminals } from './board-sync'
import { buildLayoutSeed } from './board-layout-seed'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'

afterEach(cleanup)

describe('area colors', () => {
  it('offers at least twelve distinct colors, all in the stored six digit form', () => {
    expect(AREA_PALETTE.length).toBeGreaterThanOrEqual(12)
    expect(new Set(AREA_PALETTE.map((entry) => entry.color)).size).toBe(AREA_PALETTE.length)
    expect(AREA_PALETTE.every((entry) => isHexColor(entry.color))).toBe(true)
  })

  it('accepts only #RRGGBB, stores it upper case', () => {
    expect(parseHexColor(' #6e48e5 ')).toBe('#6E48E5')
    for (const bad of ['', '6E48E5', '#fff', '#12345', '#1234567', '#GGGGGG', 'red', '#6E48E5aa']) {
      expect(parseHexColor(bad)).toBeNull()
    }
  })

  it('keeps the five newest colors, newest first, without repeats', () => {
    let recent: string[] = []
    for (const color of ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666']) {
      recent = withRecentColor(recent, color)
    }
    expect(recent).toEqual(['#666666', '#555555', '#444444', '#333333', '#222222'])
    expect(recent).toHaveLength(RECENT_COLOR_LIMIT)
    expect(withRecentColor(recent, '#333333')).toEqual([
      '#333333',
      '#666666',
      '#555555',
      '#444444',
      '#222222'
    ])
  })
})

describe('color panel', () => {
  it('applies a palette pick at once and remembers it', () => {
    const onPick = vi.fn()
    render(<BoardColorPanel color="#8B6CF0" onPick={onPick} />)
    fireEvent.click(screen.getByLabelText('파랑'))
    expect(onPick).toHaveBeenCalledWith(AREA_PALETTE[1].color)
    expect(screen.getByText(DUDU_ADE_COPY.recentColors)).toBeTruthy()
  })

  it('refuses a malformed color with a message and applies a good one on Enter', () => {
    const onPick = vi.fn()
    render(<BoardColorPanel color="#8B6CF0" onPick={onPick} />)
    const input = screen.getByLabelText(DUDU_ADE_COPY.customColor)
    fireEvent.change(input, { target: { value: '#12' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).not.toHaveBeenCalled()
    expect(screen.getByText(DUDU_ADE_COPY.invalidColor)).toBeTruthy()
    fireEvent.change(input, { target: { value: '#aabbcc' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onPick).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('#AABBCC')
  })
})

const category: BoardCategory = {
  id: 'a1',
  name: '기획',
  color: '#8B6CF0',
  anchor: { x: 0, y: 0 }
}

describe('renaming an area', () => {
  it('ignores an empty or unchanged name', () => {
    expect(nextAreaName('  ', '기획')).toBeNull()
    expect(nextAreaName('기획', '기획')).toBeNull()
    expect(nextAreaName(' 개발 ', '기획')).toBe('개발')
  })

  const setup = () => {
    const onRename = vi.fn()
    render(
      <BoardCategoryFrame
        category={category}
        rect={{ x: 0, y: 0, w: 600, h: 300 }}
        zoom={1}
        summary={{ count: 0, buckets: { working: 0, attention: 0, waiting: 0 }, models: '' }}
        onMoveBy={vi.fn()}
        onRename={onRename}
        onColor={vi.fn()}
        onToggleCollapse={vi.fn()}
        onArrange={vi.fn()}
        onDelete={vi.fn()}
        memberRect={null}
        selected
        autoEdit={false}
        onSelect={vi.fn()}
        onResize={vi.fn()}
      />
    )
    return onRename
  }
  // Found once: the value changes as the test types.
  const open = () => {
    fireEvent.click(screen.getByLabelText(DUDU_ADE_COPY.renameArea))
    return screen.getByDisplayValue('기획') as HTMLInputElement
  }

  it('opens from the pencil button, saves on Enter, not while the IME is composing', () => {
    const onRename = setup()
    const field = open()
    fireEvent.change(field, { target: { value: '개발' } })
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 })
    expect(onRename).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onRename).toHaveBeenCalledWith('개발')
  })

  it('opens from F2 on a selected area and from a double click', () => {
    setup()
    fireEvent.keyDown(window, { key: 'F2' })
    expect(screen.getByDisplayValue('기획')).toBeTruthy()
    cleanup()
    setup()
    fireEvent.doubleClick(screen.getByText('기획'))
    expect(screen.getByDisplayValue('기획')).toBeTruthy()
  })

  it('keeps the old name on Escape or an empty name', () => {
    const onRename = setup()
    const first = open()
    fireEvent.change(first, { target: { value: '개발' } })
    fireEvent.keyDown(first, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
    const second = open()
    fireEvent.change(second, { target: { value: '   ' } })
    fireEvent.keyDown(second, { key: 'Enter' })
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByText('기획')).toBeTruthy()
  })
})

describe('what a pick or a rename saves', () => {
  it('reaches the stored board and the saved layout, and survives a restore', () => {
    useDuduAdeStore.setState({
      board: { ...emptyBoardLayout(), categories: [category], categoryOf: { w: 'a1' } },
      workspaces: {
        activeId: 'b',
        boards: [
          { ...emptyBoardLayout(), id: 'b', categories: [category], categoryOf: { w: 'a1' } }
        ]
      }
    } as never)
    act(() => useDuduAdeStore.getState().updateCategory('a1', { color: '#F0564F', name: '개발' }))
    const saved = useDuduAdeStore.getState().board
    expect(saved.categories[0]).toMatchObject({ color: '#F0564F', name: '개발' })
    const text = JSON.stringify(
      buildLayoutSeed(saved, [{ key: 'w', name: '앱 기획' }], {}, new Date(), [])
    )
    const area = (JSON.parse(text).areas as { id: string; name: string; color: string }[])[0]
    expect(area).toMatchObject({ id: 'a1', name: '개발', color: '#F0564F' })
    // A bad color in a file falls back instead of breaking the frame.
    const bad = JSON.parse(text)
    bad.areas[0].color = 'not-a-color'
    expect(parseRestoreSeed(JSON.stringify(bad))?.areas[0].color).not.toBe('not-a-color')
    const seed = parseRestoreSeed(text)!
    const fresh = {
      ...emptyBoardLayout(),
      categories: [{ ...category, name: '기획', color: '#000000' }]
    }
    const back = applyRestore(fresh, seed, [{ key: 'n1', name: '앱 기획' }])!
    expect(back.categories.find((entry) => entry.id === 'a1')).toMatchObject({
      color: '#F0564F',
      name: '개발'
    })
  })

  it('keeps taking its windows after the user renames an area, and keeps same-named areas apart', () => {
    const renamed = { ...category, name: '개발', autoName: '기획' }
    const board = { ...emptyBoardLayout(), arrangePending: false, categories: [renamed] }
    const next = syncBoardTerminals(board, [{ key: 'k1', categoryName: '기획' }])
    expect(next?.categories).toHaveLength(1)
    expect(next?.categoryOf?.k1).toBe('a1')
    const twin = { ...category, id: 'a2', name: '개발', color: '#22B8CF' }
    const both = { ...emptyBoardLayout(), categories: [{ ...renamed, color: '#F0564F' }, twin] }
    const seed = parseRestoreSeed(JSON.stringify(buildLayoutSeed(both, [], {}, new Date(), [])))
    const restored = applyRestore(
      { ...emptyBoardLayout(), categories: [renamed, { ...twin, color: '#000000' }] },
      seed!,
      []
    )
    const colors = Object.fromEntries(
      (restored?.categories ?? []).map((entry) => [entry.id, entry.color])
    )
    expect(colors).toEqual({ a1: '#F0564F', a2: '#22B8CF' })
  })
})
