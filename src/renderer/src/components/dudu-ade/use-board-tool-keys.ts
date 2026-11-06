import { useCallback, useEffect, useRef } from 'react'
import type { BoardCardGeometry, BoardLayout } from './board-layout-state'
import { useDuduAdeStore } from './dudu-ade-store'
import type { BoardTool } from './use-board-tools'

const ARROW_RUN_MS = 600
const ARROWS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }
}

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('input, textarea, select, [contenteditable]') !== null

/** The click closing a gesture this hook handled must not also reach the card under it. */
export function swallowNextClick(): void {
  const swallow = (event: MouseEvent): void => {
    event.stopPropagation()
    window.removeEventListener('click', swallow, true)
  }
  window.addEventListener('click', swallow, true)
  // A drag that ends off any element raises no click; do not eat the next real one.
  window.addEventListener('pointerdown', () => window.removeEventListener('click', swallow, true), {
    capture: true,
    once: true
  })
}

/** Board shortcuts: tools, Space to pan, arrows to nudge, Delete and Esc. A focused terminal owns the keyboard instead. */
export function useBoardToolKeys(args: {
  board: BoardLayout
  focusedKey: string | null
  tool: BoardTool
  setTool: (tool: BoardTool) => void
  selectedKeys: ReadonlySet<string>
  clearSelection: () => void
  selectedAreaId: string | null
  clearSelectedArea: () => void
  groupSelection: () => void
  removeSelection: () => void
  moveCards: (
    base: BoardLayout,
    selection: ReadonlySet<string>,
    dx: number,
    dy: number
  ) => Record<string, BoardCardGeometry>
  onBeforeLayoutChange: () => void
  setSpaceHeld: (held: boolean) => void
}): void {
  const {
    board,
    focusedKey,
    tool,
    setTool,
    selectedKeys,
    selectedAreaId,
    groupSelection,
    removeSelection,
    moveCards,
    onBeforeLayoutChange
  } = args
  const clearSelectionRef = useRef(args.clearSelection)
  clearSelectionRef.current = args.clearSelection
  const clearAreaRef = useRef(args.clearSelectedArea)
  clearAreaRef.current = args.clearSelectedArea
  const setSpaceHeldRef = useRef(args.setSpaceHeld)
  setSpaceHeldRef.current = args.setSpaceHeld

  const lastArrowAt = useRef(0)
  const nudge = useCallback(
    (dx: number, dy: number): void => {
      // A run of presses is one change for undo.
      if (performance.now() - lastArrowAt.current > ARROW_RUN_MS) {
        onBeforeLayoutChange()
      }
      lastArrowAt.current = performance.now()
      moveCards(board, selectedKeys, dx, dy)
    },
    [board, selectedKeys, moveCards, onBeforeLayoutChange]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // A focused terminal owns the keyboard, so plain letters must reach it.
      if (focusedKey || isTyping(event.target)) {
        return
      }
      const key = event.key.toLowerCase()
      if (event.code === 'Space') {
        event.preventDefault()
        setSpaceHeldRef.current(true)
        return
      }
      if (event.metaKey && event.altKey && event.code === 'KeyG') {
        event.preventDefault()
        groupSelection()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }
      if (key === 's') {
        setTool('area')
      } else if (key === 'v') {
        setTool('select')
      } else if (key === 'h') {
        setTool('hand')
      } else if (key === 'l') {
        setTool('link')
      } else if (key === 'escape' && (tool !== 'select' || selectedKeys.size > 0)) {
        event.stopPropagation()
        setTool('select')
        clearSelectionRef.current()
      } else if (selectedKeys.size > 0 && ARROWS[event.key]) {
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        nudge(ARROWS[event.key].x * step, ARROWS[event.key].y * step)
      } else if ((key === 'delete' || key === 'backspace') && selectedKeys.size > 0) {
        removeSelection()
      } else if ((key === 'delete' || key === 'backspace') && selectedAreaId) {
        useDuduAdeStore.getState().deleteCategory(selectedAreaId)
        clearAreaRef.current()
      }
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') {
        setSpaceHeldRef.current(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [
    focusedKey,
    tool,
    selectedKeys,
    selectedAreaId,
    groupSelection,
    nudge,
    removeSelection,
    setTool
  ])
}
