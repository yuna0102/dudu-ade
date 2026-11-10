import { useEffect } from 'react'

const MOUSE_EVENTS = [
  'mousedown',
  'mouseup',
  'mousemove',
  'click',
  'dblclick',
  'contextmenu',
  'wheel'
] as const

/** Maps a point on a CSS-scaled box back to where it sits at the box's real size. */
export function unscaledPoint(
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  size: { width: number; height: number }
): { x: number; y: number } {
  const scaleX = size.width > 0 ? rect.width / size.width : 1
  const scaleY = size.height > 0 ? rect.height / size.height : 1
  return {
    x: rect.left + (point.x - rect.left) / (scaleX || 1),
    y: rect.top + (point.y - rect.top) / (scaleY || 1)
  }
}

/**
 * xterm turns a click into a cell from the scaled on-screen rect but unscaled cell sizes, so on a zoomed
 * board clicks land on the wrong cell (status-line buttons miss). Re-dispatch mouse events with
 * coordinates at the terminal's real size.
 * shortcut: drag-selection listeners xterm puts on the document are not corrected, so selection may drift when zoomed.
 */
export function useUnscaledTerminalMouse(containerRef: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const relayed = new WeakSet<Event>()
    const onMouse = (event: MouseEvent): void => {
      const screen = container.querySelector<HTMLElement>('.xterm-screen')
      if (
        relayed.has(event) ||
        !screen ||
        !(event.target instanceof Node) ||
        !screen.contains(event.target)
      ) {
        return
      }
      const rect = screen.getBoundingClientRect()
      if (
        Math.abs(rect.width - screen.offsetWidth) < 0.5 &&
        Math.abs(rect.height - screen.offsetHeight) < 0.5
      ) {
        return
      }
      const point = unscaledPoint({ x: event.clientX, y: event.clientY }, rect, {
        width: screen.offsetWidth,
        height: screen.offsetHeight
      })
      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: point.x,
        clientY: point.y,
        screenX: event.screenX,
        screenY: event.screenY,
        button: event.button,
        buttons: event.buttons,
        detail: event.detail,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey
      }
      const copy =
        event instanceof WheelEvent
          ? new WheelEvent(event.type, {
              ...init,
              deltaX: event.deltaX,
              deltaY: event.deltaY,
              deltaMode: event.deltaMode
            })
          : new MouseEvent(event.type, init)
      relayed.add(copy)
      event.stopPropagation()
      event.preventDefault()
      event.target.dispatchEvent(copy)
    }
    for (const type of MOUSE_EVENTS) {
      container.addEventListener(type, onMouse as EventListener, { capture: true, passive: false })
    }
    return () => {
      for (const type of MOUSE_EVENTS) {
        container.removeEventListener(type, onMouse as EventListener, { capture: true })
      }
    }
  }, [containerRef])
}

/** Hands keyboard focus to the card's terminal while it is focused, and takes it back when it is not. */
export function useBoardCardInputFocus(
  bodyRef: React.RefObject<HTMLElement | null>,
  focused: boolean
): void {
  useEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }
    const input = (): HTMLElement | null =>
      body.querySelector(
        '.xterm-helper-textarea, [data-native-chat-root] [contenteditable="true"], [data-native-chat-root] textarea'
      )
    if (!focused) {
      if (document.activeElement instanceof HTMLElement && body.contains(document.activeElement)) {
        document.activeElement.blur()
      }
      return
    }
    input()?.focus()
    // A press on the padding or the blank area below the grid would otherwise drop focus, and Cmd+V with it.
    const onMouseDown = (event: MouseEvent): void => {
      const screen = body.querySelector('.xterm-screen')
      if (screen && event.target instanceof Node && !screen.contains(event.target)) {
        event.preventDefault()
        input()?.focus()
      }
    }
    body.addEventListener('mousedown', onMouseDown, true)
    return () => body.removeEventListener('mousedown', onMouseDown, true)
  }, [bodyRef, focused])
}
