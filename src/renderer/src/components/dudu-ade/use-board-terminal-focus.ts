import { useCallback, useEffect, useRef, useState } from 'react'
import { dispatchZoomLevelChanged } from '@/lib/zoom-events'
import { useAppStore } from '@/store'
import type { BoardRect, BoardViewport } from './board-layout-state'
import {
  DEFAULT_TERMINAL_FONT,
  focusViewportFor,
  interpolateViewport,
  nextTerminalFontSize
} from './board-terminal-focus'
import { isBoardChatKey } from './board-links'

const FOCUS_ANIMATION_MS = 250

/**
 * One card body at a time takes keyboard, paste and wheel; every other body stays locked and the board
 * owns its wheel. Clicking a locked body focuses it and, when zoomed out, brings it to the center.
 */
export function useBoardTerminalFocus(args: {
  rectFor: (key: string) => BoardRect | null
  screen: { width: number; height: number }
  viewportStateRef: React.RefObject<BoardViewport>
  setPanViewport: (viewport: BoardViewport | null) => void
  setViewport: (viewport: BoardViewport) => void
}): {
  focusedKey: string | null
  activateCard: (key: string) => void
  onBoardPointerDownCapture: (event: React.PointerEvent) => void
  stopFocusAnimation: () => void
} {
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const latest = useRef(args)
  latest.current = args
  const frame = useRef<number | null>(null)

  const stopFocusAnimation = useCallback((): void => {
    if (frame.current === null) {
      return
    }
    cancelAnimationFrame(frame.current)
    frame.current = null
    const { setPanViewport, setViewport, viewportStateRef } = latest.current
    setViewport(viewportStateRef.current)
    setPanViewport(null)
  }, [])

  const activateCard = useCallback(
    (key: string): void => {
      setFocusedKey(key)
      const { rectFor, screen, viewportStateRef, setPanViewport, setViewport } = latest.current
      const rect = rectFor(key)
      const from = viewportStateRef.current
      const to = rect ? focusViewportFor(rect, from, screen) : null
      if (!to) {
        return
      }
      stopFocusAnimation()
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        setViewport(to)
        return
      }
      const startedAt = performance.now()
      const step = (now: number): void => {
        const progress = (now - startedAt) / FOCUS_ANIMATION_MS
        if (progress >= 1) {
          frame.current = null
          setViewport(to)
          setPanViewport(null)
          return
        }
        setPanViewport(interpolateViewport(from, to, progress))
        frame.current = requestAnimationFrame(step)
      }
      frame.current = requestAnimationFrame(step)
    },
    [stopFocusAnimation]
  )

  useEffect(() => stopFocusAnimation, [stopFocusAnimation])

  useEffect(() => {
    if (!focusedKey) {
      return
    }
    // Plain Esc must reach the terminal (it interrupts Claude); Shift+Esc or an outside click leaves the card.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        setFocusedKey(null)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [focusedKey])

  // The menu sends Cmd+= / Cmd+- / Cmd+0 here; with no focused terminal card the app's own zoom applies.
  useEffect(() => {
    if (!focusedKey || isBoardChatKey(focusedKey)) {
      return
    }
    return window.api.ui.onTerminalZoom((direction) => {
      const store = useAppStore.getState()
      const current = store.settings?.terminalFontSize ?? DEFAULT_TERMINAL_FONT
      const next = nextTerminalFontSize(current, direction)
      if (next !== current) {
        void store.updateSettings({ terminalFontSize: next })
      }
      dispatchZoomLevelChanged('terminal', Math.round((next / DEFAULT_TERMINAL_FONT) * 100))
    })
  }, [focusedKey])

  const onBoardPointerDownCapture = useCallback((event: React.PointerEvent): void => {
    // A menu opened from the focused chat is portaled out of the board, yet its press still bubbles here.
    if (
      event.target instanceof Element &&
      event.currentTarget.contains(event.target) &&
      !event.target.closest('[data-board-card-focused]')
    ) {
      setFocusedKey(null)
    }
  }, [])

  return { focusedKey, activateCard, onBoardPointerDownCapture, stopFocusAnimation }
}
