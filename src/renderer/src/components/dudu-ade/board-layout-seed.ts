import type { CardIdentity } from './board-identity'
import { isLinkApplied } from './board-link-rule'
import type { BoardCardGeometry, BoardLayout, BoardNote } from './board-layout-state'
import { assetCardKey, isTerminalCardKey } from './board-layout-state'
import type { RestoreSeed, SeedWindow } from './board-restore-parse'
import type { BoardTerminal } from './board-terminal-listing'

export const LAYOUT_VERSION = 2

type Geometry = BoardCardGeometry

/** Each named window as the desk needs it: where it runs and which windows share its tab. */
export function buildWindows(
  terminals: readonly BoardTerminal[],
  live: readonly CardIdentity[],
  args: {
    tabTitleOf: (key: string) => string | null
    sessionIdOf: (terminal: BoardTerminal) => string | null
  }
): SeedWindow[] {
  const nameOf = new Map(live.map((card) => [card.key, card.name]))
  const named = terminals.filter((terminal) => nameOf.get(terminal.key))
  return named.map((terminal) => ({
    name: nameOf.get(terminal.key)!,
    surface: terminal.chat ? 'chat' : 'terminal',
    sessionId: args.sessionIdOf(terminal),
    tabTitle: args.tabTitleOf(terminal.key),
    neighbors: terminal.chat
      ? []
      : named
          .filter((other) => other.tabId === terminal.tabId && other.key !== terminal.key)
          .map((other) => nameOf.get(other.key)!),
    cwd: terminal.worktreePath || null,
    open: true
  }))
}

/**
 * The whole board as a layout file, by window name. A name two live windows share cannot be told apart
 * later, so those cards are left out. Hidden cards are out too: the user took them off this board.
 */
export function buildLayoutSeed(
  board: BoardLayout,
  live: readonly CardIdentity[],
  providerIds: Readonly<Record<string, string>>,
  now: Date,
  windows: readonly SeedWindow[] = []
): Record<string, unknown> {
  const count = new Map<string, number>()
  for (const card of live) {
    if (card.name) {
      count.set(card.name, (count.get(card.name) ?? 0) + 1)
    }
  }
  const hidden = new Set(board.hiddenKeys)
  const named = live.filter(
    (card): card is { key: string; name: string } =>
      card.name !== null &&
      count.get(card.name) === 1 &&
      card.key in board.cards &&
      !hidden.has(card.key)
  )
  const nameOf = new Map(named.map((card) => [card.key, card.name]))
  const category = (key: string) =>
    board.categories.find((entry) => entry.id === board.categoryOf[key])
  const plain = ({ placed: _placed, ...geometry }: Geometry): Geometry => geometry
  const noteKeys = Object.keys(board.notes).filter((key) => key in board.cards)
  const assetKeys = Object.keys(board.cards).filter((key) => key.startsWith(assetCardKey('')))
  const endName = (key: string): string | undefined =>
    isTerminalCardKey(key) ? nameOf.get(key) : key in board.cards ? key : undefined
  return {
    version: LAYOUT_VERSION,
    source: `board-layout ${now.toISOString()}`,
    boardName: board.name,
    ...(board.autoPush === undefined ? {} : { autoPush: board.autoPush }),
    viewport: board.viewport,
    chatSessions: Object.fromEntries(
      named.flatMap((card) => (providerIds[card.key] ? [[providerIds[card.key], card.name]] : []))
    ),
    aliases: {},
    windows,
    cards: named
      .filter((card) => isTerminalCardKey(card.key))
      .map((card) => ({
        name: card.name,
        geometry: plain(board.cards[card.key]),
        area: category(card.key)?.name ?? null,
        ...(category(card.key) ? { areaId: category(card.key)!.id } : {})
      })),
    links: board.links.flatMap((link) => {
      const from = endName(link.from)
      const to = endName(link.to)
      return from && to
        ? [
            {
              from,
              to,
              label: link.label ?? null,
              ...(link.rule ? { rule: link.rule } : {}),
              ...(link.twoWay ? { twoWay: true } : {}),
              direction: link.twoWay ? 'both' : 'one',
              ...(link.trigger ? { trigger: link.trigger } : {}),
              ...(isLinkApplied(link, board.names) ? { applied: true } : {})
            }
          ]
        : []
    }),
    areas: board.categories.map((entry) => ({
      id: entry.id,
      name: entry.name,
      color: entry.color,
      ...(entry.autoName ? { autoName: entry.autoName } : {}),
      rect: entry.rect ?? null,
      anchor: entry.anchor,
      ...(entry.collapsed ? { collapsed: true } : {}),
      members: named
        .filter((card) => board.categoryOf[card.key] === entry.id)
        .map((card) => card.name)
    })),
    notes: Object.fromEntries(noteKeys.map((key): [string, BoardNote] => [key, board.notes[key]])),
    noteCards: Object.fromEntries(noteKeys.map((key) => [key, plain(board.cards[key])])),
    assetCards: Object.fromEntries(assetKeys.map((key) => [key, plain(board.cards[key])])),
    assetMeta: board.assetMeta ?? {},
    assetPanels: Object.fromEntries(
      named.flatMap((card) => {
        const panel = board.assetPanels[card.key]
        return panel &&
          (panel.collapsed ||
            panel.categories.length > 0 ||
            panel.extra?.length ||
            panel.hidden?.length)
          ? [
              [
                card.name,
                {
                  ...(panel.collapsed ? { collapsed: true } : {}),
                  ...(panel.extra?.length ? { extra: panel.extra } : {}),
                  ...(panel.hidden?.length ? { hidden: panel.hidden } : {}),
                  categories: panel.categories
                }
              ]
            ]
          : []
      })
    )
  }
}

type Layout = ReturnType<typeof buildLayoutSeed>

/**
 * Windows that are not open now keep their saved place: while the desk comes up one window at a time, or a
 * window is simply off, saving must not forget them. Windows that are open are always taken from the board.
 */
export function mergeWithPrevious(
  built: Layout,
  previous: RestoreSeed | null,
  liveNames: ReadonlySet<string>
): Layout {
  if (!previous) {
    return built
  }
  const areas = built.areas as { id: string; name: string; members: string[] }[]
  const off = (name: string): boolean =>
    !name.startsWith('note:') && !name.startsWith('asset:') && !liveNames.has(name)
  const keptCards = previous.cards
    .filter((card) => off(card.name))
    .map((card) => {
      // By id first: two areas can share a name.
      const area =
        areas.find((entry) => entry.id === card.areaId) ??
        areas.find((entry) => entry.name === card.area)
      area?.members.push(card.name)
      return { ...card, area: area?.name ?? null, ...(area ? { areaId: area.id } : {}) }
    })
    .map(({ areaId, ...card }) => (areaId ? { ...card, areaId } : card))
  const builtWindows = built.windows as SeedWindow[]
  return {
    ...built,
    chatSessions: { ...previous.chatSessions, ...(built.chatSessions as Record<string, string>) },
    aliases: previous.aliases,
    cards: [...(built.cards as unknown[]), ...keptCards],
    links: [
      ...(built.links as unknown[]),
      ...previous.links.filter((link) => off(link.from) || off(link.to))
    ],
    assetPanels: {
      ...Object.fromEntries(Object.entries(previous.assetPanels).filter(([name]) => off(name))),
      ...(built.assetPanels as object)
    },
    windows: [
      ...builtWindows,
      ...previous.windows
        .filter((entry) => !builtWindows.some((window) => window.name === entry.name))
        .map((entry) => ({ ...entry, open: false }))
    ]
  }
}

/** What decides whether a save is needed: everything but the time stamp. */
export function layoutContent(text: string): string {
  const { source: _source, ...content } = JSON.parse(text) as Record<string, unknown>
  return JSON.stringify(content)
}
