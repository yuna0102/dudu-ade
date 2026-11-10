import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  PanelLeftClose,
  FilePlus,
  Link2,
  PanelLeftOpen,
  Trash2
} from 'lucide-react'
import { memo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { ASSET_DRAG_TYPE } from './AssetDock'
import { AssetRow } from './BoardAssetRow'
import { manualAssetPath } from './asset-meta'
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
import { boardTerminalKey } from './board-terminal-listing'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'
import type { CollectedAsset, CollectedAssetSource } from './dudu-ade-store-types'

/** Below this board zoom 12px text is unreadable, so rows show icons only. */
const READABLE_ZOOM = 0.5
const CATEGORY_DRAG_TYPE = 'application/x-dudu-ade-asset-category'

/** A card's own assets beside it: everything its conversation produced, filed into per-card categories. */
export const BoardAssetPanel = memo(function BoardAssetPanel({
  cardKey,
  card,
  panel = EMPTY_ASSET_PANEL,
  assets,
  zoom,
  source,
  others,
  showEmpty
}: {
  cardKey: string
  card: BoardCardGeometry
  panel?: PanelState
  assets: CollectedAsset[]
  zoom: number
  /** The window this card shows, which files added by hand are recorded under. */
  source?: CollectedAssetSource
  /** The other cards a file can also be shown on. */
  others: { key: string; name: string }[]
  /** An empty list is only drawn for the card in use, so it has somewhere to add files. */
  showEmpty: boolean
}): React.JSX.Element | null {
  const updateBoard = useDuduAdeStore((s) => s.updateBoard)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastId, setLastId] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [pasting, setPasting] = useState(false)
  const [pasteInvalid, setPasteInvalid] = useState(false)
  const update = (change: (current: PanelState) => PanelState): void =>
    updateBoard((board) => ({
      assetPanels: {
        ...board.assetPanels,
        [cardKey]: change(board.assetPanels[cardKey] ?? EMPTY_ASSET_PANEL)
      }
    }))
  if (assets.length === 0 && panel.categories.length === 0 && !showEmpty) {
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
  const owners = new Set([cardKey, ...(panel.sources ?? [])])
  const addPaths = (paths: readonly string[]): boolean => {
    if (!source || paths.length === 0) {
      return false
    }
    useDuduAdeStore.getState().addManualAssets(cardKey, source, paths)
    return true
  }
  const pickFiles = (): void => {
    void window.api.shell
      .pickAttachments()
      .then((paths) => {
        if (paths.length > 0) {
          setPasteInvalid(!addPaths(paths))
        }
      })
      .catch(() => undefined)
  }
  const row = (asset: CollectedAsset): React.JSX.Element => (
    <AssetRow
      key={asset.id}
      asset={asset}
      menu={{
        key: cardKey,
        others,
        collectedHere: owners.has(boardTerminalKey(asset.source))
      }}
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
          aria-label={DUDU_ADE_COPY.assetFileAdd}
          title={DUDU_ADE_COPY.assetFileAdd}
          disabled={!source}
          onClick={pickFiles}
        >
          <FilePlus />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={DUDU_ADE_COPY.assetPathPaste}
          title={DUDU_ADE_COPY.assetPathPaste}
          disabled={!source}
          onClick={() => setPasting(!pasting)}
        >
          <Link2 />
        </Button>
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
      {pasting || pasteInvalid ? (
        <div className="flex shrink-0 flex-col gap-1 border-b border-border p-1.5">
          <input
            autoFocus
            className="h-6 min-w-0 rounded border border-border bg-transparent px-1 font-mono text-2xs outline-none aria-invalid:border-destructive"
            aria-invalid={pasteInvalid}
            placeholder={DUDU_ADE_COPY.assetPathPaste}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !isImeOwnedKeyboardEvent(event)) {
                const path = manualAssetPath(event.currentTarget.value, null)
                const added = path ? addPaths([path]) : false
                setPasteInvalid(!added)
                if (added) {
                  event.currentTarget.value = ''
                  setPasting(false)
                }
              } else if (event.key === 'Escape') {
                setPasting(false)
                setPasteInvalid(false)
              }
            }}
          />
          {pasteInvalid ? (
            <span className="text-2xs text-destructive">{DUDU_ADE_COPY.assetPathInvalid}</span>
          ) : null}
        </div>
      ) : null}
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
