import { useEffect, useRef } from 'react'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { cn } from '@/lib/utils'
import { assetLabel, nextAssetName } from './asset-meta'
import { assetDisplayName } from './AssetPreview'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'
import type { CollectedAsset } from './dudu-ade-store-types'

/** Only pages and artifact links are renamed; other files show the name they have. */
export const isRenamableAsset = (asset: Pick<CollectedAsset, 'kind'>): boolean =>
  asset.kind === 'html' || asset.kind === 'artifact-link'

/** The name to show for an asset: the user's, else the file's. */
export function useAssetLabel(asset: CollectedAsset): string {
  const name = useDuduAdeStore((state) => state.board.assetMeta?.[asset.id]?.name)
  return name || assetDisplayName(asset)
}

/** An asset's shown name, edited where it stands (double click, F2 or the menu). The file keeps its own name. */
export function AssetName({
  asset,
  className
}: {
  asset: CollectedAsset
  className?: string
}): React.JSX.Element {
  const meta = useDuduAdeStore((state) => state.board.assetMeta?.[asset.id])
  const editing = useDuduAdeStore((state) => state.renamingAssetId === asset.id)
  const original = assetDisplayName(asset)
  const shown = assetLabel(asset, original, { [asset.id]: meta ?? {} })
  const cancelled = useRef(false)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) {
      cancelled.current = false
      field.current?.select()
    }
  }, [editing])
  const finish = (typed: string): void => {
    const name = cancelled.current ? null : nextAssetName(typed, shown)
    const store = useDuduAdeStore.getState()
    if (name) {
      // Back to the file's own name clears the saved one.
      store.setAssetMeta(asset.id, { name: name === original ? null : name })
    }
    store.startRenameAsset(null)
  }
  if (!editing || !isRenamableAsset(asset)) {
    const renamable = isRenamableAsset(asset)
    return (
      <span
        className={cn('truncate', className)}
        title={meta?.name ? `${DUDU_ADE_COPY.assetNameOriginal}: ${original}` : undefined}
        tabIndex={renamable ? 0 : undefined}
        onDoubleClick={
          renamable
            ? (event) => {
                event.stopPropagation()
                useDuduAdeStore.getState().startRenameAsset(asset.id)
              }
            : undefined
        }
        onKeyDown={
          renamable
            ? (event) => {
                if (event.key === 'F2') {
                  event.preventDefault()
                  useDuduAdeStore.getState().startRenameAsset(asset.id)
                }
              }
            : undefined
        }
      >
        {shown}
      </span>
    )
  }
  return (
    <input
      ref={field}
      autoFocus
      aria-label={DUDU_ADE_COPY.assetRename}
      className="h-5 min-w-0 flex-1 rounded border border-border bg-background px-1 text-xs outline-none"
      defaultValue={shown}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter' && !isImeOwnedKeyboardEvent(event)) {
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          cancelled.current = true
          event.currentTarget.blur()
        }
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  )
}
