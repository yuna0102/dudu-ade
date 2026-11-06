import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, LayoutGrid, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { cn } from '@/lib/utils'
import {
  CATEGORY_COLORS,
  FRAME_LABEL,
  type BoardCategory,
  type BoardRect
} from './board-layout-state'
import { BUCKET_LABELS, type BoardAgentBucket } from './board-agent-labels'
import { resizeAreaRect, type AreaEdges } from './board-areas'
import { DUDU_ADE_COPY } from './dudu-ade-copy'

export type CategorySummary = {
  count: number
  buckets: Record<BoardAgentBucket, number>
  models: string
}

const RESIZE_HANDLES: {
  edges: AreaEdges
  cursor: string
  place: (edge: number) => React.CSSProperties
}[] = [
  {
    edges: { n: true },
    cursor: 'ns-resize',
    place: (e) => ({ top: -e / 2, left: e, right: e, height: e })
  },
  {
    edges: { s: true },
    cursor: 'ns-resize',
    place: (e) => ({ bottom: -e / 2, left: e, right: e, height: e })
  },
  {
    edges: { w: true },
    cursor: 'ew-resize',
    place: (e) => ({ left: -e / 2, top: e, bottom: e, width: e })
  },
  {
    edges: { e: true },
    cursor: 'ew-resize',
    place: (e) => ({ right: -e / 2, top: e, bottom: e, width: e })
  },
  {
    edges: { n: true, w: true },
    cursor: 'nwse-resize',
    place: (e) => ({ top: -e / 2, left: -e / 2, width: e * 1.5, height: e * 1.5 })
  },
  {
    edges: { n: true, e: true },
    cursor: 'nesw-resize',
    place: (e) => ({ top: -e / 2, right: -e / 2, width: e * 1.5, height: e * 1.5 })
  },
  {
    edges: { s: true, w: true },
    cursor: 'nesw-resize',
    place: (e) => ({ bottom: -e / 2, left: -e / 2, width: e * 1.5, height: e * 1.5 })
  },
  {
    edges: { s: true, e: true },
    cursor: 'nwse-resize',
    place: (e) => ({ bottom: -e / 2, right: -e / 2, width: e * 1.5, height: e * 1.5 })
  }
]

/** Named, colored area behind a category's cards; its label row drags, renames, sorts and folds the group. */
export function BoardCategoryFrame({
  category,
  rect,
  zoom,
  summary,
  onMoveBy,
  onRename,
  onColor,
  onToggleCollapse,
  onArrange,
  onDelete,
  memberRect,
  selected,
  autoEdit,
  onSelect,
  onResize
}: {
  category: BoardCategory
  rect: BoardRect
  zoom: number
  summary: CategorySummary
  onMoveBy: (dx: number, dy: number) => void
  onRename: (name: string) => void
  onColor: (color: string) => void
  onToggleCollapse: () => void
  onArrange: () => void
  onDelete: () => void
  /** The smallest frame that still wraps its cards; null when empty. */
  memberRect: BoardRect | null
  selected: boolean
  /** A just-drawn area asks for its name right away. */
  autoEdit: boolean
  onSelect: () => void
  onResize: (rect: BoardRect) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(autoEdit)
  const [draft, setDraft] = useState<BoardRect | null>(null)
  useEffect(() => {
    if (autoEdit) {
      setEditing(true)
    }
  }, [autoEdit])
  const shown = draft ?? rect
  const edge = Math.max(8, 8 / zoom)
  const startResize =
    (edges: AreaEdges) =>
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)
      const origin = { x: event.clientX, y: event.clientY }
      let latest = rect
      const onMove = (move: PointerEvent): void => {
        latest = resizeAreaRect(
          rect,
          edges,
          (move.clientX - origin.x) / zoom,
          (move.clientY - origin.y) / zoom,
          memberRect
        )
        setDraft(latest)
      }
      const onUp = (): void => {
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerup', onUp)
        target.removeEventListener('pointercancel', onUp)
        setDraft(null)
        onResize(latest)
      }
      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onUp)
      target.addEventListener('pointercancel', onUp)
    }
  const collapsed = category.collapsed === true

  const startDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || editing) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    onSelect()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    let last = { x: event.clientX, y: event.clientY }
    const onMove = (move: PointerEvent): void => {
      const dx = (move.clientX - last.x) / zoom
      const dy = (move.clientY - last.y) / zoom
      last = { x: move.clientX, y: move.clientY }
      if (dx !== 0 || dy !== 0) {
        onMoveBy(dx, dy)
      }
    }
    const onUp = (): void => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  const nextColor = (): string =>
    CATEGORY_COLORS[
      (CATEGORY_COLORS.indexOf(category.color as (typeof CATEGORY_COLORS)[number]) + 1) %
        CATEGORY_COLORS.length
    ]

  return (
    <div
      data-board-frame={category.id}
      className="absolute rounded-xl border-2"
      style={{
        left: shown.x,
        top: shown.y,
        width: shown.w,
        height: collapsed ? FRAME_LABEL : shown.h,
        borderColor: selected ? category.color : `${category.color}66`,
        background: collapsed ? `${category.color}22` : `${category.color}0d`
      }}
    >
      <div
        data-board-card
        data-board-frame-label
        className="flex cursor-grab items-center gap-1.5 px-2 active:cursor-grabbing"
        style={{ height: FRAME_LABEL - 4 }}
        onPointerDown={startDrag}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={collapsed ? DUDU_ADE_COPY.expand : DUDU_ADE_COPY.collapse}
          title={collapsed ? DUDU_ADE_COPY.expand : DUDU_ADE_COPY.collapse}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onToggleCollapse}
        >
          {collapsed ? <ChevronRight /> : <ChevronDown />}
        </Button>
        <button
          type="button"
          className="size-3.5 shrink-0 rounded-full border border-black/10"
          style={{ background: category.color }}
          aria-label={DUDU_ADE_COPY.categoryColor}
          title={DUDU_ADE_COPY.categoryColor}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onColor(nextColor())}
        />
        {editing ? (
          <input
            autoFocus
            className="h-6 min-w-0 rounded border border-border bg-background px-1.5 text-sm font-semibold outline-none"
            defaultValue={category.name}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !isImeOwnedKeyboardEvent(event)) {
                event.currentTarget.blur()
              } else if (event.key === 'Escape') {
                setEditing(false)
              }
            }}
            onBlur={(event) => {
              setEditing(false)
              const name = event.currentTarget.value.trim()
              if (name && name !== category.name) {
                onRename(name)
              }
            }}
          />
        ) : (
          <span
            className="truncate text-sm font-semibold"
            style={{ color: category.color }}
            title={DUDU_ADE_COPY.renameHint}
            onDoubleClick={() => setEditing(true)}
          >
            {category.name}
          </span>
        )}
        <span className="shrink-0 text-2xs text-muted-foreground">{`${summary.count}개`}</span>
        <div className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
          {summary.buckets.attention > 0 ? (
            <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 text-amber-700 dark:text-amber-300">
              {`${BUCKET_LABELS.attention} ${summary.buckets.attention}`}
            </span>
          ) : null}
          {summary.buckets.working > 0 ? (
            <span className="shrink-0">{`${BUCKET_LABELS.working} ${summary.buckets.working}`}</span>
          ) : null}
          {summary.models ? <span className="truncate">{summary.models}</span> : null}
        </div>
        <div className="flex-1" />
        <div
          className={cn('flex shrink-0 items-center')}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={DUDU_ADE_COPY.arrangeCategory}
            title={DUDU_ADE_COPY.arrangeCategory}
            onClick={onArrange}
          >
            <LayoutGrid />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={DUDU_ADE_COPY.deleteCategory}
            title={DUDU_ADE_COPY.deleteCategory}
            onClick={onDelete}
          >
            <X />
          </Button>
        </div>
      </div>
      {summary.count === 0 && !collapsed ? (
        <div className="px-4 text-xs text-muted-foreground">{DUDU_ADE_COPY.emptyCategory}</div>
      ) : null}
      {collapsed
        ? null
        : RESIZE_HANDLES.map(({ edges, cursor, place }) => (
            <div
              key={cursor + JSON.stringify(edges)}
              data-board-card
              aria-hidden
              className="absolute"
              style={{ ...place(edge), cursor }}
              onPointerDown={startResize(edges)}
            />
          ))}
    </div>
  )
}
