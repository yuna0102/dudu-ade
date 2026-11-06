import { useRef, useState } from 'react'
import type { BoardCardGeometry } from './board-layout-state'

const MIN_CARD_SIZE = { w: 200, h: 120 }

export type BoardCardChange = 'move' | 'resize' | 'collapse'

/** Which edges a resize drag moves: the corner both, the bottom edge height only, the right edge width only. */
export type BoardResizeAxis = 'both' | 'x' | 'y'

/** Move (header) and resize (corner or edge) in board units; commits once on release so storage writes stay rare. */
export function useBoardCardDrag(args: {
  geometry: BoardCardGeometry
  zoom: number
  onCommit: (geometry: BoardCardGeometry, change: BoardCardChange) => void
}): {
  live: BoardCardGeometry
  dragging: boolean
  startMove: (event: React.PointerEvent) => void
  startResize: (event: React.PointerEvent, axis?: BoardResizeAxis) => void
} {
  const [draft, setDraft] = useState<BoardCardGeometry | null>(null)
  const draftRef = useRef<BoardCardGeometry | null>(null)

  const start = (
    event: React.PointerEvent,
    mode: 'move' | 'resize',
    axis: BoardResizeAxis = 'both'
  ): void => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    const origin = { x: event.clientX, y: event.clientY }
    const base = args.geometry
    const zoom = args.zoom
    const onMove = (move: PointerEvent): void => {
      const dx = (move.clientX - origin.x) / zoom
      const dy = (move.clientY - origin.y) / zoom
      const next =
        mode === 'move'
          ? { ...base, x: base.x + dx, y: base.y + dy }
          : {
              ...base,
              w: axis === 'y' ? base.w : Math.max(MIN_CARD_SIZE.w, base.w + dx),
              h: axis === 'x' ? base.h : Math.max(MIN_CARD_SIZE.h, base.h + dy)
            }
      draftRef.current = next
      setDraft(next)
    }
    const onUp = (): void => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      const committed = draftRef.current
      draftRef.current = null
      setDraft(null)
      if (committed) {
        args.onCommit(committed, mode)
      }
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  return {
    live: draft ?? args.geometry,
    dragging: draft !== null,
    startMove: (event) => start(event, 'move'),
    startResize: (event, axis) => start(event, 'resize', axis)
  }
}
