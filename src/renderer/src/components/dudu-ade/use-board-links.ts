import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cardHeight,
  newBoardId,
  type BoardLayout,
  type BoardRect,
  type BoardViewport
} from './board-layout-state'
import { cardKeyAt } from './board-links'
import { useDuduAdeStore } from './dudu-ade-store'

type DraftLink = { from: string; point: { x: number; y: number } }

/** Drawing, selecting and deleting card links; endpoints follow cards and collapsed categories. */
export function useBoardLinks({
  board,
  liveKeys,
  collapsedKeys,
  frames,
  viewportRef,
  viewportStateRef,
  updateBoard
}: {
  board: BoardLayout
  liveKeys: string[]
  collapsedKeys: ReadonlySet<string>
  frames: readonly { keys: readonly string[]; rect: BoardRect }[]
  viewportRef: React.RefObject<HTMLDivElement | null>
  viewportStateRef: React.RefObject<BoardViewport>
  updateBoard: (update: (board: BoardLayout) => Partial<BoardLayout>) => void
}): {
  rectFor: (key: string) => BoardRect | null
  onStartLink: (from: string, event: React.PointerEvent) => void
  deleteLink: (id: string) => void
  selectedLinkId: string | null
  setSelectedLinkId: (id: string | null) => void
  draftLink: DraftLink | null
} {
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null)
  const [draftLink, setDraftLink] = useState<DraftLink | null>(null)
  // shortcut: links snap to a card's new place on release (the drag draft is local to the card), lift the draft if live tracking matters.
  const rectFor = (key: string): BoardRect | null => {
    const card = board.cards[key]
    if (card && liveKeys.includes(key) && !collapsedKeys.has(key)) {
      return { x: card.x, y: card.y, w: card.w, h: cardHeight(card) }
    }
    // A card inside a collapsed category points at its frame.
    return frames.find((frame) => frame.keys.includes(key))?.rect ?? null
  }

  const linkContextRef = useRef({ board, liveKeys, collapsedKeys })
  linkContextRef.current = { board, liveKeys, collapsedKeys }
  const onStartLink = useCallback(
    (from: string, event: React.PointerEvent): void => {
      if (event.button !== 0) {
        return
      }
      event.preventDefault()
      const point = (move: { clientX: number; clientY: number }): { x: number; y: number } => {
        const rect = viewportRef.current?.getBoundingClientRect()
        const current = viewportStateRef.current
        return {
          x: (move.clientX - (rect?.left ?? 0) - current.x) / current.zoom,
          y: (move.clientY - (rect?.top ?? 0) - current.y) / current.zoom
        }
      }
      setDraftLink({ from, point: point(event) })
      const onMove = (move: PointerEvent): void => setDraftLink({ from, point: point(move) })
      const onUp = (up: PointerEvent): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        setDraftLink(null)
        const { board: current, liveKeys: keys, collapsedKeys: collapsed } = linkContextRef.current
        const to = cardKeyAt(
          point(up),
          keys.filter((key) => !collapsed.has(key)),
          current.cards
        )
        if (
          !to ||
          to === from ||
          current.links.some((link) => link.from === from && link.to === to)
        ) {
          return
        }
        const id = newBoardId()
        useDuduAdeStore.getState().updateBoard((latest) => ({
          links: [...latest.links, { id, from, to }]
        }))
        setSelectedLinkId(id)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [viewportRef, viewportStateRef]
  )

  const deleteLink = (id: string): void => {
    updateBoard((current) => ({
      links: current.links.filter((link) => link.id !== id)
    }))
    setSelectedLinkId(null)
  }

  useEffect(() => {
    if (!selectedLinkId) {
      return
    }
    const onKey = (event: KeyboardEvent): void => {
      const typing =
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, [contenteditable]')
      if (event.key === 'Escape') {
        setSelectedLinkId(null)
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && !typing) {
        deleteLink(selectedLinkId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return {
    rectFor,
    onStartLink,
    deleteLink,
    selectedLinkId,
    setSelectedLinkId,
    draftLink
  }
}
