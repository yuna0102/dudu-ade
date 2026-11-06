import { assetOwnerKeys, type BoardAssetPanel } from './board-asset-panels'
import type { CollectedAsset } from './dudu-ade-store-types'

export type SourceChip = { key: string; name: string; count: number }

const stripMark = (title: string): string => title.replace(/^[^\p{L}\p{N}]+/u, '').trim()

/**
 * One chip per window that has assets listed, named the way its card is (the card's recorded name, else the
 * window's title). An asset shared to another card counts for that card's chip too.
 */
export function sourceChips(
  assets: readonly CollectedAsset[],
  panels: Readonly<Record<string, BoardAssetPanel>>,
  names: Readonly<Record<string, string>> | undefined
): SourceChip[] {
  const chips = new Map<string, SourceChip>()
  for (const asset of assets) {
    for (const key of assetOwnerKeys(asset, panels)) {
      const chip = chips.get(key)
      if (chip) {
        chip.count += 1
      } else {
        chips.set(key, {
          key,
          name: names?.[key] || stripMark(asset.source.terminalTitle ?? '') || asset.source.branch,
          count: 1
        })
      }
    }
  }
  return [...chips.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

/** Chips picked together show assets of any of them; none picked shows everything. */
export function matchesSources(
  asset: CollectedAsset,
  panels: Readonly<Record<string, BoardAssetPanel>>,
  selected: ReadonlySet<string>
): boolean {
  return selected.size === 0 || assetOwnerKeys(asset, panels).some((key) => selected.has(key))
}

/** A chip clicked again is let go. */
export function toggleSource(selected: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(selected)
  if (!next.delete(key)) {
    next.add(key)
  }
  return next
}
