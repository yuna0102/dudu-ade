import { assetCardKey, newBoardId, type BoardCardGeometry } from './board-layout-state'
import { boardTerminalKey } from './board-terminal-listing'
import type { CollectedAsset } from './dudu-ade-store-types'

export type BoardAssetCategory = {
  id: string
  name: string
  collapsed?: boolean
  assetIds: string[]
}

/** Per card, kept when the card's conversation moves between terminal and chat. */
export type BoardAssetPanel = {
  collapsed?: boolean
  /** Older card keys of this conversation; assets remember the terminal that printed them. */
  sources?: string[]
  categories: BoardAssetCategory[]
}

export const EMPTY_ASSET_PANEL: BoardAssetPanel = { categories: [] }
export const PANEL_WIDTH = 240
export const COLLAPSED_PANEL_WIDTH = 32
export const PANEL_GAP = 12

/** Room a card's panel takes on its left, for overlap checks; nothing to show takes no room. */
export function panelSpace(panel: BoardAssetPanel | undefined, assetCount: number): number {
  if (assetCount === 0 && !panel?.categories.length) {
    return 0
  }
  return (panel?.collapsed ? COLLAPSED_PANEL_WIDTH : PANEL_WIDTH) + PANEL_GAP
}

/** Everything this card's conversation produced, newest first. An asset with its own board card has left the panel. */
export function panelAssets(
  assets: readonly CollectedAsset[],
  cardKey: string,
  panel: BoardAssetPanel | undefined,
  cards: Record<string, BoardCardGeometry>
): CollectedAsset[] {
  const owners = new Set([cardKey, ...(panel?.sources ?? [])])
  return assets
    .filter((asset) => owners.has(boardTerminalKey(asset.source)) && !cards[assetCardKey(asset.id)])
    .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
}

/** Categories in their order, then whatever is unfiled. Ids of assets no longer listed are skipped. */
export function groupPanelAssets(
  panel: BoardAssetPanel,
  assets: readonly CollectedAsset[]
): {
  groups: { category: BoardAssetCategory; assets: CollectedAsset[] }[]
  unfiled: CollectedAsset[]
} {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  const filed = new Set(panel.categories.flatMap((category) => category.assetIds))
  return {
    groups: panel.categories.map((category) => ({
      category,
      assets: category.assetIds.flatMap((id) => byId.get(id) ?? [])
    })),
    unfiled: assets.filter((asset) => !filed.has(asset.id))
  }
}

/** Checkbox click; with Shift it selects the run from the last clicked row, in visible order. */
export function nextAssetSelection(
  selected: ReadonlySet<string>,
  ordered: readonly string[],
  id: string,
  lastId: string | null,
  shift: boolean
): Set<string> {
  const next = new Set(selected)
  const from = lastId ? ordered.indexOf(lastId) : -1
  const to = ordered.indexOf(id)
  if (shift && from !== -1 && to !== -1) {
    for (const rangeId of ordered.slice(Math.min(from, to), Math.max(from, to) + 1)) {
      next.add(rangeId)
    }
    return next
  }
  if (!next.delete(id)) {
    next.add(id)
  }
  return next
}

/** An asset lives in at most one category; null takes it out of all of them. */
export function assignAssetsToCategory(
  panel: BoardAssetPanel,
  categoryId: string | null,
  assetIds: readonly string[]
): BoardAssetPanel {
  const moving = new Set(assetIds)
  return {
    ...panel,
    categories: panel.categories.map((category) => {
      const kept = category.assetIds.filter((id) => !moving.has(id))
      return {
        ...category,
        assetIds: category.id === categoryId ? [...kept, ...assetIds] : kept
      }
    })
  }
}

export function createAssetCategory(
  panel: BoardAssetPanel,
  name: string,
  assetIds: readonly string[]
): BoardAssetPanel {
  const id = newBoardId()
  return assignAssetsToCategory(
    { ...panel, categories: [...panel.categories, { id, name, assetIds: [] }] },
    id,
    assetIds
  )
}

export function updateAssetCategory(
  panel: BoardAssetPanel,
  id: string,
  patch: Partial<Pick<BoardAssetCategory, 'name' | 'collapsed'>>
): BoardAssetPanel {
  return {
    ...panel,
    categories: panel.categories.map((category) =>
      category.id === id ? { ...category, ...patch } : category
    )
  }
}

/** Its assets go back to unfiled; nothing is forgotten. */
export function deleteAssetCategory(panel: BoardAssetPanel, id: string): BoardAssetPanel {
  return { ...panel, categories: panel.categories.filter((category) => category.id !== id) }
}

/** Puts a dragged category where the target category is. */
export function moveAssetCategory(
  panel: BoardAssetPanel,
  id: string,
  targetId: string
): BoardAssetPanel {
  const moving = panel.categories.find((category) => category.id === id)
  const without = panel.categories.filter((category) => category.id !== id)
  const index = without.findIndex((category) => category.id === targetId)
  if (!moving || index === -1) {
    return panel
  }
  return { ...panel, categories: [...without.slice(0, index), moving, ...without.slice(index)] }
}
