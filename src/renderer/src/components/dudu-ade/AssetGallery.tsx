import { useState } from 'react'
import {
  Copy,
  ExternalLink,
  LayoutDashboard,
  RefreshCw,
  SquareTerminal,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { CollectedAssetKind } from './asset-path-extraction'
import { useAssetLabel } from './AssetName'
import { AssetPreview, assetKindLabel } from './AssetPreview'
import { copyAssetLocation, openCollectedAsset, revealAssetSourceTerminal } from './asset-actions'
import { formatClockKo, formatRelativeKo, useNowEveryMinute } from './asset-time-label'
import { assetCardKey } from './board-layout-state'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore, type CollectedAsset } from './dudu-ade-store'
import { scanTerminalsForAssets } from './use-asset-scanner'

const KIND_FILTERS: (CollectedAssetKind | 'all')[] = [
  'all',
  'image',
  'markdown',
  'html',
  'pdf',
  'video',
  'artifact-link'
]

function IconAction({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function AssetTile({
  asset,
  onBoard,
  now
}: {
  asset: CollectedAsset
  onBoard: boolean
  now: number
}): React.JSX.Element {
  const addAssetCard = useDuduAdeStore((s) => s.addAssetCard)
  const forgetAsset = useDuduAdeStore((s) => s.forgetAsset)
  const sourceLabel =
    asset.source.terminalTitle || asset.source.branch || DUDU_ADE_COPY.sourceUnknown
  const workspaceLabel = asset.source.worktreePath.split('/').pop() ?? ''
  const label = useAssetLabel(asset)
  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        className="block h-40 w-full cursor-pointer border-b border-border"
        onClick={() => openCollectedAsset(asset)}
        aria-label={`${DUDU_ADE_COPY.open}: ${label}`}
      >
        <AssetPreview asset={asset} className="h-full w-full" />
      </button>
      <div className="flex min-w-0 flex-col gap-1 p-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-3xs text-muted-foreground">
            {assetKindLabel(asset.kind)}
          </span>
          <span className="truncate text-xs font-medium" title={asset.location}>
            {label}
          </span>
        </div>
        <div
          className="truncate font-mono text-3xs text-muted-foreground"
          title={`${workspaceLabel} / ${sourceLabel}`}
        >
          {workspaceLabel} / {sourceLabel}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-3xs text-muted-foreground" title={formatClockKo(asset.firstSeenAt)}>
            {formatRelativeKo(asset.firstSeenAt, now)}
          </span>
          <div className="flex items-center opacity-70 group-hover:opacity-100">
            <IconAction label={DUDU_ADE_COPY.open} onClick={() => openCollectedAsset(asset)}>
              <ExternalLink />
            </IconAction>
            <IconAction
              label={onBoard ? DUDU_ADE_COPY.onBoard : DUDU_ADE_COPY.addToBoard}
              onClick={() => addAssetCard(asset.id)}
            >
              <LayoutDashboard className={cn(onBoard && 'text-foreground')} />
            </IconAction>
            <IconAction
              label={DUDU_ADE_COPY.openInWorkspace}
              onClick={() => revealAssetSourceTerminal(asset)}
            >
              <SquareTerminal />
            </IconAction>
            <IconAction
              label={DUDU_ADE_COPY.copyPath}
              onClick={() => void copyAssetLocation(asset)}
            >
              <Copy />
            </IconAction>
            <IconAction label={DUDU_ADE_COPY.forget} onClick={() => forgetAsset(asset.id)}>
              <Trash2 />
            </IconAction>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AssetGallery(): React.JSX.Element {
  const assets = useDuduAdeStore((s) => s.assets)
  const cards = useDuduAdeStore((s) => s.board.cards)
  const clearAssets = useDuduAdeStore((s) => s.clearAssets)
  const [filter, setFilter] = useState<CollectedAssetKind | 'all'>('all')
  const [scanning, setScanning] = useState(false)
  const visible = filter === 'all' ? assets : assets.filter((asset) => asset.kind === filter)
  const now = useNowEveryMinute()

  const scanNow = (): void => {
    setScanning(true)
    void scanTerminalsForAssets({ force: true }).finally(() => setScanning(false))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-4 py-2">
        {KIND_FILTERS.map((kind) => {
          const count =
            kind === 'all' ? assets.length : assets.filter((asset) => asset.kind === kind).length
          return (
            <Button
              key={kind}
              variant={filter === kind ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setFilter(kind)}
            >
              {kind === 'all' ? DUDU_ADE_COPY.filterAll : assetKindLabel(kind)}
              <span className="text-muted-foreground">{count}</span>
            </Button>
          )
        })}
        <div className="flex-1" />
        <span className="text-2xs text-muted-foreground">{DUDU_ADE_COPY.assetsScanHint}</span>
        <Button variant="outline" size="xs" onClick={scanNow} disabled={scanning}>
          <RefreshCw className={cn(scanning && 'animate-spin')} />
          {DUDU_ADE_COPY.scanNow}
        </Button>
        <Button variant="ghost" size="xs" onClick={clearAssets} disabled={assets.length === 0}>
          {DUDU_ADE_COPY.clearAll}
        </Button>
      </div>
      {visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
          {DUDU_ADE_COPY.assetsEmpty}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek p-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {visible.map((asset) => (
              <AssetTile
                key={asset.id}
                asset={asset}
                onBoard={!!cards[assetCardKey(asset.id)]}
                now={now}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
