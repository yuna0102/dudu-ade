import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { panelAssets, panelSpace } from './board-asset-panels'
import {
  CARD_LABEL_RESERVE,
  cardFootprint,
  grownKeys,
  overlappingPairs,
  pushApartInAreas,
  tidyLayout
} from './board-auto-layout'
import type { BoardCardGeometry, BoardCategory, BoardLayout, BoardRect } from './board-layout-state'
import { useDuduAdeStore } from './dudu-ade-store'
import type { CollectedAsset } from './dudu-ade-store-types'

const PUSH_ANIMATION_MS = 300

/** Keeps cards from newly overlapping as they or their asset panels grow, and tidies the board on request. */
export function useBoardAutoLayout(args: {
  board: BoardLayout
  liveKeys: string[]
  collapsedKeys: ReadonlySet<string>
  terminalKeySet: ReadonlySet<string>
  assets: readonly CollectedAsset[]
}): {
  animating: boolean
  footprints: Record<string, BoardRect>
  tidy: () => void
  canUndoTidy: boolean
  undoTidy: () => void
  /** Keeps the current layout for one undo. */
  rememberLayout: () => void
} {
  const { board, liveKeys, collapsedKeys, terminalKeySet, assets } = args
  const [animating, setAnimating] = useState(false)
  const [undo, setUndo] = useState<{
    cards: Record<string, BoardCardGeometry>
    categories: BoardCategory[]
    categoryOf: Record<string, string | null>
  } | null>(null)
  const boardRef = useRef(board)
  boardRef.current = board
  const rememberLayout = useCallback((): void => {
    const { cards, categories, categoryOf } = boardRef.current
    setUndo({ cards, categories, categoryOf })
  }, [])

  const spaces = useMemo(() => {
    const result: Record<string, number> = {}
    for (const key of liveKeys) {
      if (terminalKeySet.has(key)) {
        const panel = board.assetPanels[key]
        result[key] = panelSpace(panel, panelAssets(assets, key, panel, board.cards).length)
      }
    }
    return result
  }, [liveKeys, terminalKeySet, board.assetPanels, board.cards, assets])

  const footprints = useMemo(() => {
    const result: Record<string, BoardRect> = {}
    for (const key of liveKeys) {
      if (!collapsedKeys.has(key) && board.cards[key]) {
        result[key] = cardFootprint(board.cards[key], spaces[key] ?? 0)
      }
    }
    return result
  }, [liveKeys, collapsedKeys, board.cards, spaces])

  const last = useRef<{ boardId: string; rects: Record<string, BoardRect> } | null>(null)
  useEffect(() => {
    const previous = last.current
    last.current = { boardId: board.id, rects: footprints }
    if (!previous || previous.boardId !== board.id || board.autoPush === false) {
      return
    }
    const grown = grownKeys(previous.rects, footprints)
    if (grown.length === 0) {
      return
    }
    const { moved, areaMoves } = pushApartInAreas({
      rects: footprints,
      previous: previous.rects,
      start: grown,
      pinned: new Set(Object.keys(footprints).filter((key) => board.cards[key]?.pinned)),
      ignored: overlappingPairs(previous.rects),
      areas: board.categories,
      areaOf: (key) => board.categoryOf[key]
    })
    const keys = Object.keys(moved)
    if (keys.length === 0 && Object.keys(areaMoves).length === 0) {
      return
    }
    const cards: Record<string, BoardCardGeometry> = Object.fromEntries(
      keys.map((key) => [
        key,
        {
          ...board.cards[key],
          x: moved[key].x + (spaces[key] ?? 0),
          y: moved[key].y + CARD_LABEL_RESERVE
        }
      ])
    )
    // Cards of a collapsed area have no footprint but travel with it.
    for (const [key, id] of Object.entries(board.categoryOf)) {
      const step = id ? areaMoves[id] : undefined
      const card = board.cards[key]
      if (step && card && !footprints[key]) {
        cards[key] = { ...card, x: card.x + step.x, y: card.y + step.y }
      }
    }
    useDuduAdeStore.getState().updateBoard((current) => ({
      cards: { ...current.cards, ...cards },
      categories: current.categories.map((category) => {
        const step = areaMoves[category.id]
        return step
          ? {
              ...category,
              anchor: { x: category.anchor.x + step.x, y: category.anchor.y + step.y },
              ...(category.rect
                ? {
                    rect: {
                      ...category.rect,
                      x: category.rect.x + step.x,
                      y: category.rect.y + step.y
                    }
                  }
                : {})
            }
          : category
      })
    }))
    setAnimating(true)
    const timer = setTimeout(() => setAnimating(false), PUSH_ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [
    footprints,
    board.id,
    board.autoPush,
    board.cards,
    board.categories,
    board.categoryOf,
    spaces
  ])

  const tidy = useCallback((): void => {
    const keys = Object.keys(footprints)
    const positions = tidyLayout({
      keys,
      cards: board.cards,
      links: board.links,
      groupOf: (key) => board.categoryOf[key] ?? null,
      leftSpace: (key) => spaces[key] ?? 0
    })
    rememberLayout()
    const moved = Object.fromEntries(
      Object.entries(positions).map(([key, at]) => [key, { ...board.cards[key], ...at }])
    )
    // Filled areas re-wrap their cards; an empty drawn area stays where it is.
    const filled = new Set(keys.map((key) => board.categoryOf[key]))
    useDuduAdeStore.getState().updateBoard(() => ({
      cards: { ...board.cards, ...moved },
      categories: board.categories.map((category) =>
        filled.has(category.id) ? { ...category, rect: undefined } : category
      )
    }))
    setAnimating(true)
    setTimeout(() => setAnimating(false), PUSH_ANIMATION_MS)
  }, [
    footprints,
    board.cards,
    board.links,
    board.categoryOf,
    board.categories,
    spaces,
    rememberLayout
  ])

  const undoTidy = useCallback((): void => {
    if (undo) {
      useDuduAdeStore.getState().updateBoard(() => undo)
      setUndo(null)
    }
  }, [undo])

  useEffect(() => {
    if (!undo) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      const editing =
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable]')
      if (event.metaKey && !event.shiftKey && event.key.toLowerCase() === 'z' && !editing) {
        event.preventDefault()
        undoTidy()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, undoTidy])

  return { animating, footprints, tidy, canUndoTidy: undo !== null, undoTidy, rememberLayout }
}
