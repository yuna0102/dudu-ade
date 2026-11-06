import { describe, expect, it } from 'vitest'
import {
  assignAssetsToCategory,
  createAssetCategory,
  deleteAssetCategory,
  groupPanelAssets,
  moveAssetCategory,
  nextAssetSelection,
  panelAssets,
  updateAssetCategory,
  type BoardAssetPanel
} from './board-asset-panels'
import { assetCardKey } from './board-layout-state'
import type { CollectedAsset } from './dudu-ade-store-types'

const asset = (id: string, firstSeenAt: number, tabId = 'tab'): CollectedAsset => ({
  id,
  kind: 'image',
  location: `/p/${id}.png`,
  firstSeenAt,
  lastSeenAt: firstSeenAt,
  source: {
    terminalTitle: null,
    worktreeId: 'wt',
    worktreePath: '/p',
    branch: 'b',
    tabId,
    leafId: 'leaf'
  }
})
const empty: BoardAssetPanel = { categories: [] }

describe('asset panel contents', () => {
  it('lists everything from this card, newest first, with no count limit', () => {
    const assets = Array.from({ length: 9 }, (_, index) => asset(`a${index}`, index))
    const listed = panelAssets(assets, 'wt::tab::leaf', undefined, {})
    expect(listed).toHaveLength(9)
    expect(listed[0].id).toBe('a8')
  })

  it('keeps assets from the terminal a chat card used to be, and drops detached ones', () => {
    const assets = [asset('old', 1), asset('other', 2, 'tab2'), asset('free', 3)]
    const cards = { [assetCardKey('free')]: { x: 0, y: 0, w: 1, h: 1 } }
    const panel = { categories: [], sources: ['wt::tab::leaf'] }
    expect(panelAssets(assets, 'wt::chat-tab::chat', panel, cards).map((a) => a.id)).toEqual([
      'old'
    ])
  })

  it('groups by category order and skips ids no longer listed', () => {
    const panel = {
      categories: [{ id: 'c', name: '시안', assetIds: ['b', 'gone'] }]
    }
    const { groups, unfiled } = groupPanelAssets(panel, [asset('a', 1), asset('b', 2)])
    expect(groups[0].assets.map((a) => a.id)).toEqual(['b'])
    expect(unfiled.map((a) => a.id)).toEqual(['a'])
  })
})

describe('asset selection', () => {
  const ordered = ['a', 'b', 'c', 'd']
  it('toggles one row, and Shift adds the run from the last clicked row', () => {
    expect([...nextAssetSelection(new Set(), ordered, 'b', null, false)]).toEqual(['b'])
    expect([...nextAssetSelection(new Set(['b']), ordered, 'b', 'b', false)]).toEqual([])
    expect([...nextAssetSelection(new Set(['a']), ordered, 'c', 'a', true)].sort()).toEqual([
      'a',
      'b',
      'c'
    ])
    expect([...nextAssetSelection(new Set(['d']), ordered, 'b', 'd', true)].sort()).toEqual([
      'b',
      'c',
      'd'
    ])
  })
})

describe('asset categories', () => {
  it('creates a category with the selection and keeps an asset in one category only', () => {
    const one = createAssetCategory(empty, '시안', ['a', 'b'])
    const two = createAssetCategory(one, '문서', ['b'])
    expect(two.categories.map((c) => c.assetIds)).toEqual([['a'], ['b']])
  })

  it('unfiles with null, renames, collapses and deletes without losing assets', () => {
    const made = createAssetCategory(empty, '시안', ['a'])
    const id = made.categories[0].id
    expect(assignAssetsToCategory(made, null, ['a']).categories[0].assetIds).toEqual([])
    expect(
      updateAssetCategory(made, id, { name: '최종', collapsed: true }).categories[0]
    ).toMatchObject({
      name: '최종',
      collapsed: true,
      assetIds: ['a']
    })
    const gone = deleteAssetCategory(made, id)
    expect(gone.categories).toEqual([])
    expect(groupPanelAssets(gone, [asset('a', 1)]).unfiled.map((a) => a.id)).toEqual(['a'])
  })

  it('moves a category to where the target is', () => {
    const panel = {
      categories: ['x', 'y', 'z'].map((id) => ({ id, name: id, assetIds: [] }))
    }
    expect(moveAssetCategory(panel, 'z', 'x').categories.map((c) => c.id)).toEqual(['z', 'x', 'y'])
    expect(moveAssetCategory(panel, 'z', 'missing')).toBe(panel)
  })
})
