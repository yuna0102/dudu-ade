import {
  CATEGORY_COLORS,
  FRAME_LABEL,
  FRAME_PAD,
  GROUP_GAP,
  TERMINAL_CARD_SIZE,
  arrangeGroups,
  boundsOf,
  categoryFrameRect,
  findFreeSlot,
  isTerminalCardKey,
  newBoardId,
  type ArrangeGroup,
  type BoardCardGeometry,
  type BoardCategory,
  type BoardLayout,
  type LayoutPreset
} from './board-layout-state'

/** A running terminal; `categoryName` is null until its tab is known, which defers classification. */
export type SyncTerminal = { key: string; categoryName: string | null }

/** Card keys that should be drawn: running, not hidden terminals and every asset or note card. */
export function liveCardKeys(board: BoardLayout, terminalKeys: ReadonlySet<string>): string[] {
  const hidden = new Set(board.hiddenKeys)
  return Object.keys(board.cards).filter((key) =>
    isTerminalCardKey(key) ? terminalKeys.has(key) && !hidden.has(key) : true
  )
}

/** Category groups in display order, unclassified cards last. */
export function groupCardKeys(board: BoardLayout, keys: readonly string[]): ArrangeGroup[] {
  const known = new Set(board.categories.map((category) => category.id))
  const groups: ArrangeGroup[] = board.categories.map((category) => ({
    id: category.id,
    keys: keys.filter((key) => board.categoryOf[key] === category.id)
  }))
  const loose = keys.filter((key) => {
    const id = board.categoryOf[key]
    return !id || !known.has(id)
  })
  if (loose.length > 0) {
    groups.push({ id: null, keys: loose })
  }
  return groups
}

/** Applies a preset to every live card, keeping cards inside their category blocks. */
export function arrangeBoard(
  board: BoardLayout,
  keys: readonly string[],
  preset: LayoutPreset
): Pick<BoardLayout, 'cards' | 'categories'> {
  const { cards, anchors } = arrangeGroups(groupCardKeys(board, keys), board.cards, preset)
  return {
    cards: { ...board.cards, ...cards },
    categories: board.categories.map((category) =>
      anchors[category.id] ? { ...category, anchor: anchors[category.id] } : category
    )
  }
}

/**
 * Auto-classifies new terminals by name (tab name, else workspace name) and gives new terminals a slot
 * next to their category. The user's own moves and category edits are never overwritten.
 */
export function syncBoardTerminals(
  board: BoardLayout,
  terminals: readonly SyncTerminal[]
): Partial<BoardLayout> | null {
  let changed = false
  const categories: BoardCategory[] = [...board.categories]
  const categoryOf = { ...board.categoryOf }
  for (const terminal of terminals) {
    if (terminal.categoryName === null || terminal.key in categoryOf) {
      continue
    }
    // A renamed area still takes the windows it was made for.
    let category =
      categories.find((entry) => entry.name === terminal.categoryName) ??
      categories.find((entry) => entry.autoName === terminal.categoryName)
    if (!category) {
      category = {
        id: newBoardId(),
        name: terminal.categoryName,
        color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length],
        anchor: { x: 0, y: 0 }
      }
      categories.push(category)
    }
    categoryOf[terminal.key] = category.id
    changed = true
  }

  const hidden = new Set(board.hiddenKeys)
  const terminalKeys = new Set(terminals.map((terminal) => terminal.key))
  let next: BoardLayout = { ...board, categories, categoryOf }
  const allReady =
    terminals.length > 0 && terminals.every((terminal) => terminal.categoryName !== null)

  if (board.arrangePending && board.autoAddTerminals && allReady) {
    const cards = { ...next.cards }
    for (const terminal of terminals) {
      if (!cards[terminal.key]) {
        cards[terminal.key] = { x: 0, y: 0, ...TERMINAL_CARD_SIZE }
      }
    }
    next = { ...next, cards }
    return {
      ...arrangeBoard(next, liveCardKeys(next, terminalKeys), 'grid'),
      categoryOf,
      arrangePending: false
    }
  }

  if (board.autoAddTerminals && !board.arrangePending) {
    const cards = { ...next.cards }
    const live = (): BoardCardGeometry[] =>
      liveCardKeys({ ...next, cards }, terminalKeys).map((key) => cards[key])
    for (const terminal of terminals) {
      if (terminal.categoryName === null || cards[terminal.key] || hidden.has(terminal.key)) {
        continue
      }
      const categoryId = categoryOf[terminal.key]
      const category = categories.find((entry) => entry.id === categoryId)
      const members = liveCardKeys({ ...next, cards }, terminalKeys)
        .filter((key) => categoryId && categoryOf[key] === categoryId)
        .map((key) => cards[key])
      const occupied = live()
      let origin: { x: number; y: number }
      if (members.length > 0 && category) {
        const frame = categoryFrameRect(category, members)
        origin = { x: frame.x + FRAME_PAD, y: frame.y + FRAME_PAD + FRAME_LABEL }
      } else {
        // A category's first card opens a new column to the right of everything.
        const bounds = boundsOf(occupied)
        const frameOrigin = {
          x: bounds ? bounds.x + bounds.w + GROUP_GAP : 0,
          y: bounds ? bounds.y : 0
        }
        origin = { x: frameOrigin.x + FRAME_PAD, y: frameOrigin.y + FRAME_PAD + FRAME_LABEL }
        if (category) {
          const index = categories.indexOf(category)
          categories[index] = { ...category, anchor: frameOrigin }
        }
      }
      cards[terminal.key] = findFreeSlot(
        occupied,
        TERMINAL_CARD_SIZE,
        members.length > 0 ? 3 : 1,
        origin
      )
      changed = true
    }
    next = { ...next, cards }
  }

  return changed ? { categories, categoryOf, cards: next.cards } : null
}

/**
 * Gives every running terminal that has no card a place, whatever its name state and whether the board was
 * waiting to arrange: the card sits in its tab's area, else its workspace's. `includeHidden` also brings back
 * windows the user hid, for an explicit request; the automatic pass leaves those alone.
 */
export function addMissingCards(
  board: BoardLayout,
  terminals: readonly SyncTerminal[],
  includeHidden: boolean
): Partial<BoardLayout> | null {
  const keys = new Set(terminals.map((terminal) => terminal.key))
  const hiddenKeys = includeHidden
    ? board.hiddenKeys.filter((key) => !keys.has(key))
    : board.hiddenKeys
  const unhidden = hiddenKeys.length === board.hiddenKeys.length ? {} : { hiddenKeys }
  const placed = syncBoardTerminals(
    { ...board, hiddenKeys, autoAddTerminals: true, arrangePending: false },
    terminals
  )
  return placed || unhidden.hiddenKeys ? { ...unhidden, ...placed } : null
}
