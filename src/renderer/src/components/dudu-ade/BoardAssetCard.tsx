import { memo } from 'react'
import { ExternalLink, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { assetCardKey, type BoardCardGeometry } from './board-layout-state'
import type { BoardCardChange } from './use-board-card-drag'
import { AssetPreview, assetDisplayName, assetKindLabel } from './AssetPreview'
import { openCollectedAsset } from './asset-actions'
import { BoardCardFrame } from './BoardCardFrame'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore, type CollectedAsset } from './dudu-ade-store'

export const BoardAssetCard = memo(function BoardAssetCard({
  asset,
  card,
  zoom,
  highlighted,
  onCommitCard,
  onStartLink
}: {
  asset: CollectedAsset
  card: BoardCardGeometry
  zoom: number
  highlighted: boolean
  onCommitCard: (key: string, geometry: BoardCardGeometry, change: BoardCardChange) => void
  onStartLink?: (key: string, event: React.PointerEvent) => void
}): React.JSX.Element {
  const removeCard = useDuduAdeStore((s) => s.removeCard)
  const setPreviewAsset = useDuduAdeStore((s) => s.setPreviewAsset)
  const sourceLabel = asset.source.terminalTitle || asset.source.branch
  return (
    <BoardCardFrame
      geometry={card}
      zoom={zoom}
      highlighted={highlighted}
      overlay
      onCommit={(next, change) => onCommitCard(assetCardKey(asset.id), next, change)}
      onRemove={() => removeCard(assetCardKey(asset.id))}
      onStartLink={onStartLink ? (event) => onStartLink(assetCardKey(asset.id), event) : undefined}
      icon={
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-3xs text-muted-foreground">
          {assetKindLabel(asset.kind)}
        </span>
      }
      title={assetDisplayName(asset)}
      subtitle={sourceLabel ?? undefined}
      actions={
        <>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={DUDU_ADE_COPY.previewLarge}
            title={DUDU_ADE_COPY.previewLarge}
            onClick={() => setPreviewAsset(asset.id)}
          >
            <Maximize2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={DUDU_ADE_COPY.open}
            title={DUDU_ADE_COPY.open}
            onClick={() => openCollectedAsset(asset)}
          >
            <ExternalLink />
          </Button>
        </>
      }
    >
      <AssetPreview asset={asset} detailed className="h-full w-full" />
    </BoardCardFrame>
  )
})
