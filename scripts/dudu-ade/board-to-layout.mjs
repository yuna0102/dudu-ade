#!/usr/bin/env node
// Turns a board copied out of the app (board-v2.json) into the layout file the app opens with (version 2).
//
//   node scripts/dudu-ade/board-to-layout.mjs --board <board-v2.json> --desk <desk.json> \
//     --live "Operation,앱 기획,UX" --rename "기존이름=새이름" --out <board-layout.json>
//
// --live     windows that exist now; every other card is dead and stays out
// --rename   a name recorded from a title, corrected to the role (repeatable)
// --roles-dir  optional folder name holding one subfolder per role, so a card can be matched by its folder
// --out      replaced after the old file is kept as board-layout-MMDD-HHMM.json beside it
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export function parseArgs(argv) {
  const args = { rename: {}, live: [] }
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]]
    if (flag === '--rename') {
      const [from, to] = value.split('=')
      args.rename[from] = to
    } else if (flag === '--live') {
      args.live = value
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    } else {
      args[flag.replace(/^--/, '')] = value
    }
  }
  return args
}

const isTerminalKey = (key) => !key.startsWith('note:') && !key.startsWith('asset:')
// Only when --roles-dir names the folder that holds one subfolder per role (a card's key ends in .../<folder>/<role>::...).
const roleFolder = (key, rolesDir) =>
  rolesDir
    ? new RegExp(`/${rolesDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/:]+)::`).exec(key)?.[1]
    : undefined

/** The one card for each live window: a recorded name first, then the role folder the card runs in. */
export function resolveCards(board, live, rename, rolesDir) {
  const hidden = new Set(board.hiddenKeys)
  const seen = (key) => board.seenAt?.[key] ?? 0
  const keyOf = {}
  for (const name of live) {
    const keys = Object.keys(board.cards).filter((key) => isTerminalKey(key) && !hidden.has(key))
    const named = keys.filter((key) => {
      const recorded = board.names?.[key]
      return recorded !== undefined && (rename[recorded] ?? recorded) === name
    })
    const byFolder = keys.filter((key) => roleFolder(key, rolesDir) === name && !board.names?.[key])
    const linked = byFolder.filter((key) =>
      board.links.some((link) => link.from === key || link.to === key)
    )
    const options = named.length > 0 ? named : linked.length > 0 ? linked : byFolder
    if (options.length > 0) {
      keyOf[name] = [...options].sort((a, b) => seen(b) - seen(a))[0]
    }
  }
  return keyOf
}

/** A saved fingerprint means the windows were told this rule, if it still matches. Either format counts. */
function wasApplied(link) {
  if (!link.appliedFingerprint) {
    return false
  }
  try {
    const saved = JSON.parse(link.appliedFingerprint)
    return saved[2] === (link.rule?.trim() ?? '') && saved[3] === (link.twoWay === true)
  } catch {
    return false
  }
}

export function windowsFromDesk(desk, live) {
  return desk.panes.map((pane) => {
    const tab = (desk.tabs ?? []).find((entry) => entry.rows.flat().includes(pane.name))
    return {
      name: pane.name,
      surface: pane.surface === 'chat' ? 'chat' : 'terminal',
      sessionId: pane.session ?? null,
      tabTitle: tab?.title ?? null,
      neighbors: tab ? tab.rows.flat().filter((name) => name !== pane.name) : [],
      cwd: pane.cwd ?? null,
      open: live.includes(pane.name)
    }
  })
}

export function boardToLayout({ workspaces, desk, live, rename, source, rolesDir }) {
  const board = workspaces.boards.find((entry) => entry.id === workspaces.activeId)
  const keyOf = resolveCards(board, live, rename, rolesDir)
  const nameOf = new Map(Object.entries(keyOf).map(([name, key]) => [key, name]))
  const plain = ({ placed: _placed, ...geometry }) => geometry
  const category = (key) => board.categories.find((entry) => entry.id === board.categoryOf[key])
  const endOf = (key) =>
    isTerminalKey(key) ? nameOf.get(key) : key in board.cards ? key : undefined
  const noteKeys = Object.keys(board.notes).filter((key) => key in board.cards)
  const assetKeys = Object.keys(board.cards).filter((key) => key.startsWith('asset:'))
  const windows = windowsFromDesk(desk, live)
  return {
    version: 2,
    source,
    boardName: board.name,
    ...(board.autoPush === undefined ? {} : { autoPush: board.autoPush }),
    viewport: board.viewport,
    chatSessions: Object.fromEntries(
      windows
        .filter((entry) => entry.surface === 'chat' && entry.sessionId)
        .map((entry) => [entry.sessionId, entry.name])
    ),
    aliases: { '서브 프로젝트': ['개인 일상 에이전트 설정'], Code_review: ['Code review'] },
    windows,
    cards: Object.entries(keyOf).map(([name, key]) => ({
      name,
      geometry: plain(board.cards[key]),
      area: category(key)?.name ?? null,
      ...(category(key) ? { areaId: category(key).id } : {})
    })),
    links: board.links.flatMap((link) => {
      const from = endOf(link.from)
      const to = endOf(link.to)
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
              ...(wasApplied(link) ? { applied: true } : {})
            }
          ]
        : []
    }),
    areas: board.categories.map((entry) => ({
      id: entry.id,
      name: entry.name,
      color: entry.color,
      rect: entry.rect ?? null,
      anchor: entry.anchor,
      ...(entry.collapsed ? { collapsed: true } : {}),
      members: Object.entries(keyOf)
        .filter(([, key]) => board.categoryOf[key] === entry.id)
        .map(([name]) => name)
    })),
    notes: Object.fromEntries(noteKeys.map((key) => [key, board.notes[key]])),
    noteCards: Object.fromEntries(noteKeys.map((key) => [key, plain(board.cards[key])])),
    assetCards: Object.fromEntries(assetKeys.map((key) => [key, plain(board.cards[key])])),
    assetPanels: Object.fromEntries(
      Object.entries(keyOf).flatMap(([name, key]) => {
        const panel = board.assetPanels?.[key]
        return panel && (panel.collapsed || panel.categories?.length)
          ? [
              [
                name,
                { ...(panel.collapsed ? { collapsed: true } : {}), categories: panel.categories }
              ]
            ]
          : []
      })
    )
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const workspaces = JSON.parse(await readFile(args.board, 'utf8'))
  const desk = JSON.parse(await readFile(args.desk, 'utf8'))
  const now = new Date()
  const layout = boardToLayout({
    workspaces,
    desk,
    live: args.live,
    rename: args.rename,
    rolesDir: args['roles-dir'],
    source: `board-layout ${args.source ?? now.toISOString()}`
  })
  const missing = args.live.filter((name) => !layout.cards.some((card) => card.name === name))
  const two = (value) => String(value).padStart(2, '0')
  if (existsSync(args.out)) {
    const stamp = `${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}`
    await copyFile(args.out, join(dirname(args.out), `board-layout-${stamp}.json`))
  }
  await writeFile(args.out, `${JSON.stringify(layout, null, 2)}\n`)
  console.log('name | area | x | y | w | h | flags')
  for (const card of layout.cards) {
    const { x, y, w, h, fitPty, pinned, collapsed } = card.geometry
    const flags = [fitPty && 'fitPty', pinned && 'pinned', collapsed && 'collapsed'].filter(Boolean)
    console.log(
      [
        card.name,
        card.area ?? '-',
        Math.round(x),
        Math.round(y),
        Math.round(w),
        Math.round(h),
        flags.join(' ')
      ].join(' | ')
    )
  }
  console.log(
    `links ${layout.links.length}, areas ${layout.areas.length}, notes ${Object.keys(layout.notes).length}, windows ${layout.windows.length}`
  )
  for (const link of layout.links) {
    console.log(
      `  ${link.from} -> ${link.to} | ${link.label ?? '-'} | ${link.rule ? 'rule' : '-'} | ${link.twoWay ? 'both' : 'one'} | ${link.trigger ?? '-'} | ${link.applied ? 'applied' : '-'}`
    )
  }
  if (missing.length > 0) {
    console.log(`NOT FOUND: ${missing.join(', ')}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
