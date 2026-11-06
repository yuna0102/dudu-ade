import { isTerminalCardKey, type BoardLayout } from './board-layout-state'
import { rekeyBoardCard } from './board-links'
import { linkFingerprint, migrateLinkFingerprints } from './board-link-rule'
import { applyRestore, type RestoreSeed } from './board-restore'
import type { BoardTerminal } from './board-terminal-listing'

/** A live terminal or chat card and the window name it goes by; null when it has no stable name. */
export type CardIdentity = {
  key: string
  name: string | null
  /** The name came from the desk's conversation table, so it corrects whatever was recorded before. */
  fromDesk?: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000
/** A card key unnamed and dead this long is forgotten; named ones wait for their window to come back. */
export const DEAD_CARD_TTL_MS = 30 * DAY_MS

/** A title without the status mark an agent puts in front of it ("◑ 헤드" is 헤드). */
export function stripStatusMark(title: string | null | undefined): string | null {
  return title?.replace(/^[^\p{L}\p{N}]+/u, '').trim() || null
}

/**
 * Names cards by window. The conversation is the steadiest: the desk's table says which role it is, and an
 * agent can overwrite a title but not that. Then the pane title, then the tab's own title. A chat also goes by
 * the restore file's conversation table. Marks an agent adds in front of a title are dropped. A window with no
 * name of its own goes by the name it was started with, or by its title when that is a name the saved layout knows;
 * other generated titles change, so they are never used.
 */
export function cardIdentities(
  terminals: readonly BoardTerminal[],
  tabNameOf: (key: string) => string | null,
  chatNames: Readonly<Record<string, string>>,
  providerIds: Readonly<Record<string, string>>,
  deskNames: Readonly<Record<string, string>> = {},
  sessionIdsOf: (terminal: BoardTerminal) => readonly (string | undefined)[] = () => [],
  fallback: {
    startedNameOf?: (terminal: BoardTerminal) => string | undefined
    knownNames?: ReadonlySet<string>
  } = {}
): CardIdentity[] {
  return terminals.map((terminal) => {
    const sessions = terminal.chat ? [providerIds[terminal.key]] : sessionIdsOf(terminal)
    const desk = sessions.flatMap((id) => (id && deskNames[id] ? [deskNames[id]] : []))[0]
    if (desk) {
      return { key: terminal.key, name: desk, fromDesk: true }
    }
    if (terminal.chat) {
      const raw = chatNames[providerIds[terminal.key] ?? ''] ?? tabNameOf(terminal.key)
      return { key: terminal.key, name: raw?.trim() || null }
    }
    const title = stripStatusMark(terminal.title)
    const name =
      stripStatusMark(terminal.paneTitle) ??
      stripStatusMark(tabNameOf(terminal.key)) ??
      stripStatusMark(fallback.startedNameOf?.(terminal)) ??
      (title && fallback.knownNames?.has(title) ? title : null)
    return { key: terminal.key, name }
  })
}

/** Removes every trace of a card key from the board. */
export function dropCard(board: BoardLayout, key: string): BoardLayout {
  const { [key]: _card, ...cards } = board.cards
  const { [key]: _category, ...categoryOf } = board.categoryOf
  const { [key]: _panel, ...assetPanels } = board.assetPanels
  const { [key]: _name, ...names } = board.names ?? {}
  const { [key]: _seen, ...seenAt } = board.seenAt ?? {}
  return {
    ...board,
    cards,
    categoryOf,
    assetPanels,
    hiddenKeys: board.hiddenKeys.filter((hidden) => hidden !== key),
    links: board.links.filter((link) => link.from !== key && link.to !== key),
    ...(board.names ? { names } : {}),
    ...(board.seenAt ? { seenAt } : {})
  }
}

/**
 * A window that came back under a new key takes the place of the old card with the same name: position,
 * size, pin, area, links, asset panel. Only an unambiguous name moves anything: one live window has it,
 * and one old key is the newest to carry it.
 */
export function adoptByName(
  board: BoardLayout,
  live: readonly CardIdentity[],
  now: number
): BoardLayout {
  const liveKeys = new Set(live.map((card) => card.key))
  const liveCount = new Map<string, number>()
  for (const card of live) {
    if (card.name) {
      liveCount.set(card.name, (liveCount.get(card.name) ?? 0) + 1)
    }
  }
  let next = board
  for (const card of live) {
    // A recorded name means the card was here before; only a new key may take an old place.
    // A desk name still may on a card nobody placed: its first recorded name was a title, not its role.
    const recorded = next.names?.[card.key]
    const corrected =
      card.fromDesk === true && recorded !== card.name && !next.cards[card.key]?.placed
    if (!card.name || (recorded !== undefined && !corrected) || liveCount.get(card.name) !== 1) {
      continue
    }
    const names = next.names ?? {}
    const old = Object.keys(names).filter(
      (key) => names[key] === card.name && !liveKeys.has(key) && key in next.cards
    )
    const seen = (key: string): number => next.seenAt?.[key] ?? 0
    const newest = Math.max(...old.map(seen))
    const best = old.filter((key) => seen(key) === newest)
    if (old.length === 0 || best.length !== 1) {
      continue
    }
    if (next.cards[card.key]?.placed) {
      // The user already put this window somewhere; only the old card's links come along.
      const swap = (key: string): string => (key === best[0] ? card.key : key)
      next = {
        ...next,
        links: next.links.map((link) => ({ ...link, from: swap(link.from), to: swap(link.to) }))
      }
      next = dropCard(next, best[0])
    } else {
      next = rekeyBoardCard(next, best[0], card.key)
    }
    for (const stale of old.filter((key) => key !== best[0])) {
      next = dropCard(next, stale)
    }
    next = {
      ...next,
      names: { ...next.names, [card.key]: card.name },
      seenAt: { ...next.seenAt, [card.key]: now }
    }
  }
  return next
}

/** Remembers each placed live card's name, and when it was last seen (refreshed daily to spare storage). */
export function recordIdentities(
  board: BoardLayout,
  live: readonly CardIdentity[],
  now: number
): BoardLayout {
  let names = board.names
  let seenAt = board.seenAt
  let changed = false
  const corrected: { key: string; name: string }[] = []
  for (const card of live) {
    if (!(card.key in board.cards)) {
      continue
    }
    if (card.name && names?.[card.key] !== card.name) {
      // A title the agent wrote must not replace the role name the desk gave; only the desk corrects a name.
      if (names?.[card.key] === undefined || card.fromDesk) {
        if (card.fromDesk && names?.[card.key] !== undefined) {
          corrected.push({ key: card.key, name: card.name })
        }
        names = { ...names, [card.key]: card.name }
        changed = true
      }
    }
    const seen = seenAt?.[card.key]
    if (seen === undefined || now - seen > DAY_MS) {
      seenAt = { ...seenAt, [card.key]: now }
      changed = true
    }
  }
  if (!changed) {
    return board
  }
  // Correcting a role name is not a new partner: a rule already told stays told.
  const links =
    corrected.length > 0
      ? board.links.map((link) =>
          link.appliedFingerprint === linkFingerprint(link, board.names)
            ? { ...link, appliedFingerprint: linkFingerprint(link, names) }
            : link
        )
      : board.links
  return { ...board, links, ...(names ? { names } : {}), ...(seenAt ? { seenAt } : {}) }
}

/**
 * Old terminal and chat cards with no name are forgotten after thirty days dead. The clock starts the
 * first time a card is seen dead. Named cards stay for their window; assets and notes are never touched.
 */
export function pruneDeadCards(
  board: BoardLayout,
  liveKeys: ReadonlySet<string>,
  now: number
): BoardLayout {
  let next = board
  let stamped = board.seenAt
  for (const key of Object.keys(board.cards)) {
    if (!isTerminalCardKey(key) || liveKeys.has(key)) {
      continue
    }
    const seen = stamped?.[key]
    if (seen === undefined) {
      stamped = { ...stamped, [key]: now }
    } else if (board.names?.[key] === undefined && now - seen > DEAD_CARD_TTL_MS) {
      next = dropCard(next, key)
    }
  }
  return stamped === board.seenAt ? next : { ...next, seenAt: { ...stamped, ...next.seenAt } }
}

/** Auto areas a restore or adoption emptied would stay as blank frames; drawn areas (with a rect) stay. */
export function dropEmptiedAreas(before: BoardLayout, after: BoardLayout): BoardLayout {
  const members = (board: BoardLayout, id: string): number =>
    Object.values(board.categoryOf).filter((value) => value === id).length
  const gone = after.categories.filter(
    (category) =>
      !category.rect && members(before, category.id) > 0 && members(after, category.id) === 0
  )
  return gone.length === 0
    ? after
    : {
        ...after,
        categories: after.categories.filter((category) => !gone.includes(category))
      }
}

/**
 * One pass over the board: windows take back their old places, the restore file fills what is left, names and
 * sightings are recorded, and old unnamed cards are dropped. Returns null when nothing changed, so it can run on every update.
 */
export function reconcileIdentity(
  board: BoardLayout,
  live: readonly CardIdentity[],
  seed: RestoreSeed | null,
  now: number
): BoardLayout | null {
  let next = adoptByName(board, live, now)
  const restored = seed ? applyRestore(next, seed, live) : null
  next = restored ?? next
  next = recordIdentities(next, live, now)
  next = pruneDeadCards(next, new Set(live.map((card) => card.key)), now)
  const links = migrateLinkFingerprints(next.links, next.names)
  next = links === next.links ? next : { ...next, links: [...links] }
  next = dropEmptiedAreas(board, next)
  return next === board ? null : next
}
