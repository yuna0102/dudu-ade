import { ChevronDown, ChevronRight, Pin, PinOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BOARD_HEADER_HEIGHT, type BoardCardGeometry } from './board-layout-state'
import { CARD_LABEL_GAP, CARD_LABEL_HEIGHT, cardLabelLayout } from './board-card-label'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useBoardCardDrag, type BoardCardChange } from './use-board-card-drag'

/** Shared chrome for every board card: draggable title bar, collapse, remove and a resize corner. */
export function BoardCardFrame({
  geometry,
  zoom,
  onCommit,
  onRemove,
  icon,
  title,
  subtitle,
  badges,
  actions,
  highlighted = false,
  overlay = false,
  onStartLink,
  focused = false,
  floatingLabel,
  children
}: {
  geometry: BoardCardGeometry
  zoom: number
  onCommit: (geometry: BoardCardGeometry, change: BoardCardChange) => void
  onRemove: () => void
  icon?: React.ReactNode
  title: React.ReactNode
  subtitle?: string
  badges?: React.ReactNode
  actions?: React.ReactNode
  highlighted?: boolean
  /** Notes and assets stay above terminals so they can always be grabbed and removed. */
  overlay?: boolean
  /** Shows a port on the right edge; dragging it to another card draws a link. */
  onStartLink?: (event: React.PointerEvent) => void
  /** This card's body takes keyboard, paste and wheel. */
  focused?: boolean
  /** Chip above the card; moves with the drag because it reads the live geometry. */
  floatingLabel?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  const { live, dragging, startMove, startResize } = useBoardCardDrag({ geometry, zoom, onCommit })
  const collapsed = live.collapsed === true
  // Handles keep a usable on-screen size when the board is zoomed out.
  const edge = Math.max(8, 8 / zoom)
  const corner = Math.max(16, 16 / zoom)
  const label = cardLabelLayout(zoom, live.w)
  return (
    <>
      {floatingLabel && label.visible ? (
        <div
          data-board-card
          className="absolute cursor-pointer"
          style={{
            left: live.x,
            top: live.y - CARD_LABEL_GAP / zoom - CARD_LABEL_HEIGHT,
            maxWidth: label.maxWidth,
            transform: `scale(${label.scale})`,
            transformOrigin: 'bottom left'
          }}
        >
          {floatingLabel}
        </div>
      ) : null}
      <div
        data-board-card
        data-board-card-focused={focused || undefined}
        className={cn(
          'absolute isolate flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xs',
          dragging && 'z-10 ring-2 ring-ring/40',
          highlighted && 'z-10 ring-4 ring-primary/70 transition-shadow',
          focused && 'z-10 ring-2 ring-[#6E48E5]',
          overlay && 'z-20'
        )}
        style={{
          left: live.x,
          top: live.y,
          width: live.w,
          height: collapsed ? BOARD_HEADER_HEIGHT : live.h
        }}
      >
        <div
          data-board-card-header
          className="flex shrink-0 cursor-grab items-center gap-1.5 border-b border-border bg-muted/40 pl-1 pr-1 active:cursor-grabbing"
          style={{ height: BOARD_HEADER_HEIGHT }}
          onPointerDown={startMove}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={collapsed ? DUDU_ADE_COPY.expand : DUDU_ADE_COPY.collapse}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onCommit({ ...geometry, collapsed: !collapsed }, 'collapse')}
          >
            {collapsed ? <ChevronRight /> : <ChevronDown />}
          </Button>
          {icon}
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate text-xs font-medium">{title}</span>
            {subtitle ? (
              <span className="truncate font-mono text-3xs text-muted-foreground">{subtitle}</span>
            ) : null}
          </div>
          {badges}
          <div className="flex items-center" onPointerDown={(event) => event.stopPropagation()}>
            {actions}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-pressed={geometry.pinned === true}
              aria-label={geometry.pinned ? DUDU_ADE_COPY.unpinCard : DUDU_ADE_COPY.pinCard}
              title={geometry.pinned ? DUDU_ADE_COPY.unpinCard : DUDU_ADE_COPY.pinCard}
              onClick={() => onCommit({ ...geometry, pinned: !geometry.pinned }, 'collapse')}
            >
              {geometry.pinned ? <PinOff /> : <Pin />}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={DUDU_ADE_COPY.removeFromBoard}
              title={DUDU_ADE_COPY.removeFromBoard}
              onClick={onRemove}
            >
              <X />
            </Button>
          </div>
        </div>
        {collapsed ? null : (
          <>
            <div className="relative min-h-0 flex-1" data-board-card-body>
              {children}
            </div>
            <div
              className="absolute bottom-0 left-0 cursor-ns-resize z-20 transition-colors hover:bg-[#6E48E5]/50"
              style={{ right: corner, height: edge }}
              title={DUDU_ADE_COPY.resizeCard}
              onPointerDown={(event) => startResize(event, 'y')}
              aria-hidden
            />
            <div
              className="absolute right-0 cursor-ew-resize z-20 transition-colors hover:bg-[#6E48E5]/50"
              style={{ top: BOARD_HEADER_HEIGHT, bottom: corner, width: edge }}
              title={DUDU_ADE_COPY.resizeCard}
              onPointerDown={(event) => startResize(event, 'x')}
              aria-hidden
            />
            <div
              className="absolute right-0 bottom-0 cursor-nwse-resize z-20 transition-colors hover:bg-[#6E48E5]/50"
              style={{ width: corner, height: corner }}
              title={DUDU_ADE_COPY.resizeCard}
              onPointerDown={(event) => startResize(event)}
              aria-hidden
            />
          </>
        )}
        {onStartLink && !collapsed ? (
          <button
            type="button"
            className="absolute top-1/2 z-30 cursor-crosshair rounded-full border-2 border-background bg-[#6E48E5] opacity-60 hover:opacity-100"
            style={{ right: 0, width: corner, height: corner, marginTop: -corner / 2 }}
            aria-label={DUDU_ADE_COPY.linkPort}
            title={DUDU_ADE_COPY.linkPort}
            onPointerDown={(event) => {
              event.stopPropagation()
              onStartLink(event)
            }}
          />
        ) : null}
      </div>
    </>
  )
}
