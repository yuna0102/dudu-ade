import { useEffect } from 'react'
import { assetKindForPath } from '../../../../shared/dudu-ade-asset-kinds'
import { sourceOf } from './asset-source'
import type { BoardAssetPanel } from './board-asset-panels'
import type { BoardTerminal } from './board-terminal-listing'
import { collectedAssetId, useDuduAdeStore } from './dudu-ade-store'

/**
 * Files listed by hand on a card come back with the saved layout as ids only. On a store that never saw them
 * (a new profile, a cleared list) each is recorded again from its id, under the window of the card that lists it.
 */
export function useRestoreManualAssets(
  panels: Readonly<Record<string, BoardAssetPanel>>,
  terminals: ReadonlyMap<string, BoardTerminal>
): void {
  useEffect(() => {
    const known = new Set(useDuduAdeStore.getState().assets.map((asset) => asset.id))
    const found = Object.entries(panels).flatMap(([key, panel]) => {
      const source = sourceOf(terminals.get(key))
      return source
        ? (panel.extra ?? []).flatMap((id) => {
            const location = id.slice(id.indexOf(':') + 1)
            const kind = assetKindForPath(location)
            return kind && !known.has(id) && id === collectedAssetId(kind, location)
              ? [{ id, kind, location, source }]
              : []
          })
        : []
    })
    if (found.length > 0) {
      useDuduAdeStore.getState().recordAssets(found, Date.now())
    }
  }, [panels, terminals])
}
