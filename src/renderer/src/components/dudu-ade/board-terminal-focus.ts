import { clampZoom, type BoardRect, type BoardViewport } from './board-layout-state'

const CLICK_MOVE_TOLERANCE_PX = 4
/** A focused card should fill most of the screen; 0.8 leaves a margin around it. */
const FOCUS_FILL = 0.8
const ALREADY_ZOOMED_FILL = 0.7
const MIN_TERMINAL_FONT = 8
const MAX_TERMINAL_FONT = 32

export const DEFAULT_TERMINAL_FONT = 14

/** Below this zoom a chat cannot be read, so it stays mounted without its heavier updates. */
export const CHAT_READABLE_ZOOM = 0.2

export function chatStaysLive(
  card: BoardRect,
  view: BoardRect,
  zoom: number,
  focused: boolean
): boolean {
  if (focused) {
    return true
  }
  const onScreen =
    card.x < view.x + view.w &&
    view.x < card.x + card.w &&
    card.y < view.y + view.h &&
    view.y < card.y + card.h
  return onScreen && zoom >= CHAT_READABLE_ZOOM
}

export type BoardWheelRoute = 'zoom' | 'pan' | 'card'

/**
 * Who gets a wheel event. Pinch and Cmd+wheel always zoom the board. An unfocused terminal body is
 * locked and belongs to the board; a focused terminal and note or asset bodies scroll themselves.
 */
export function boardWheelRoute(args: {
  modified: boolean
  insideCardBody: boolean
  insideLockedBody: boolean
  /** A focused terminal takes the wheel whatever its state; a TUI may use it. */
  insideFocusedCard: boolean
  /** Note, asset or list body with room to scroll this way; with none it must not swallow the pan. */
  canScrollHere: boolean
}): BoardWheelRoute {
  if (args.modified) {
    return 'zoom'
  }
  if (!args.insideCardBody || args.insideLockedBody) {
    return 'pan'
  }
  return args.insideFocusedCard || args.canScrollHere ? 'card' : 'pan'
}

const LINE_PX = 40

/** Wheel distance in screen pixels. A mouse can report lines or pages, which read as almost no movement if taken as pixels. Shift turns a vertical wheel sideways. */
export function wheelPanDelta(
  event: { deltaX: number; deltaY: number; deltaMode: number; shiftKey: boolean },
  pageHeight: number
): { x: number; y: number } {
  const unit = event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? pageHeight : 1
  const x = event.deltaX * unit
  const y = event.deltaY * unit
  return event.shiftKey && x === 0 ? { x: y, y: 0 } : { x, y }
}

/** Whether a box could still scroll in the wheel's direction. */
export function hasScrollRoom(
  box: {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
    scrollLeft: number
    scrollWidth: number
    clientWidth: number
    overflowY: string
    overflowX: string
  },
  dx: number,
  dy: number
): boolean {
  const scrolls = (overflow: string): boolean => overflow === 'auto' || overflow === 'scroll'
  const vertical =
    scrolls(box.overflowY) &&
    (dy > 0 ? box.scrollTop + box.clientHeight < box.scrollHeight - 1 : dy < 0 && box.scrollTop > 0)
  const horizontal =
    scrolls(box.overflowX) &&
    (dx > 0 ? box.scrollLeft + box.clientWidth < box.scrollWidth - 1 : dx < 0 && box.scrollLeft > 0)
  return vertical || horizontal
}

/** A press only activates a card when the pointer did not travel; anything longer is a drag. */
export function isStationaryClick(
  down: { x: number; y: number },
  up: { x: number; y: number }
): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= CLICK_MOVE_TOLERANCE_PX
}

/** Where a clicked card should sit: centered at a zoom that fills the screen; null when it is already big enough. */
export function focusViewportFor(
  rect: BoardRect,
  viewport: BoardViewport,
  screen: { width: number; height: number }
): BoardViewport | null {
  if (screen.width <= 0 || screen.height <= 0 || rect.w <= 0 || rect.h <= 0) {
    return null
  }
  const whole = Math.min(screen.width / rect.w, screen.height / rect.h)
  if (viewport.zoom >= whole * ALREADY_ZOOMED_FILL) {
    return null
  }
  const zoom = clampZoom(whole * FOCUS_FILL)
  return {
    zoom,
    x: screen.width / 2 - (rect.x + rect.w / 2) * zoom,
    y: screen.height / 2 - (rect.y + rect.h / 2) * zoom
  }
}

/** Ease-out between two views; x and y follow the eased zoom so the card glides straight to center. */
export function interpolateViewport(
  from: BoardViewport,
  to: BoardViewport,
  progress: number
): BoardViewport {
  const t = Math.min(1, Math.max(0, progress))
  const eased = 1 - (1 - t) ** 3
  return {
    zoom: from.zoom + (to.zoom - from.zoom) * eased,
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased
  }
}

export function nextTerminalFontSize(current: number, direction: 'in' | 'out' | 'reset'): number {
  if (direction === 'reset') {
    return DEFAULT_TERMINAL_FONT
  }
  return Math.min(
    MAX_TERMINAL_FONT,
    Math.max(MIN_TERMINAL_FONT, current + (direction === 'in' ? 1 : -1))
  )
}

export function visibleBoardRect(
  viewport: BoardViewport,
  screen: { width: number; height: number }
): BoardRect {
  return {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    w: Math.max(1, screen.width) / viewport.zoom,
    h: Math.max(1, screen.height) / viewport.zoom
  }
}
