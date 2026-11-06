// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { manualAssetPath, nextAssetName, parseArtifactLink, withAssetMeta } from './asset-meta'
import { matchesSources, sourceChips, toggleSource } from './asset-source-filter'
import { AssetName } from './AssetName'
import { AgentStatusChip } from './BoardAgentBadges'
import { boardAttention } from './board-agent-labels'
import {
  addPanelAssets,
  assetOwnerKeys,
  panelAssets,
  removePanelAsset,
  type BoardAssetPanel
} from './board-asset-panels'
import { buildLayoutSeed } from './board-layout-seed'
import { emptyBoardLayout } from './board-layout-state'
import { applyRestore } from './board-restore'
import { parseRestoreSeed } from './board-restore-parse'
import { useDuduAdeStore } from './dudu-ade-store'
import type { CollectedAsset } from './dudu-ade-store-types'

const source = (tab: string, title = tab) => ({
  terminalTitle: title,
  worktreeId: 'w',
  worktreePath: '/p',
  branch: 'b',
  tabId: tab,
  leafId: 'l'
})
const keyOf = (tab: string): string => `w::${tab}::l`
const asset = (
  name: string,
  tab: string,
  kind: CollectedAsset['kind'] = 'html'
): CollectedAsset => ({
  id: `${kind}:/p/${name}`,
  kind,
  location: `/p/${name}`,
  firstSeenAt: 1,
  lastSeenAt: 1,
  source: source(tab)
})
const EMPTY: BoardAssetPanel = { categories: [] }

afterEach(cleanup)

describe('what a card lists', () => {
  const a = asset('a.html', 'one')
  const b = asset('b.html', 'two')

  it('lists what its window wrote, what was added or shared to it, and not what it hid', () => {
    expect(panelAssets([a, b], keyOf('one'), undefined, {}).map((x) => x.id)).toEqual([a.id])
    const shared = addPanelAssets(EMPTY, [b.id])
    expect(
      panelAssets([a, b], keyOf('one'), shared, {})
        .map((x) => x.id)
        .sort()
    ).toEqual([a.id, b.id].sort())
    const hidden = removePanelAsset(EMPTY, a.id, true)
    expect(panelAssets([a, b], keyOf('one'), hidden, {})).toEqual([])
  })

  it('drops a hand-added file for good and hides a collected one', () => {
    const added = addPanelAssets(EMPTY, [b.id])
    const removed = removePanelAsset(added, b.id, false)
    expect(removed.extra).toBeUndefined()
    expect(removed.hidden).toBeUndefined()
    expect(removePanelAsset(EMPTY, a.id, true).hidden).toEqual([a.id])
    // Adding back what was hidden lists it again.
    expect(addPanelAssets(removePanelAsset(EMPTY, a.id, true), [a.id]).hidden).toBeUndefined()
  })

  it('keeps a hand-added file on the card when the collector later credits another window', () => {
    const moved = { ...a, source: source('other') }
    const panel = addPanelAssets(EMPTY, [a.id])
    expect(panelAssets([moved], keyOf('one'), panel, {}).map((x) => x.id)).toEqual([a.id])
    expect(panelAssets([moved], keyOf('one'), undefined, {})).toEqual([])
  })

  it('names the cards an asset belongs to', () => {
    const panels = {
      [keyOf('two')]: addPanelAssets(EMPTY, [a.id]),
      [keyOf('three')]: removePanelAsset(EMPTY, a.id, true)
    }
    expect(assetOwnerKeys(a, panels).sort()).toEqual([keyOf('one'), keyOf('two')])
    expect(assetOwnerKeys(a, { [keyOf('one')]: removePanelAsset(EMPTY, a.id, true) })).toEqual([])
  })
})

describe('asset notes', () => {
  it('accepts only an artifact address with a 22 character id', () => {
    const id = 'QN8YPGsHi4VpXXtkT2mnyH'
    expect(parseArtifactLink(` https://claude.ai/artifact/${id} `)).toBe(
      `https://claude.ai/artifact/${id}`
    )
    expect(parseArtifactLink(`https://claude.ai/code/artifact/${id}?x=1`)).toBe(
      `https://claude.ai/artifact/${id}`
    )
    for (const bad of [
      'https://claude.ai/artifact/short',
      `https://claude.ai/artifact/${id}x`,
      `https://evil.example/artifact/${id}`,
      id,
      ''
    ]) {
      expect(parseArtifactLink(bad)).toBeNull()
    }
  })

  it('ignores an empty or unchanged name, and drops an entry left empty', () => {
    expect(nextAssetName('  ', 'a')).toBeNull()
    expect(nextAssetName('a', 'a')).toBeNull()
    expect(nextAssetName(' 새 이름 ', 'a')).toBe('새 이름')
    const named = withAssetMeta(undefined, 'x', { name: '이름' })
    expect(withAssetMeta(named, 'x', { artifactUrl: 'u' })).toEqual({
      x: { name: '이름', artifactUrl: 'u' }
    })
    expect(withAssetMeta(named, 'x', { name: null })).toEqual({})
  })

  it('takes absolute paths of shown kinds, quotes and file links included', () => {
    expect(manualAssetPath(' "/a/b.png" ', null)).toBe('/a/b.png')
    expect(manualAssetPath('file:///a/b%20c.html', null)).toBe('/a/b c.html')
    expect(manualAssetPath('~/a.md', '/h')).toBe('/h/a.md')
    for (const bad of ['rel/a.png', '/a/b.exe', '/a/b', '', '~/a.md']) {
      expect(manualAssetPath(bad, null)).toBeNull()
    }
  })
})

describe('what is saved in the store and the layout file', () => {
  beforeEach(() => {
    const board = emptyBoardLayout()
    useDuduAdeStore.setState({
      board,
      workspaces: { activeId: board.id, boards: [board] },
      assets: [],
      renamingAssetId: null
    } as never)
  })

  it('adds files by hand, shares and removes them, and sets a name and a pair', () => {
    const store = useDuduAdeStore.getState()
    store.addManualAssets(keyOf('one'), source('one'), ['/p/a.html', '/p/b.txt', '/p/c.png'])
    const state = () => useDuduAdeStore.getState()
    expect(
      state()
        .assets.map((x) => x.location)
        .sort()
    ).toEqual(['/p/a.html', '/p/c.png'])
    expect(state().board.assetPanels[keyOf('one')].extra).toHaveLength(2)
    state().shareAsset('html:/p/a.html', keyOf('two'))
    expect(state().board.assetPanels[keyOf('two')].extra).toEqual(['html:/p/a.html'])
    state().removeAssetFromCard('html:/p/a.html', keyOf('one'), true)
    expect(state().board.assetPanels[keyOf('one')].extra).toEqual(['image:/p/c.png'])
    expect(state().board.assetPanels[keyOf('one')].hidden).toEqual(['html:/p/a.html'])
    state().setAssetMeta('html:/p/a.html', {
      name: '결정 목록',
      artifactUrl: 'https://claude.ai/artifact/QN8YPGsHi4VpXXtkT2mnyH'
    })
    expect(state().board.assetMeta?.['html:/p/a.html']).toEqual({
      name: '결정 목록',
      artifactUrl: 'https://claude.ai/artifact/QN8YPGsHi4VpXXtkT2mnyH'
    })
  })

  it('goes into the saved layout and comes back on a fresh board, by window name', () => {
    const store = useDuduAdeStore.getState()
    store.addManualAssets(keyOf('one'), source('one'), ['/p/a.html'])
    store.shareAsset('html:/p/a.html', keyOf('two'))
    store.setAssetMeta('html:/p/a.html', { name: '결정 목록' })
    const board = {
      ...useDuduAdeStore.getState().board,
      cards: {
        [keyOf('one')]: { x: 0, y: 0, w: 640, h: 400 },
        [keyOf('two')]: { x: 700, y: 0, w: 640, h: 400 }
      }
    }
    const live = [
      { key: keyOf('one'), name: '앱 기획' },
      { key: keyOf('two'), name: 'UX' }
    ]
    const text = JSON.stringify(buildLayoutSeed(board, live, {}, new Date(), []))
    const seed = parseRestoreSeed(text)!
    expect(seed.assetPanels['UX'].extra).toEqual(['html:/p/a.html'])
    expect(seed.assetMeta?.['html:/p/a.html']).toEqual({ name: '결정 목록' })
    const fresh = emptyBoardLayout()
    const back = applyRestore(fresh, seed, [
      { key: 'n1', name: '앱 기획' },
      { key: 'n2', name: 'UX' }
    ])!
    expect(back.assetPanels.n2.extra).toEqual(['html:/p/a.html'])
    expect(back.assetMeta?.['html:/p/a.html']?.name).toBe('결정 목록')
    // A name the user cleared stays cleared: the file's copy is applied once.
    const cleared = { ...back, assetMeta: {} }
    expect(applyRestore(cleared, seed, [{ key: 'n1', name: '앱 기획' }])?.assetMeta ?? {}).toEqual(
      {}
    )
  })
})

describe('source chips', () => {
  const a = asset('a.html', 'one')
  const b = asset('b.png', 'two', 'image')
  const panels = { [keyOf('two')]: addPanelAssets(EMPTY, [a.id]) }
  const names = { [keyOf('one')]: '앱 기획', [keyOf('two')]: 'UX' }

  it('names a chip as its card is named and counts shared assets for the card they are shared to', () => {
    expect(sourceChips([a, b], panels, names)).toEqual([
      { key: keyOf('one'), name: '앱 기획', count: 1 },
      { key: keyOf('two'), name: 'UX', count: 2 }
    ])
  })

  it('shows any of the picked windows, all when none, and lets a second press let go', () => {
    expect(matchesSources(a, panels, new Set())).toBe(true)
    expect(matchesSources(a, panels, new Set([keyOf('two')]))).toBe(true)
    expect(matchesSources(b, panels, new Set([keyOf('one')]))).toBe(false)
    const picked = toggleSource(new Set(), keyOf('one'))
    expect([...picked]).toEqual([keyOf('one')])
    expect(toggleSource(picked, keyOf('one')).size).toBe(0)
  })
})

describe('notices on status chips', () => {
  it('maps a permission to respond, an unread finish to review, and settled states to none', () => {
    expect(boardAttention('permission', false)).toBe('respond')
    expect(boardAttention('permission', true)).toBe('respond')
    expect(boardAttention('done', true)).toBe('review')
    expect(boardAttention('inactive', true)).toBe('review')
    expect(boardAttention('working', true)).toBeNull()
    expect(boardAttention('monitoring', true)).toBeNull()
    expect(boardAttention('done', false)).toBeNull()
    expect(boardAttention('inactive', undefined)).toBeNull()
    expect(boardAttention(undefined, false)).toBeNull()
  })

  it('goes back to the ordinary dot once the window is read', () => {
    const { rerender } = render(<AgentStatusChip status="done" unread />)
    expect(screen.getByLabelText('검수 필요')).toBeTruthy()
    rerender(<AgentStatusChip status="done" unread={false} />)
    expect(screen.queryByLabelText('검수 필요')).toBeNull()
    expect(screen.getByTitle('대기')).toBeTruthy()
  })

  it('labels the two kinds apart and keeps working as it was', () => {
    const { rerender } = render(<AgentStatusChip status="permission" />)
    expect(screen.getByLabelText('확인 필요').className).toContain('orange')
    rerender(<AgentStatusChip status="done" unread compact />)
    expect(screen.getByLabelText('검수 필요').className).toContain('6E48E5')
    rerender(<AgentStatusChip status="working" unread />)
    expect(screen.getByTitle('작업 중')).toBeTruthy()
  })
})

describe('renaming an asset where it stands', () => {
  const page = asset('index.html', 'one')
  beforeEach(() => {
    const board = emptyBoardLayout()
    useDuduAdeStore.setState({
      board,
      workspaces: { activeId: board.id, boards: [board] },
      assets: [page],
      renamingAssetId: null
    } as never)
  })
  const meta = () => useDuduAdeStore.getState().board.assetMeta?.[page.id]?.name

  it('edits on a double click, saves on Enter but not while the IME composes, keeps the file name as a tooltip', () => {
    render(<AssetName asset={page} />)
    fireEvent.doubleClick(screen.getByText('index.html'))
    const field = screen.getByLabelText('이름 바꾸기') as HTMLInputElement
    fireEvent.change(field, { target: { value: '결정 목록' } })
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 })
    expect(meta()).toBeUndefined()
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(meta()).toBe('결정 목록')
    expect(screen.getByText('결정 목록').getAttribute('title')).toContain('index.html')
    expect(useDuduAdeStore.getState().renamingAssetId).toBeNull()
  })

  it('opens on F2 and on the menu request, and keeps the name on Escape or an empty one', () => {
    render(<AssetName asset={page} />)
    fireEvent.keyDown(screen.getByText('index.html'), { key: 'F2' })
    let field = screen.getByLabelText('이름 바꾸기') as HTMLInputElement
    fireEvent.change(field, { target: { value: '버리는 이름' } })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(meta()).toBeUndefined()
    act(() => useDuduAdeStore.getState().startRenameAsset(page.id))
    field = screen.getByLabelText('이름 바꾸기') as HTMLInputElement
    fireEvent.change(field, { target: { value: '   ' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(meta()).toBeUndefined()
  })

  it('does not rename other kinds of file', () => {
    const picture = asset('a.png', 'one', 'image')
    render(<AssetName asset={picture} />)
    fireEvent.doubleClick(screen.getByText('a.png'))
    expect(screen.queryByLabelText('이름 바꾸기')).toBeNull()
  })
})
