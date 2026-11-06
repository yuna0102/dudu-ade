import { useMemo, useState } from 'react'
import {
  ChevronsLeft,
  ChevronsRight,
  Images,
  LayoutDashboard,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  SquareTerminal
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CollectedAssetKind } from './asset-path-extraction'
import { AssetPreview, assetDisplayName, assetKindLabel } from './AssetPreview'
import { formatRelativeKo, useNowEveryMinute } from './asset-time-label'
import { assetCardKey } from './board-layout-state'
import { boardTerminalKey } from './board-terminal-listing'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore, type CollectedAsset } from './dudu-ade-store'
import { scanTerminalsForAssets } from './use-asset-scanner'

export const ASSET_DRAG_TYPE = 'application/x-dudu-ade-asset'
const MIN_DOCK_WIDTH = 240
const MAX_DOCK_WIDTH = 720
const KIND_FILTERS: (CollectedAssetKind | 'all')[] = [
  'all',
  'image',
  'markdown',
  'html',
  'pdf',
  'video',
  'artifact-link'
]

export function assetSourceTerminalKey(asset: CollectedAsset): string {
  return boardTerminalKey(asset.source)
}

function DockRow({
  asset,
  isNew,
  pinned,
  onBoard,
  now
}: {
  asset: CollectedAsset
  isNew: boolean
  pinned: boolean
  onBoard: boolean
  now: number
}): React.JSX.Element {
  const setPreviewAsset = useDuduAdeStore((s) => s.setPreviewAsset)
  const togglePinAsset = useDuduAdeStore((s) => s.togglePinAsset)
  const addAssetCard = useDuduAdeStore((s) => s.addAssetCard)
  const focusCard = useDuduAdeStore((s) => s.focusCard)
  const sourceLabel =
    asset.source.terminalTitle || asset.source.branch || DUDU_ADE_COPY.sourceUnknown
  return (
    <div
      className="group flex cursor-pointer gap-2 rounded-md p-1.5 hover:bg-muted/60"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id)
        event.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => setPreviewAsset(asset.id)}
      title={asset.location}
    >
      <div className="relative size-12 shrink-0 overflow-hidden rounded border border-border">
        <AssetPreview asset={asset} className="h-full w-full" />
        {isNew ? (
          <span
            className="absolute top-0.5 right-0.5 size-2 rounded-full bg-primary"
            aria-label={DUDU_ADE_COPY.newBadge}
          />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-xs font-medium">{assetDisplayName(asset)}</span>
          {isNew ? (
            <span className="shrink-0 rounded bg-primary px-1 text-3xs text-primary-foreground">
              {DUDU_ADE_COPY.newBadge}
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-1 text-3xs text-muted-foreground">
          <span className="shrink-0 rounded-full bg-muted px-1.5">
            {assetKindLabel(asset.kind)}
          </span>
          <span className="shrink-0">{formatRelativeKo(asset.firstSeenAt, now)}</span>
        </div>
        <button
          type="button"
          className="flex min-w-0 items-center gap-1 text-left text-3xs text-muted-foreground hover:text-foreground"
          title={DUDU_ADE_COPY.goToSource}
          onClick={(event) => {
            event.stopPropagation()
            focusCard(assetSourceTerminalKey(asset))
          }}
        >
          <SquareTerminal className="size-3 shrink-0" />
          <span className="truncate">{sourceLabel}</span>
        </button>
      </div>
      <div
        className={cn(
          'flex shrink-0 flex-col items-center',
          !pinned && 'opacity-0 group-hover:opacity-100'
        )}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={pinned ? DUDU_ADE_COPY.unpin : DUDU_ADE_COPY.pin}
          title={pinned ? DUDU_ADE_COPY.unpin : DUDU_ADE_COPY.pin}
          onClick={(event) => {
            event.stopPropagation()
            togglePinAsset(asset.id)
          }}
        >
          {pinned ? <PinOff /> : <Pin />}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={onBoard ? DUDU_ADE_COPY.onBoard : DUDU_ADE_COPY.addToBoard}
          title={onBoard ? DUDU_ADE_COPY.onBoard : DUDU_ADE_COPY.addToBoard}
          onClick={(event) => {
            event.stopPropagation()
            addAssetCard(asset.id)
          }}
        >
          <LayoutDashboard className={cn(onBoard && 'text-foreground')} />
        </Button>
      </div>
    </div>
  )
}

/** Asset panel docked to the board's right edge: open, filter, pin and drag assets without leaving the board. */
export function AssetDock(): React.JSX.Element {
  const assets = useDuduAdeStore((s) => s.assets)
  const dock = useDuduAdeStore((s) => s.dock)
  const setDock = useDuduAdeStore((s) => s.setDock)
  const cards = useDuduAdeStore((s) => s.board.cards)
  const [filter, setFilter] = useState<CollectedAssetKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [scanning, setScanning] = useState(false)
  const now = useNowEveryMinute()
  const newCount = assets.filter((asset) => asset.firstSeenAt > dock.seenAt).length

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const pinned = new Set(dock.pinnedIds)
    return assets
      .filter((asset) => filter === 'all' || asset.kind === filter)
      .filter(
        (asset) =>
          !needle ||
          asset.location.toLowerCase().includes(needle) ||
          (asset.source.terminalTitle ?? '').toLowerCase().includes(needle)
      )
      .sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)))
  }, [assets, filter, query, dock.pinnedIds])

  const startResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const originX = event.clientX
    const base = dock.width
    const onMove = (move: PointerEvent): void => {
      setDock({
        width: Math.min(MAX_DOCK_WIDTH, Math.max(MIN_DOCK_WIDTH, base + originX - move.clientX))
      })
    }
    const onUp = (): void => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
  }

  if (!dock.open) {
    return (
      <button
        type="button"
        className="flex w-9 shrink-0 flex-col items-center gap-2 border-l border-border bg-card py-3 text-muted-foreground hover:text-foreground"
        onClick={() => setDock({ open: true })}
        aria-label={DUDU_ADE_COPY.dockOpen}
        title={DUDU_ADE_COPY.dockOpen}
      >
        <ChevronsLeft className="size-4" />
        <Images className="size-4" />
        {newCount > 0 ? (
          <span className="rounded-full bg-primary px-1.5 text-3xs text-primary-foreground">
            {newCount}
          </span>
        ) : null}
        <span className="text-2xs [writing-mode:vertical-rl]">{DUDU_ADE_COPY.assetsTab}</span>
      </button>
    )
  }

  return (
    <div
      className="relative flex shrink-0 flex-col border-l border-border bg-card"
      style={{ width: dock.width }}
    >
      <div
        className="absolute top-0 bottom-0 -left-1 z-10 w-2 cursor-ew-resize hover:bg-primary/20"
        onPointerDown={startResize}
        aria-hidden
      />
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        <Images className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{DUDU_ADE_COPY.assetsTab}</span>
        <span className="text-2xs text-muted-foreground">{assets.length}</span>
        {newCount > 0 ? (
          <button
            type="button"
            className="rounded-full bg-primary px-1.5 text-3xs text-primary-foreground"
            title={DUDU_ADE_COPY.markAllSeen}
            onClick={() => setDock({ seenAt: Date.now() })}
          >
            {`${DUDU_ADE_COPY.newBadge} ${newCount}`}
          </button>
        ) : null}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={DUDU_ADE_COPY.scanNow}
          title={DUDU_ADE_COPY.scanNow}
          disabled={scanning}
          onClick={() => {
            setScanning(true)
            void scanTerminalsForAssets({ force: true }).finally(() => setScanning(false))
          }}
        >
          <RefreshCw className={cn(scanning && 'animate-spin')} />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={DUDU_ADE_COPY.dockClose}
          title={DUDU_ADE_COPY.dockClose}
          onClick={() => setDock({ open: false })}
        >
          <ChevronsRight />
        </Button>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-border p-2">
        <div className="flex items-center gap-1 rounded-md border border-border bg-background px-1.5">
          <Search className="size-3 text-muted-foreground" />
          <input
            className="h-6 min-w-0 flex-1 bg-transparent text-xs outline-none"
            placeholder={DUDU_ADE_COPY.searchAssets}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {KIND_FILTERS.map((kind) => {
            const count =
              kind === 'all' ? assets.length : assets.filter((asset) => asset.kind === kind).length
            if (kind !== 'all' && count === 0) {
              return null
            }
            return (
              <button
                key={kind}
                type="button"
                className={cn(
                  'rounded-full px-2 py-px text-3xs',
                  filter === kind
                    ? 'bg-primary/15 text-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setFilter(kind)}
              >
                {`${kind === 'all' ? DUDU_ADE_COPY.filterAll : assetKindLabel(kind)} ${count}`}
              </button>
            )
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek p-1.5">
        {visible.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            {DUDU_ADE_COPY.assetsEmpty}
          </div>
        ) : (
          visible.map((asset) => (
            <DockRow
              key={asset.id}
              asset={asset}
              isNew={asset.firstSeenAt > dock.seenAt}
              pinned={dock.pinnedIds.includes(asset.id)}
              onBoard={!!cards[assetCardKey(asset.id)]}
              now={now}
            />
          ))
        )}
      </div>
      <div className="shrink-0 border-t border-border px-2 py-1 text-3xs text-muted-foreground">
        {DUDU_ADE_COPY.dockHint}
      </div>
    </div>
  )
}
