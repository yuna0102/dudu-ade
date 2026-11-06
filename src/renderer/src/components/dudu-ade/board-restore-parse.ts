import {
  CATEGORY_COLORS,
  type BoardCardGeometry,
  type BoardNote,
  type BoardNoteKind,
  type BoardRect,
  type BoardViewport
} from './board-layout-state'

export type SeedCard = {
  name: string
  geometry: BoardCardGeometry
  area: string | null
  /** Version 2: two areas can share a name, so the id decides when it is there. */
  areaId?: string
}
export type SeedLink = {
  /** A window name, or the key of a note or asset card. */
  from: string
  to: string
  label: string | null
  rule?: string
  twoWay?: boolean
  trigger?: 'manual' | 'on-finish'
  /** The windows were told this rule; their conversations remember it, so it is not sent again. */
  applied?: boolean
}
export type SeedArea = {
  id?: string
  name: string
  color: string
  rect: BoardRect | null
  anchor?: { x: number; y: number }
  collapsed?: boolean
}
export type SeedPanel = {
  collapsed?: boolean
  categories: { id: string; name: string; collapsed?: boolean; assetIds: string[] }[]
}
/** One window as the desk needs to reopen it. */
export type SeedWindow = {
  name: string
  surface: 'terminal' | 'chat'
  sessionId: string | null
  tabTitle: string | null
  neighbors: string[]
  cwd: string | null
  open: boolean
}

/** A layout file: windows by name, not by the keys that no longer exist. Version 1 has only the older fields. */
export type RestoreSeed = {
  source: string
  boardName?: string
  autoPush?: boolean
  viewport: BoardViewport | null
  chatSessions: Record<string, string>
  aliases: Record<string, string[]>
  cards: SeedCard[]
  links: SeedLink[]
  areas: SeedArea[]
  notes: Record<string, BoardNote>
  noteCards: Record<string, BoardCardGeometry>
  assetCards: Record<string, BoardCardGeometry>
  assetPanels: Record<string, SeedPanel>
  windows: SeedWindow[]
}

const NOTE_KINDS: readonly string[] = [
  'sticky',
  'text',
  'checklist',
  'kanban',
  'web',
  'git',
  'artifact',
  'markdown'
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

function rectOf(value: unknown): BoardRect | null {
  return isRecord(value) && finite(value.x) && finite(value.y) && finite(value.w) && finite(value.h)
    ? { x: value.x, y: value.y, w: value.w, h: value.h }
    : null
}

function geometryOf(value: unknown): BoardCardGeometry | null {
  const rect = rectOf(value)
  if (!rect || !isRecord(value)) {
    return null
  }
  return {
    ...rect,
    ...(value.collapsed === true ? { collapsed: true } : {}),
    ...(value.fitPty === true ? { fitPty: true } : {}),
    ...(value.pinned === true ? { pinned: true } : {})
  }
}

/** Reads the restore file, keeping every entry that is well formed and skipping the rest; null when it is not a restore file. */
export function parseRestoreSeed(text: string): RestoreSeed | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (
    !isRecord(raw) ||
    (raw.version !== 1 && raw.version !== 2) ||
    typeof raw.source !== 'string'
  ) {
    return null
  }
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
  const viewport =
    isRecord(raw.viewport) &&
    finite(raw.viewport.x) &&
    finite(raw.viewport.y) &&
    finite(raw.viewport.zoom)
      ? { x: raw.viewport.x, y: raw.viewport.y, zoom: raw.viewport.zoom }
      : null
  const strings = (value: unknown): Record<string, string> =>
    Object.fromEntries(
      Object.entries(isRecord(value) ? value : {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  const notes: Record<string, BoardNote> = {}
  const noteCards: Record<string, BoardCardGeometry> = {}
  for (const [key, note] of Object.entries(isRecord(raw.notes) ? raw.notes : {})) {
    const geometry = isRecord(raw.noteCards) ? geometryOf(raw.noteCards[key]) : null
    if (
      key.startsWith('note:') &&
      isRecord(note) &&
      NOTE_KINDS.includes(String(note.kind)) &&
      geometry
    ) {
      notes[key] = {
        ...note,
        kind: note.kind as BoardNoteKind,
        items: Array.isArray(note.items) ? note.items : []
      } as BoardNote
      noteCards[key] = geometry
    }
  }
  const areaOf = (card: Record<string, unknown>): { area: string | null; areaId?: string } => ({
    area: typeof card.area === 'string' ? card.area : null,
    ...(typeof card.areaId === 'string' ? { areaId: card.areaId } : {})
  })
  const assetCards: Record<string, BoardCardGeometry> = {}
  for (const [key, value] of Object.entries(isRecord(raw.assetCards) ? raw.assetCards : {})) {
    const geometry = geometryOf(value)
    if (key.startsWith('asset:') && geometry) {
      assetCards[key] = geometry
    }
  }
  const assetPanels: Record<string, SeedPanel> = {}
  for (const [name, panel] of Object.entries(isRecord(raw.assetPanels) ? raw.assetPanels : {})) {
    if (isRecord(panel)) {
      assetPanels[name] = {
        ...(panel.collapsed === true ? { collapsed: true } : {}),
        categories: list(panel.categories).flatMap((category) =>
          isRecord(category) && typeof category.name === 'string'
            ? [
                {
                  id: typeof category.id === 'string' ? category.id : category.name,
                  name: category.name,
                  ...(category.collapsed === true ? { collapsed: true } : {}),
                  assetIds: list(category.assetIds).filter(
                    (id): id is string => typeof id === 'string'
                  )
                }
              ]
            : []
        )
      }
    }
  }
  return {
    source: raw.source,
    ...(typeof raw.boardName === 'string' ? { boardName: raw.boardName } : {}),
    ...(typeof raw.autoPush === 'boolean' ? { autoPush: raw.autoPush } : {}),
    assetCards,
    assetPanels,
    windows: list(raw.windows).flatMap((entry) =>
      isRecord(entry) && typeof entry.name === 'string'
        ? [
            {
              name: entry.name,
              surface: entry.surface === 'chat' ? ('chat' as const) : ('terminal' as const),
              sessionId: typeof entry.sessionId === 'string' ? entry.sessionId : null,
              tabTitle: typeof entry.tabTitle === 'string' ? entry.tabTitle : null,
              neighbors: list(entry.neighbors).filter(
                (item): item is string => typeof item === 'string'
              ),
              cwd: typeof entry.cwd === 'string' ? entry.cwd : null,
              open: entry.open !== false
            }
          ]
        : []
    ),
    viewport,
    chatSessions: strings(raw.chatSessions),
    aliases: Object.fromEntries(
      Object.entries(isRecord(raw.aliases) ? raw.aliases : {}).map(([name, list]) => [
        name,
        Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : []
      ])
    ),
    cards: list(raw.cards).flatMap((card) => {
      const geometry = isRecord(card) ? geometryOf(card.geometry) : null
      return isRecord(card) && typeof card.name === 'string' && geometry
        ? [{ name: card.name, geometry, ...areaOf(card) }]
        : []
    }),
    links: list(raw.links).flatMap((link) =>
      isRecord(link) && typeof link.from === 'string' && typeof link.to === 'string'
        ? [
            {
              from: link.from,
              to: link.to,
              label: typeof link.label === 'string' ? link.label : null,
              ...(typeof link.rule === 'string' ? { rule: link.rule } : {}),
              ...(typeof link.twoWay === 'boolean' ? { twoWay: link.twoWay } : {}),
              ...(link.trigger === 'on-finish' || link.trigger === 'manual'
                ? { trigger: link.trigger }
                : {}),
              ...(link.applied === true ? { applied: true } : {})
            }
          ]
        : []
    ),
    areas: list(raw.areas).flatMap((area) => {
      if (!isRecord(area) || typeof area.name !== 'string') {
        return []
      }
      const rect = rectOf(area.rect)
      // Version 1 only names areas with a rect; version 2 has areas that size to their cards.
      if (!rect && raw.version === 1) {
        return []
      }
      const anchor =
        isRecord(area.anchor) && finite(area.anchor.x) && finite(area.anchor.y)
          ? { x: area.anchor.x, y: area.anchor.y }
          : undefined
      return [
        {
          ...(typeof area.id === 'string' ? { id: area.id } : {}),
          name: area.name,
          color: typeof area.color === 'string' ? area.color : CATEGORY_COLORS[0],
          rect,
          ...(anchor ? { anchor } : {}),
          ...(area.collapsed === true ? { collapsed: true } : {})
        }
      ]
    }),
    notes,
    noteCards
  }
}
