import { useEffect } from 'react'
import { Copy, ExternalLink, LayoutDashboard, Link2, SquareTerminal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AssetPreview, assetDisplayName, assetKindLabel } from './AssetPreview'
import { copyAssetLocation, openCollectedAsset } from './asset-actions'
import { assetSourceTerminalKey } from './AssetDock'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'

/** Large preview over the board, so an asset opens right where the user is working. */
export function AssetLightbox(): React.JSX.Element | null {
  const previewAssetId = useDuduAdeStore((s) => s.previewAssetId)
  const asset = useDuduAdeStore((s) => s.assets.find((entry) => entry.id === s.previewAssetId))
  const setPreviewAsset = useDuduAdeStore((s) => s.setPreviewAsset)
  const addAssetCard = useDuduAdeStore((s) => s.addAssetCard)
  const focusCard = useDuduAdeStore((s) => s.focusCard)

  useEffect(() => {
    if (!previewAssetId) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setPreviewAsset(null)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [previewAssetId, setPreviewAsset])

  if (!asset) {
    return null
  }
  const sourceLabel = asset.source.terminalTitle || asset.source.branch || DUDU_ADE_COPY.sourceUnknown
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-6"
      onPointerDown={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) {
          setPreviewAsset(null)
        }
      }}
    >
      <div className="flex h-full max-h-[900px] w-full max-w-[1100px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-3xs text-muted-foreground">
            {assetKindLabel(asset.kind)}
          </span>
          <span className="truncate text-sm font-medium" title={asset.location}>
            {assetDisplayName(asset)}
          </span>
          <button
            type="button"
            className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
            title={DUDU_ADE_COPY.goToSource}
            onClick={() => focusCard(assetSourceTerminalKey(asset))}
          >
            <SquareTerminal className="size-3 shrink-0" />
            <span className="truncate">{sourceLabel}</span>
          </button>
          <div className="flex-1" />
          <Button variant="ghost" size="xs" onClick={() => addAssetCard(asset.id)}>
            <LayoutDashboard />
            {DUDU_ADE_COPY.addToBoard}
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label={DUDU_ADE_COPY.copyPath} title={DUDU_ADE_COPY.copyPath} onClick={() => void copyAssetLocation(asset)}>
            <Copy />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label={DUDU_ADE_COPY.openOutside} title={DUDU_ADE_COPY.openOutside} onClick={() => openCollectedAsset(asset)}>
            <ExternalLink />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label={DUDU_ADE_COPY.close} title={DUDU_ADE_COPY.close} onClick={() => setPreviewAsset(null)}>
            <X />
          </Button>
        </div>
        {asset.kind === 'artifact-link' ? (
          // claude.ai refuses to load inside other apps, so links get a clear hand-off instead of a blank frame.
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <Link2 className="size-10 text-muted-foreground" strokeWidth={1.5} />
            <div className="max-w-xl font-mono text-xs break-all">{asset.location}</div>
            <div className="text-xs text-muted-foreground">{DUDU_ADE_COPY.linkPreviewNote}</div>
            <Button size="sm" onClick={() => void window.api.shell.openUrl(asset.location)}>
              <ExternalLink />
              {DUDU_ADE_COPY.openInBrowser}
            </Button>
          </div>
        ) : (
          <div className="min-h-0 flex-1" data-board-card-body>
            <AssetPreview asset={asset} full className="h-full w-full" />
          </div>
        )}
      </div>
    </div>
  )
}
