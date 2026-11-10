import { ASSET_DRAG_TYPE } from './AssetDock'
import {
  assetCardKey,
  hitTestFrames,
  type BoardCategory,
  type BoardRect
} from './board-layout-state'
import { useDuduAdeStore } from './dudu-ade-store'

/** Dropping an asset on open board makes a free card, filed into the area under it. */
export function useBoardAssetDrop(args: {
  frames: readonly { category: BoardCategory; rect: BoardRect }[]
  toBoardPoint: (clientX: number, clientY: number) => { x: number; y: number }
}): {
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void
} {
  const { frames, toBoardPoint } = args
  return {
    onDragOver: (event) => {
      if (event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }
    },
    onDrop: (event) => {
      const assetId = event.dataTransfer.getData(ASSET_DRAG_TYPE)
      if (!assetId) {
        return
      }
      event.preventDefault()
      const point = toBoardPoint(event.clientX, event.clientY)
      const store = useDuduAdeStore.getState()
      store.addAssetCard(assetId, { x: point.x - 160, y: point.y - 16 })
      const target = hitTestFrames(
        point,
        frames
          .filter(({ category }) => !category.collapsed)
          .map(({ category, rect }) => ({ id: category.id, rect }))
      )
      store.assignCategory([assetCardKey(assetId)], target)
    }
  }
}
