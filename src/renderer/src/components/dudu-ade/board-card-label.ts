/** At this board zoom the card's own title bar is readable, so the floating label steps aside. */
const LABEL_HIDE_ZOOM = 0.8
const MIN_LABEL_SCREEN_WIDTH = 60

export const CARD_LABEL_HEIGHT = 24
export const CARD_LABEL_GAP = 6

/** Label drawn at real screen size whatever the zoom: scale undoes the board's zoom, and it never outgrows the card on screen. */
export function cardLabelLayout(
  zoom: number,
  cardWidth: number
): { visible: boolean; scale: number; maxWidth: number } {
  return {
    visible: zoom < LABEL_HIDE_ZOOM,
    scale: 1 / zoom,
    maxWidth: Math.max(MIN_LABEL_SCREEN_WIDTH, cardWidth * zoom)
  }
}
