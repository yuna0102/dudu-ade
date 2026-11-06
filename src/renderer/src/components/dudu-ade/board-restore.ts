/* eslint-disable max-lines -- Why: one pass applies a whole layout; its steps share the same working copies. */
import {
  CATEGORY_COLORS,
  FRAME_LABEL,
  FRAME_PAD,
  isTerminalCardKey,
  newBoardId,
  type BoardCardGeometry,
  type BoardCategory,
  type BoardLayout,
  type BoardLink
} from './board-layout-state'
import type { CardIdentity } from './board-identity'
import { linkFingerprint } from './board-link-rule'

export { parseRestoreSeed } from './board-restore-parse'
export type {
  RestoreSeed,
  SeedArea,
  SeedCard,
  SeedLink,
  SeedPanel,
  SeedWindow
} from './board-restore-parse'
import type { RestoreSeed } from './board-restore-parse'

/**
 * Which live card each seed name means. An exact name wins; an alias is tried only for a seed name nothing
 * matched exactly, and never takes a card another seed name already has. A name two live cards share is skipped.
 */
export function matchSeedCards(
  seed: Pick<RestoreSeed, 'cards' | 'aliases'>,
  live: readonly CardIdentity[]
): Map<string, string> {
  const byName = new Map<string, string[]>()
  for (const card of live) {
    if (card.name) {
      byName.set(card.name, [...(byName.get(card.name) ?? []), card.key])
    }
  }
  const matched = new Map<string, string>()
  const taken = new Set<string>()
  for (const { name } of seed.cards) {
    const keys = byName.get(name)
    if (keys?.length === 1) {
      matched.set(name, keys[0])
      taken.add(keys[0])
    }
  }
  for (const { name } of seed.cards) {
    if (matched.has(name) || byName.has(name)) {
      continue
    }
    const options = (seed.aliases[name] ?? []).flatMap((alias) => {
      const keys = byName.get(alias) ?? []
      return keys.length === 1 && !taken.has(keys[0]) ? keys : []
    })
    if (options.length === 1) {
      matched.set(name, options[0])
      taken.add(options[0])
    }
  }
  return matched
}

/**
 * Areas the seed does not know, with no card left in them, are dropped: the old automatic areas that
 * pointed at windows now sitting in the seed's areas. A drawn area (with a rect) and one holding a live card stay.
 */
function withoutBlankAreas(
  seed: RestoreSeed,
  categories: readonly BoardCategory[],
  categoryOf: Record<string, string | null>,
  cards: Record<string, BoardCardGeometry>,
  live: readonly CardIdentity[]
): BoardCategory[] {
  const liveKeys = new Set(live.map((card) => card.key))
  const known = new Set([
    ...seed.areas.flatMap((area) => [area.name, ...(area.id ? [area.id] : [])]),
    ...seed.cards.flatMap((card) => (card.area ? [card.area] : []))
  ])
  const occupied = new Set(
    Object.entries(categoryOf).flatMap(([key, id]) =>
      id && key in cards && (!isTerminalCardKey(key) || liveKeys.has(key)) ? [id] : []
    )
  )
  return categories.filter(
    (category) =>
      category.rect ||
      known.has(category.name) ||
      known.has(category.id) ||
      occupied.has(category.id)
  )
}

/**
 * Applies the seed to windows that exist now, each card, link and the areas, notes and view once only.
 * Progress is kept on the board, so windows that open later are placed when they appear and nothing
 * the user has moved since is put back. A card the user already placed is left alone.
 */
export function applyRestore(
  board: BoardLayout,
  seed: RestoreSeed,
  live: readonly CardIdentity[],
  /** The user asked for this layout: it applies again whatever was done before, and also to cards they placed. */
  options: { force?: boolean } = {}
): BoardLayout | null {
  const force = options.force === true
  const same = !force && board.restoredFrom === seed.source
  const progress = same ? (board.restoredProgress ?? {}) : {}
  const doneCards = new Set(progress.cards ?? [])
  const doneLinks = new Set(progress.links ?? [])
  const matches = matchSeedCards(seed, live)
  const categories: BoardCategory[] = [...board.categories]
  const categoryOf = { ...board.categoryOf }
  const cards = { ...board.cards }
  const notes = { ...board.notes }
  const links = [...board.links]
  let viewport = board.viewport
  let hiddenKeys = board.hiddenKeys
  const assetPanels = { ...board.assetPanels }
  let changed = !same

  const area = (name: string, near: BoardCardGeometry, areaId?: string): string => {
    const found =
      (areaId ? categories.find((category) => category.id === areaId) : undefined) ??
      categories.find((category) => category.name === name)
    if (found) {
      return found.id
    }
    const id = areaId ?? newBoardId()
    categories.push({
      id,
      name,
      color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length],
      anchor: { x: near.x - FRAME_PAD, y: near.y - FRAME_PAD - FRAME_LABEL }
    })
    return id
  }

  if (!progress.areas) {
    const claimed = new Set(seed.areas.flatMap((area) => (area.id ? [area.id] : [])))
    for (const seeded of seed.areas) {
      // By id first: two areas may share a name. An id from another board simply finds nothing here.
      const byId = seeded.id ? categories.findIndex((category) => category.id === seeded.id) : -1
      // A name only finds an area no other seed area has taken, so two of the same name stay two.
      const index =
        byId !== -1
          ? byId
          : categories.findIndex(
              (category) => category.name === seeded.name && !claimed.has(category.id)
            )
      const rect = seeded.rect ? { rect: seeded.rect } : {}
      const autoName = seeded.autoName ? { autoName: seeded.autoName } : {}
      const collapsed = seeded.collapsed === undefined ? {} : { collapsed: seeded.collapsed }
      if (index === -1) {
        categories.push({
          id: seeded.id ?? newBoardId(),
          name: seeded.name,
          color: seeded.color,
          ...autoName,
          anchor: seeded.anchor ?? { x: seeded.rect?.x ?? 0, y: seeded.rect?.y ?? 0 },
          ...rect,
          ...collapsed
        })
      } else {
        claimed.add(categories[index].id)
        categories[index] = {
          ...categories[index],
          name: seeded.name,
          color: seeded.color,
          ...autoName,
          ...rect,
          ...collapsed
        }
      }
    }
    progress.areas = true
    changed = true
  }
  for (const card of seed.cards) {
    const key = matches.get(card.name)
    if (!key || doneCards.has(card.name)) {
      continue
    }
    doneCards.add(card.name)
    changed = true
    if (cards[key]?.placed && !force) {
      continue
    }
    cards[key] = { ...card.geometry }
    categoryOf[key] = card.area === null ? null : area(card.area, card.geometry, card.areaId)
    if (force) {
      hiddenKeys = hiddenKeys.filter((hidden) => hidden !== key)
    }
    const panel = seed.assetPanels[card.name]
    if (panel && (force || !assetPanels[key]?.categories.length)) {
      assetPanels[key] = {
        ...assetPanels[key],
        ...(panel.collapsed === undefined ? {} : { collapsed: panel.collapsed }),
        categories: panel.categories
      }
    }
  }
  // A note or asset card is linked by its own key; everything else by window name.
  const keyOf = (end: string): string | undefined =>
    end.startsWith('note:') || end.startsWith('asset:')
      ? end in cards || end in seed.noteCards || end in seed.assetCards
        ? end
        : undefined
      : matches.get(end)
  const namesNow = Object.fromEntries(
    live.flatMap((card) => (card.name ? [[card.key, card.name]] : []))
  )
  for (const link of seed.links) {
    const id = `${link.from}>${link.to}`
    const from = keyOf(link.from)
    const to = keyOf(link.to)
    if ((doneLinks.has(id) && !force) || !from || !to || from === to) {
      continue
    }
    doneLinks.add(id)
    changed = true
    const rule = {
      ...(link.label ? { label: link.label } : {}),
      ...(link.rule ? { rule: link.rule } : {}),
      ...(link.twoWay ? { twoWay: true } : {}),
      ...(link.trigger ? { trigger: link.trigger } : {})
    }
    const told = (entry: BoardLink): BoardLink =>
      link.applied ? { ...entry, appliedFingerprint: linkFingerprint(entry, namesNow) } : entry
    const index = links.findIndex((existing) => existing.from === from && existing.to === to)
    if (index === -1) {
      links.push(told({ id: newBoardId(), from, to, ...rule }))
    } else if (force || (link.rule && !links[index].rule)) {
      links[index] = told({ ...links[index], ...rule })
    }
  }
  if (!progress.notes) {
    for (const [key, note] of Object.entries(seed.notes)) {
      if ((!(key in notes) && !(key in cards)) || force) {
        notes[key] = note
        cards[key] = seed.noteCards[key]
      } else if (key in cards && !cards[key].placed) {
        cards[key] = seed.noteCards[key]
      }
    }
    for (const [key, geometry] of Object.entries(seed.assetCards)) {
      if (!(key in cards) || force || !cards[key].placed) {
        cards[key] = geometry
      }
    }
    progress.notes = true
    changed = true
  }
  if (!progress.viewport) {
    if (seed.viewport) {
      viewport = seed.viewport
    }
    progress.viewport = true
    changed = true
  }
  const kept = changed ? withoutBlankAreas(seed, categories, categoryOf, cards, live) : categories
  return changed
    ? {
        ...board,
        categories: kept,
        categoryOf,
        cards,
        notes,
        links,
        viewport,
        hiddenKeys,
        assetPanels,
        ...(seed.autoPush === undefined ? {} : { autoPush: seed.autoPush }),
        ...(seed.boardName ? { name: seed.boardName } : {}),
        // A first-open grid pass must not lay out over places that were just restored.
        ...(doneCards.size > 0 ? { arrangePending: false } : {}),
        restoredFrom: seed.source,
        restoredProgress: { ...progress, cards: [...doneCards], links: [...doneLinks] }
      }
    : null
}
