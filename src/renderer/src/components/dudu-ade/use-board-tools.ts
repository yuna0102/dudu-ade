import { useCallback, useRef, useState } from 'react'
import { keysInsideRect, MIN_DRAWN_AREA, rectFromPoints } from './board-areas'
import {
  categoryFrameRect,
  type BoardCardGeometry,
  type BoardLayout,
  type BoardRect
} from './board-layout-state'
import {
  alignCards,
  areaSelectionKey,
  membershipAfterMove,
  moveSelection,
  selectedAreaIds,
  selectedCardKeys,
  selectionInBox,
  toggleSelection,
  type AlignMode
} from './board-selection'
import { isStationaryClick } from './board-terminal-focus'
import { cardKeyAt } from './board-links'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'
import { swallowNextClick, useBoardToolKeys } from './use-board-tool-keys'

export type BoardTool = 'select' | 'hand' | 'area' | 'link'

/** Figma-like tools: select and move several cards, pan with the hand tool or Space, draw areas, drag links from a card. */
export function useBoardTools(args: {
  board: BoardLayout
  visibleKeys: string[]
  focusedKey: string | null
  toBoardPoint: (clientX: number, clientY: number) => { x: number; y: number }
  onStartLink: (key: string, event: React.PointerEvent) => void
  onActivate: (key: string) => void
  /** Frames as they stand, for box selection and for where a dropped card lands. */
  frameRects: readonly { id: string; rect: BoardRect }[]
  /** Called once before a group move or alignment, so one undo restores it. */
  onBeforeLayoutChange: () => void
}): {
  tool: BoardTool
  setTool: (tool: BoardTool) => void
  selectedKeys: ReadonlySet<string>
  draftRect: BoardRect | null
  selectedAreaId: string | null
  setSelectedAreaId: (id: string | null) => void
  renamingAreaId: string | null
  groupSelection: () => void
  alignSelection: (mode: AlignMode) => void
  removeSelection: () => void
  panning: boolean
  onToolPointerDownCapture: (event: React.PointerEvent) => void
} {
  const {
    board,
    visibleKeys,
    focusedKey,
    toBoardPoint,
    onStartLink,
    onActivate,
    frameRects,
    onBeforeLayoutChange
  } = args
  const spaceHeld = useRef(false)
  const [panHeld, setPanHeld] = useState(false)
  const [tool, setTool] = useState<BoardTool>('select')
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set())
  const [draftRect, setDraftRect] = useState<BoardRect | null>(null)
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null)
  const [renamingAreaId, setRenamingAreaId] = useState<string | null>(null)

  const createArea = useCallback((rect: BoardRect, keys: string[]): void => {
    const store = useDuduAdeStore.getState()
    const id = store.createCategory(DUDU_ADE_COPY.newArea, { x: rect.x, y: rect.y })
    store.updateCategory(id, { rect })
    if (keys.length > 0) {
      store.assignCategory(keys, id)
    }
    setRenamingAreaId(id)
    setSelectedAreaId(id)
  }, [])

  const groupSelection = useCallback((): void => {
    const keys = selectedCardKeys(selectedKeys, board.cards, board.categoryOf)
    if (keys.length > 0) {
      createArea(
        categoryFrameRect(
          { anchor: { x: 0, y: 0 } },
          keys.map((key) => board.cards[key])
        ),
        keys
      )
      setSelectedKeys(new Set())
    }
  }, [selectedKeys, board.cards, board.categoryOf, createArea])

  const moveCards = useCallback(
    (
      base: BoardLayout,
      selection: ReadonlySet<string>,
      dx: number,
      dy: number
    ): Record<string, BoardCardGeometry> => {
      const moved = moveSelection(base, selection, dx, dy)
      useDuduAdeStore.getState().updateBoard((current) => ({
        cards: { ...current.cards, ...moved.cards },
        categories: moved.categories
      }))
      return moved.cards
    },
    []
  )

  const refile = (
    moved: Record<string, BoardCardGeometry>,
    selection: ReadonlySet<string>
  ): void => {
    const changes = membershipAfterMove(moved, frameRects, selection, board.categoryOf)
    for (const [categoryId, keys] of changes) {
      useDuduAdeStore.getState().assignCategory(keys, categoryId)
    }
  }

  const startGroupDrag = (event: React.PointerEvent, activate: (() => void) | null): void => {
    event.stopPropagation()
    event.preventDefault()
    swallowNextClick()
    const origin = { x: event.clientX, y: event.clientY }
    const base = board
    const zoom = base.viewport.zoom
    const selection = selectedKeys
    let moved: Record<string, BoardCardGeometry> | null = null
    const onMove = (move: PointerEvent): void => {
      if (!moved && isStationaryClick(origin, { x: move.clientX, y: move.clientY })) {
        return
      }
      if (!moved) {
        onBeforeLayoutChange()
      }
      moved = moveCards(
        base,
        selection,
        (move.clientX - origin.x) / zoom,
        (move.clientY - origin.y) / zoom
      )
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (moved) {
        refile(moved, selection)
        return
      }
      // No travel: an ordinary click on a selected card, so it goes back to meaning focus.
      setSelectedKeys(new Set())
      activate?.()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const onToolPointerDownCapture = (event: React.PointerEvent): void => {
    const target = event.target
    if (event.button !== 0 || !(target instanceof Element) || target.closest('[data-board-ui]')) {
      return
    }
    const point = toBoardPoint(event.clientX, event.clientY)
    const labelKey = target.closest<HTMLElement>('[data-board-label-key]')?.dataset.boardLabelKey
    const key = labelKey ?? cardKeyAt(point, visibleKeys, board.cards)
    const onEmpty = !target.closest('[data-board-card]')
    if (tool === 'link') {
      if (key) {
        event.stopPropagation()
        onStartLink(key, event)
      }
      return
    }
    if (tool === 'hand' || spaceHeld.current) {
      return
    }
    if (tool === 'select') {
      const additive = event.shiftKey || event.metaKey
      const frameLabel = target
        .closest('[data-board-frame-label]')
        ?.closest('[data-board-frame]')
        ?.getAttribute('data-board-frame')
      const frameKey = frameLabel ? areaSelectionKey(frameLabel) : null
      const hitKey = frameKey ?? key
      if (!onEmpty && hitKey) {
        // A focused terminal keeps its own Shift-click and selection; controls stay controls.
        if (
          target.closest(
            '[data-board-card-focused] [data-board-card-body], button, input, select, textarea, a'
          )
        ) {
          return
        }
        if (additive) {
          event.stopPropagation()
          event.preventDefault()
          swallowNextClick()
          setSelectedKeys(toggleSelection(selectedKeys, hitKey))
          return
        }
        const draggable =
          labelKey ||
          frameKey ||
          target.closest('[data-board-card-header], [data-board-terminal-locked]')
        if (selectedKeys.has(hitKey) && draggable) {
          const activates = key && (labelKey || target.closest('[data-board-terminal-locked]'))
          startGroupDrag(event, activates ? () => onActivate(key) : null)
          return
        }
        setSelectedKeys(new Set())
        return
      }
      if (!onEmpty) {
        return
      }
    }
    // Area tool anywhere, or the select tool on empty board: drag a rectangle.
    event.stopPropagation()
    event.preventDefault()
    const drawing = tool === 'area'
    const additive = event.shiftKey || event.metaKey
    const before = selectedKeys
    const onMove = (move: PointerEvent): void =>
      setDraftRect(rectFromPoints(point, toBoardPoint(move.clientX, move.clientY)))
    const onUp = (up: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setDraftRect(null)
      const rect = rectFromPoints(point, toBoardPoint(up.clientX, up.clientY))
      if (!drawing) {
        const inside = selectionInBox(rect, visibleKeys, board.cards, frameRects)
        setSelectedKeys(new Set(additive ? [...before, ...inside] : inside))
        if (!additive) {
          setSelectedAreaId(null)
        }
        return
      }
      setTool('select')
      if (rect.w >= MIN_DRAWN_AREA && rect.h >= MIN_DRAWN_AREA) {
        createArea(rect, keysInsideRect(rect, visibleKeys, board.cards))
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const alignSelection = (mode: AlignMode): void => {
    const aligned = alignCards(board.cards, [...selectedKeys], mode)
    if (Object.keys(aligned).length > 0) {
      onBeforeLayoutChange()
      useDuduAdeStore.getState().setCards(aligned)
    }
  }

  const removeSelection = useCallback((): void => {
    const store = useDuduAdeStore.getState()
    for (const key of selectedKeys) {
      if (!key.startsWith('area:')) {
        store.removeCard(key)
      }
    }
    for (const id of selectedAreaIds(selectedKeys)) {
      store.deleteCategory(id)
    }
    setSelectedKeys(new Set())
  }, [selectedKeys])

  useBoardToolKeys({
    board,
    focusedKey,
    tool,
    setTool,
    selectedKeys,
    clearSelection: () => setSelectedKeys(new Set()),
    selectedAreaId,
    clearSelectedArea: () => setSelectedAreaId(null),
    groupSelection,
    removeSelection,
    moveCards,
    onBeforeLayoutChange,
    setSpaceHeld: (held) => {
      spaceHeld.current = held
      setPanHeld(held)
    }
  })

  return {
    tool,
    setTool,
    selectedKeys,
    draftRect,
    selectedAreaId,
    setSelectedAreaId,
    renamingAreaId,
    groupSelection,
    alignSelection,
    removeSelection,
    panning: tool === 'hand' || panHeld,
    onToolPointerDownCapture
  }
}
