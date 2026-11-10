import { useEffect } from 'react'
import { zoomViewportAt, type BoardViewport } from './board-layout-state'
import { boardWheelRoute, hasScrollRoom, wheelPanDelta } from './board-terminal-focus'

const WHEEL_ZOOM_SPEED = 0.0015

function canScrollFrom(target: Element | null, stop: Element, dx: number, dy: number): boolean {
  for (let box = target; box && box !== stop; box = box.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(box)
    if (
      hasScrollRoom(
        {
          scrollTop: box.scrollTop,
          scrollHeight: box.scrollHeight,
          clientHeight: box.clientHeight,
          scrollLeft: box.scrollLeft,
          scrollWidth: box.scrollWidth,
          clientWidth: box.clientWidth,
          overflowX,
          overflowY
        },
        dx,
        dy
      )
    ) {
      return true
    }
  }
  return false
}

/** A focused xterm's hidden textarea follows the cursor, and the browser scrolls clipped ancestors to reveal it on every keystroke. */
export function resetClippedScroll(element: HTMLElement): void {
  const style = getComputedStyle(element)
  // Per axis: `overflow-x: hidden` with `overflow-y: auto` is a real scroller (a chat's message list).
  if (style.overflowY === 'hidden') {
    element.scrollTop = 0
  }
  if (style.overflowX === 'hidden') {
    element.scrollLeft = 0
  }
}

/** Native capture listener: React wheel handlers are passive, and xterm must not eat what belongs to the board. */
export function useBoardWheel(args: {
  viewportRef: React.RefObject<HTMLDivElement | null>
  viewportStateRef: React.RefObject<BoardViewport>
  stopAnimationRef: React.RefObject<() => void>
  setViewport: (viewport: BoardViewport) => void
}): void {
  const { viewportRef, viewportStateRef, stopAnimationRef, setViewport } = args
  useEffect(() => {
    const element = viewportRef.current
    if (!element) {
      return
    }
    const onWheel = (event: WheelEvent): void => {
      const target = event.target instanceof Element ? event.target : null
      const delta = wheelPanDelta(event, element.clientHeight)
      const route = boardWheelRoute({
        modified: event.ctrlKey || event.metaKey,
        insideCardBody: target?.closest('[data-board-card-body]') != null,
        insideLockedBody: target?.closest('[data-board-terminal-locked]') != null,
        insideFocusedCard: target?.closest('[data-board-card-focused]') != null,
        canScrollHere: canScrollFrom(target, element, delta.x, delta.y)
      })
      if (route === 'card') {
        return
      }
      event.stopPropagation()
      event.preventDefault()
      stopAnimationRef.current()
      const current = viewportStateRef.current
      if (route === 'zoom') {
        const rect = element.getBoundingClientRect()
        setViewport(
          zoomViewportAt(current, current.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED * 4), {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
          })
        )
        return
      }
      setViewport({ ...current, x: current.x - delta.x, y: current.y - delta.y })
    }
    const onScroll = (event: Event): void => {
      if (event.target instanceof HTMLElement) {
        resetClippedScroll(event.target)
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false, capture: true })
    element.addEventListener('scroll', onScroll, { capture: true })
    return () => {
      element.removeEventListener('wheel', onWheel, { capture: true })
      element.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [viewportRef, viewportStateRef, stopAnimationRef, setViewport])
}
