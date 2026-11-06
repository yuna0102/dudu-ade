import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ASSET_DRAG_TYPE } from './AssetDock'
import { AssetMenu } from './AssetMenu'
import { AssetName, useAssetLabel } from './AssetName'
import { KIND_ICONS, useAssetPreview } from './AssetPreview'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'
import type { CollectedAsset } from './dudu-ade-store-types'

/** Reads the image only once mounted, and it mounts only when its row scrolls into view. */
function AssetThumbnailImage({ asset }: { asset: CollectedAsset }): React.JSX.Element {
  const preview = useAssetPreview(asset, false, false)
  const Icon = KIND_ICONS[asset.kind]
  return preview?.state === 'media' ? (
    <img
      src={preview.src}
      alt=""
      draggable={false}
      decoding="async"
      className="size-6 shrink-0 rounded object-cover"
    />
  ) : (
    <Icon className="size-3.5 shrink-0 text-[#6E48E5]" />
  )
}

function AssetRowIcon({ asset }: { asset: CollectedAsset }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const wantsThumbnail = asset.kind === 'image' && !asset.missing
  useEffect(() => {
    const element = ref.current
    if (!element || !wantsThumbnail) {
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [wantsThumbnail])
  const Icon = KIND_ICONS[asset.kind]
  return (
    <span ref={ref} className="flex shrink-0 items-center justify-center">
      {wantsThumbnail && visible ? (
        <AssetThumbnailImage asset={asset} />
      ) : (
        <Icon
          className={cn(
            'size-3.5 shrink-0',
            asset.missing ? 'text-muted-foreground' : 'text-[#6E48E5]'
          )}
        />
      )}
    </span>
  )
}

/** Zoomed out, rows stay icons: thumbnails would be unreadable and cost a read each. */
function AssetRowIconOnly({ asset }: { asset: CollectedAsset }): React.JSX.Element {
  const Icon = KIND_ICONS[asset.kind]
  return (
    <Icon
      className={cn(
        'size-3.5 shrink-0',
        asset.missing ? 'text-muted-foreground' : 'text-[#6E48E5]'
      )}
    />
  )
}

export function AssetRow({
  asset,
  selected,
  iconOnly,
  menu,
  onToggle
}: {
  asset: CollectedAsset
  selected: boolean
  iconOnly: boolean
  menu: NonNullable<Parameters<typeof AssetMenu>[0]['card']>
  onToggle: (shift: boolean) => void
}): React.JSX.Element {
  const setPreviewAsset = useDuduAdeStore((s) => s.setPreviewAsset)
  const label = useAssetLabel(asset)
  return (
    <AssetMenu asset={asset} card={menu}>
      <div
        draggable
        className={cn(
          'flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 hover:bg-muted/60',
          selected && 'bg-[#F1EDFF] dark:bg-[#6E48E5]/25',
          iconOnly && 'justify-center'
        )}
        title={asset.missing ? `${DUDU_ADE_COPY.assetMissing}: ${asset.location}` : asset.location}
        onDragStart={(event) => {
          event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id)
          event.dataTransfer.effectAllowed = 'copyMove'
        }}
        onClick={() => setPreviewAsset(asset.id)}
      >
        {iconOnly ? null : (
          <input
            type="checkbox"
            className="size-3 shrink-0 accent-[#6E48E5]"
            checked={selected}
            aria-label={label}
            // onClick, not onChange: only the mouse event knows Shift.
            onClick={(event) => {
              event.stopPropagation()
              onToggle(event.shiftKey)
            }}
            onChange={() => undefined}
          />
        )}
        {iconOnly ? (
          <AssetRowIconOnly asset={asset} />
        ) : (
          <>
            <AssetRowIcon asset={asset} />
            <AssetName
              asset={asset}
              className={cn(
                'min-w-0 flex-1 text-xs',
                asset.missing && 'text-muted-foreground line-through'
              )}
            />
          </>
        )}
      </div>
    </AssetMenu>
  )
}
