import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2
} from 'lucide-react'
import { memo, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { cn } from '@/lib/utils'
import { ASSET_DRAG_TYPE } from './AssetDock'
import { KIND_ICONS, assetDisplayName, useAssetPreview } from './AssetPreview'
import {
  COLLAPSED_PANEL_WIDTH,
  EMPTY_ASSET_PANEL,
  PANEL_GAP,
  PANEL_WIDTH,
  assignAssetsToCategory,
  createAssetCategory,
  deleteAssetCategory,
  groupPanelAssets,
  moveAssetCategory,
  nextAssetSelection,
  updateAssetCategory,
  type BoardAssetPanel as PanelState
} from './board-asset-panels'
import { cardHeight, type BoardCardGeometry } from './board-layout-state'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'
import type { CollectedAsset } from './dudu-ade-store-types'

/** Below this board zoom 12px text is unreadable, so rows show icons only. */
const READABLE_ZOOM = 0.5
const CATEGORY_DRAG_TYPE = 'application/x-dudu-ade-asset-category'

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

function AssetRow({
  asset,
  selected,
  iconOnly,
  onToggle
}: {
  asset: CollectedAsset
  selected: boolean
  iconOnly: boolean
  onToggle: (shift: boolean) => void
}): React.JSX.Element {
  const setPreviewAsset = useDuduAdeStore((s) => s.setPreviewAsset)
  return (
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
          aria-label={assetDisplayName(asset)}
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
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-xs',
              asset.missing && 'text-muted-foreground line-through'
            )}
          >
            {assetDisplayName(asset)}
          </span>
        </>
      )}
    </div>
  )
}

/** A card's own assets beside it: everything its conversation produced, filed into per-card categories. */
export const BoardAssetPanel = memo(function BoardAssetPanel({
  cardKey,
  card,
  panel = EMPTY_ASSET_PANEL,
  assets,
  zoom
}: {
  cardKey: string
  card: BoardCardGeometry
  panel?: PanelState
  assets: CollectedAsset[]
  zoom: number
}): React.JSX.Element | null {
  const updateBoard = useDuduAdeStore((s) => s.updateBoard)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastId, setLastId] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const update = (change: (current: PanelState) => PanelState): void =>
    updateBoard((board) => ({
      assetPanels: {
        ...board.assetPanels,
        [cardKey]: change(board.assetPanels[cardKey] ?? EMPTY_ASSET_PANEL)
      }
    }))
  if (assets.length === 0 && panel.categories.length === 0) {
    return null
  }
  const height = cardHeight(card)
  const box = (width: number): React.CSSProperties => ({
    left: card.x - width - PANEL_GAP,
    top: card.y,
    width,
    height
  })
  if (panel.collapsed) {
    return (
      <button
        type="button"
        data-board-card
        className="absolute flex flex-col items-center gap-1 rounded-lg border border-border bg-card pt-1.5 text-3xs text-muted-foreground hover:text-foreground"
        style={box(COLLAPSED_PANEL_WIDTH)}
        title={DUDU_ADE_COPY.assetPanelOpen}
        aria-label={DUDU_ADE_COPY.assetPanelOpen}
        onClick={() => update((current) => ({ ...current, collapsed: false }))}
      >
        <PanelLeftOpen className="size-3.5" />
        {assets.length}
      </button>
    )
  }
  const iconOnly = zoom < READABLE_ZOOM
  const { groups, unfiled } = groupPanelAssets(panel, assets)
  const ordered = [
    ...groups.flatMap((group) => (group.category.collapsed ? [] : group.assets)),
    ...unfiled
  ].map((asset) => asset.id)
  const clearSelection = (): void => {
    setSelected(new Set())
    setLastId(null)
  }
  const fileInto = (categoryId: string | null, ids: string[]): void => {
    update((current) => assignAssetsToCategory(current, categoryId, ids))
    clearSelection()
  }
  /** Dropping one selected row moves the whole selection; other cards' assets are not ours to file. */
  const droppedIds = (event: React.DragEvent): string[] => {
    const id = event.dataTransfer.getData(ASSET_DRAG_TYPE)
    if (!id || !assets.some((asset) => asset.id === id)) {
      return []
    }
    return selected.has(id) ? [...selected] : [id]
  }
  const row = (asset: CollectedAsset): React.JSX.Element => (
    <AssetRow
      key={asset.id}
      asset={asset}
      selected={selected.has(asset.id)}
      iconOnly={iconOnly}
      onToggle={(shift) => {
        setSelected(nextAssetSelection(selected, ordered, asset.id, lastId, shift))
        setLastId(asset.id)
      }}
    />
  )
  return (
    <div
      data-board-card
      className="absolute flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xs"
      style={box(PANEL_WIDTH)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        // Inside the panel a drop files or unfiles; only a drop on open board makes a free card.
        event.preventDefault()
        event.stopPropagation()
        const ids = droppedIds(event)
        if (ids.length > 0) {
          fileInto(null, ids)
        }
      }}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border bg-muted/40 pl-2 pr-1">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {DUDU_ADE_COPY.assetPanel} {assets.length}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={DUDU_ADE_COPY.assetPanelClose}
          title={DUDU_ADE_COPY.assetPanelClose}
          onClick={() => update((current) => ({ ...current, collapsed: true }))}
        >
          <PanelLeftClose />
        </Button>
      </div>
      {selected.size > 0 && !iconOnly ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border p-1.5 text-2xs">
          <span className="text-muted-foreground">
            {selected.size}
            {DUDU_ADE_COPY.assetSelected}
          </span>
          {naming ? (
            <input
              autoFocus
              className="h-6 min-w-0 flex-1 rounded border border-border bg-transparent px-1 text-xs outline-none"
              placeholder={DUDU_ADE_COPY.assetCategoryNameHint}
              onBlur={() => setNaming(false)}
              onKeyDown={(event) => {
                const name = event.currentTarget.value.trim()
                if (event.key === 'Enter' && name && !isImeOwnedKeyboardEvent(event)) {
                  update((current) => createAssetCategory(current, name, [...selected]))
                  clearSelection()
                  setNaming(false)
                }
              }}
            />
          ) : (
            <Button variant="ghost" size="xs" onClick={() => setNaming(true)}>
              <FolderPlus />
              {DUDU_ADE_COPY.assetCategoryNew}
            </Button>
          )}
          {panel.categories.length > 0 ? (
            <select
              className="h-6 min-w-0 flex-1 rounded border border-border bg-transparent text-xs"
              aria-label={DUDU_ADE_COPY.assetCategoryMoveTo}
              value=""
              onChange={(event) =>
                fileInto(event.target.value === 'none' ? null : event.target.value, [...selected])
              }
            >
              <option value="" disabled>
                {DUDU_ADE_COPY.assetCategoryMoveTo}
              </option>
              {panel.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              <option value="none">{DUDU_ADE_COPY.assetCategoryOut}</option>
            </select>
          ) : null}
        </div>
      ) : null}
      {/* Marked as a card body so the wheel scrolls this list instead of panning the board. */}
      <div data-board-card-body className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek p-1">
        {groups.map(({ category, assets: filed }) => (
          <div key={category.id} className="mb-1">
            <div
              draggable
              className="group flex items-center gap-0.5 rounded px-0.5 hover:bg-muted/60"
              onDragStart={(event) => event.dataTransfer.setData(CATEGORY_DRAG_TYPE, category.id)}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                const moving = event.dataTransfer.getData(CATEGORY_DRAG_TYPE)
                if (moving) {
                  update((current) => moveAssetCategory(current, moving, category.id))
                  return
                }
                const ids = droppedIds(event)
                if (ids.length > 0) {
                  fileInto(category.id, ids)
                }
              }}
            >
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={category.collapsed ? DUDU_ADE_COPY.expand : DUDU_ADE_COPY.collapse}
                onClick={() =>
                  update((current) =>
                    updateAssetCategory(current, category.id, { collapsed: !category.collapsed })
                  )
                }
              >
                {category.collapsed ? <ChevronRight /> : <ChevronDown />}
              </Button>
              {renamingId === category.id ? (
                <input
                  autoFocus
                  defaultValue={category.name}
                  className="h-5 min-w-0 flex-1 rounded border border-border bg-transparent px-1 text-xs outline-none"
                  aria-label={DUDU_ADE_COPY.assetCategoryRename}
                  onBlur={(event) => {
                    const name = event.currentTarget.value.trim()
                    if (name) {
                      update((current) => updateAssetCategory(current, category.id, { name }))
                    }
                    setRenamingId(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !isImeOwnedKeyboardEvent(event)) {
                      event.currentTarget.blur()
                    }
                  }}
                />
              ) : (
                <span
                  className="min-w-0 flex-1 truncate text-xs font-medium"
                  title={DUDU_ADE_COPY.assetCategoryRename}
                  onDoubleClick={() => setRenamingId(category.id)}
                >
                  {iconOnly ? '' : `${category.name} ${filed.length}`}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100"
                aria-label={DUDU_ADE_COPY.assetCategoryDelete}
                title={DUDU_ADE_COPY.assetCategoryDelete}
                onClick={() => update((current) => deleteAssetCategory(current, category.id))}
              >
                <Trash2 />
              </Button>
            </div>
            {category.collapsed ? null : filed.map(row)}
          </div>
        ))}
        {groups.length > 0 && unfiled.length > 0 && !iconOnly ? (
          <div className="px-1 pt-1 text-3xs text-muted-foreground">
            {DUDU_ADE_COPY.assetUncategorized}
          </div>
        ) : null}
        {unfiled.map(row)}
      </div>
    </div>
  )
})
