import { describe, expect, it } from 'vitest'
import {
  DEAD_CARD_TTL_MS,
  adoptByName,
  cardIdentities,
  pruneDeadCards,
  reconcileIdentity,
  recordIdentities,
  type CardIdentity
} from './board-identity'
import { emptyBoardLayout, type BoardLayout } from './board-layout-state'
import { applyRestore, matchSeedCards, parseRestoreSeed, type RestoreSeed } from './board-restore'
import type { BoardTerminal } from './board-terminal-listing'

const geo = (x: number, y = 0, extra = {}) => ({ x, y, w: 640, h: 400, ...extra })
const DAY = 24 * 60 * 60 * 1000
const NOW = 100 * DAY

function board(patch: Partial<BoardLayout> = {}): BoardLayout {
  return { ...emptyBoardLayout(), arrangePending: false, ...patch }
}
const live = (...pairs: [string, string | null][]): CardIdentity[] =>
  pairs.map(([key, name]) => ({ key, name }))

describe('taking back a place by name', () => {
  const old = board({
    cards: { oldQA: geo(900, 50, { fitPty: true, pinned: true, placed: true }), other: geo(0) },
    categoryOf: { oldQA: 'area' },
    links: [{ id: 'l', from: 'oldDev', to: 'oldQA' }],
    assetPanels: { oldQA: { collapsed: true, categories: [] } },
    hiddenKeys: ['oldQA'],
    names: { oldQA: 'QA', other: 'Other' },
    seenAt: { oldQA: 5, other: 5 }
  })

  it('moves everything of the dead card to the new key and forgets the old key', () => {
    const next = adoptByName(old, live(['newQA', 'QA'], ['other', 'Other']), NOW)
    expect(next.cards.newQA).toEqual(geo(900, 50, { fitPty: true, pinned: true, placed: true }))
    expect(next.cards.oldQA).toBeUndefined()
    expect(next.categoryOf).toEqual({ newQA: 'area' })
    expect(next.links[0].to).toBe('newQA')
    expect(next.assetPanels.newQA.collapsed).toBe(true)
    expect(next.assetPanels.newQA.sources).toContain('oldQA')
    expect(next.hiddenKeys).toEqual(['newQA'])
    expect(next.names).toEqual({ newQA: 'QA', other: 'Other' })
  })

  it('replaces the spot an automatic layout just gave the new window', () => {
    const auto = { ...old, cards: { ...old.cards, newQA: geo(-5000, -5000) } }
    expect(adoptByName(auto, live(['newQA', 'QA']), NOW).cards.newQA.x).toBe(900)
  })

  it('leaves a card that already has its own recorded place', () => {
    const settled = {
      ...old,
      cards: { ...old.cards, here: geo(1) },
      names: { ...old.names, here: 'QA' }
    }
    expect(adoptByName(settled, live(['here', 'QA']), NOW)).toBe(settled)
  })

  it('does nothing when two live windows share the name', () => {
    expect(adoptByName(old, live(['a', 'QA'], ['b', 'QA']), NOW)).toBe(old)
  })

  it('does nothing when the newest old key is a tie', () => {
    const tie = board({
      cards: { x: geo(1), y: geo(2) },
      names: { x: 'QA', y: 'QA' },
      seenAt: { x: 7, y: 7 }
    })
    expect(adoptByName(tie, live(['n', 'QA']), NOW)).toBe(tie)
  })

  it('takes the most recently seen old key and drops the older duplicates', () => {
    const two = board({
      cards: { older: geo(1), newer: geo(2) },
      names: { older: 'QA', newer: 'QA' },
      seenAt: { older: 5, newer: 9 }
    })
    const next = adoptByName(two, live(['n', 'QA']), NOW)
    expect(next.cards).toEqual({ n: geo(2) })
  })

  it('ignores windows with no name', () => {
    expect(adoptByName(old, live(['n', null]), NOW)).toBe(old)
  })

  it('handles windows that appear one at a time', () => {
    const first = adoptByName(old, live(['newQA', 'QA']), NOW)
    expect(first.cards.newQA.x).toBe(900)
    const both = {
      ...first,
      cards: { ...first.cards, late: geo(-1) },
      names: { ...first.names, oldDev: 'Dev' }
    }
    const withOld = { ...both, cards: { ...both.cards, oldDev: geo(300) } }
    const second = adoptByName(withOld, live(['newQA', 'QA'], ['lateDev', 'Dev']), NOW)
    expect(second.cards.lateDev.x).toBe(300)
    expect(second.cards.newQA.x).toBe(900)
  })
})

describe('names and sightings', () => {
  it('records names of placed cards only, and refreshes a sighting at most daily', () => {
    const start = board({ cards: { a: geo(0) } })
    const once = recordIdentities(start, live(['a', 'IG'], ['unplaced', 'X']), NOW)
    expect(once.names).toEqual({ a: 'IG' })
    expect(once.seenAt).toEqual({ a: NOW })
    expect(recordIdentities(once, live(['a', 'IG']), NOW + 1000)).toBe(once)
    expect(recordIdentities(once, live(['a', 'IG']), NOW + 2 * DAY).seenAt?.a).toBe(NOW + 2 * DAY)
  })

  it('names a terminal by pane title, a chat by its conversation, never by a generated title', () => {
    const terminal = (key: string, paneTitle: string | null) =>
      ({ key, paneTitle, title: 'zsh' }) as BoardTerminal
    const chat = {
      key: 'c',
      paneTitle: null,
      title: 'Claude Chat',
      chat: { sessionId: 's' }
    } as BoardTerminal
    const names = cardIdentities(
      [terminal('t1', ' IG '), terminal('t2', null), chat],
      (key) => (key === 't2' ? '탭 이름' : null),
      { conv: 'Business' },
      { c: 'conv' }
    )
    expect(names.map((card) => card.name)).toEqual(['IG', '탭 이름', 'Business'])
    expect(cardIdentities([chat], () => null, {}, {})[0].name).toBeNull()
  })
})

describe('forgetting old cards', () => {
  const dead = board({
    cards: {
      oldUnnamed: geo(1),
      oldNamed: geo(2),
      fresh: geo(3),
      'asset:x': geo(4),
      'note:y': geo(5)
    },
    names: { oldNamed: 'QA' },
    seenAt: { oldUnnamed: NOW - DEAD_CARD_TTL_MS - 1, oldNamed: NOW - 90 * DAY, fresh: NOW - DAY },
    links: [{ id: 'l', from: 'oldUnnamed', to: 'oldNamed' }]
  })

  it('drops an unnamed dead card after thirty days, with its links', () => {
    const next = pruneDeadCards(dead, new Set(), NOW)
    expect(Object.keys(next.cards).sort()).toEqual(['asset:x', 'fresh', 'note:y', 'oldNamed'])
    expect(next.links).toEqual([])
  })

  it('keeps live cards, named cards, assets and notes however old', () => {
    const next = pruneDeadCards(dead, new Set(['oldUnnamed']), NOW)
    expect(next.cards.oldUnnamed).toBeDefined()
    expect(next.cards.oldNamed).toBeDefined()
  })

  it('starts the clock for a dead card seen for the first time', () => {
    const start = board({ cards: { ghost: geo(1) } })
    const next = pruneDeadCards(start, new Set(), NOW)
    expect(next.cards.ghost).toBeDefined()
    expect(next.seenAt).toEqual({ ghost: NOW })
    expect(pruneDeadCards(next, new Set(), NOW + 29 * DAY).cards.ghost).toBeDefined()
    expect(pruneDeadCards(next, new Set(), NOW + 31 * DAY).cards.ghost).toBeUndefined()
  })
})

const seed: RestoreSeed = {
  source: 'backup-1',
  viewport: { zoom: 1.5, x: 10, y: 20 },
  chatSessions: { 'conv-ig': 'IG' },
  aliases: { 서브: ['개인 설정'], 'Code review': ['Code_review'] },
  cards: [
    { name: 'IG', geometry: geo(-100), area: '데스크' },
    { name: 'UX', geometry: geo(500, 0, { collapsed: true }), area: null },
    { name: 'APP_dev', geometry: geo(1200), area: '제품' },
    { name: '서브', geometry: geo(2000), area: '서브' },
    { name: 'Code_review', geometry: geo(3000), area: null },
    { name: 'Code review', geometry: geo(4000), area: null }
  ],
  links: [{ from: 'UX', to: 'APP_dev', label: '코드 검수' }],
  areas: [{ name: '제품', color: '#6E48E5', rect: { x: 0, y: 0, w: 2000, h: 1000 } }],
  assetCards: {},
  assetPanels: {},
  windows: [],
  notes: { 'note:n1': { kind: 'sticky', items: [] } },
  noteCards: { 'note:n1': { x: 1, y: 2, w: 280, h: 240 } }
}

describe('one-time restore file', () => {
  it('places named windows, makes areas and links, and records progress', () => {
    const start = board({ cards: { ig: geo(9), ux: geo(9), dev: geo(9) } })
    const next = applyRestore(start, seed, live(['ig', 'IG'], ['ux', 'UX'], ['dev', 'APP_dev']))!
    expect(next.cards.ig.x).toBe(-100)
    expect(next.cards.ux).toEqual(geo(500, 0, { collapsed: true }))
    const area = (name: string) => next.categories.find((category) => category.name === name)!
    expect(next.categoryOf.dev).toBe(area('제품').id)
    expect(next.categoryOf.ux).toBeNull()
    expect(area('제품').rect).toEqual({ x: 0, y: 0, w: 2000, h: 1000 })
    expect(next.links).toHaveLength(1)
    expect(next.links[0]).toMatchObject({ from: 'ux', to: 'dev', label: '코드 검수' })
    expect(next.notes['note:n1']).toBeDefined()
    expect(next.cards['note:n1']).toEqual({ x: 1, y: 2, w: 280, h: 240 })
    expect(next.viewport).toEqual({ zoom: 1.5, x: 10, y: 20 })
    expect(next.restoredFrom).toBe('backup-1')
  })

  it('applies only once: the same live windows give no second change', () => {
    const windows = live(['ig', 'IG'], ['ux', 'UX'], ['dev', 'APP_dev'])
    const first = applyRestore(board(), seed, windows)!
    expect(applyRestore(first, seed, windows)).toBeNull()
  })

  it('does not put a card back after the user moved it', () => {
    const windows = live(['ig', 'IG'])
    const first = applyRestore(board(), seed, windows)!
    const moved = { ...first, cards: { ...first.cards, ig: geo(7777, 0, { placed: true }) } }
    expect(applyRestore(moved, seed, windows)).toBeNull()
    expect(moved.cards.ig.x).toBe(7777)
  })

  it('leaves a card the user already placed, and counts it done', () => {
    const start = board({ cards: { ig: geo(42, 0, { placed: true }) } })
    const next = applyRestore(start, seed, live(['ig', 'IG']))!
    expect(next.cards.ig.x).toBe(42)
    expect(applyRestore(next, seed, live(['ig', 'IG']))).toBeNull()
  })

  it('places windows that open later, one at a time, without redoing earlier ones', () => {
    const first = applyRestore(board(), seed, live(['ig', 'IG']))!
    expect(first.cards.dev).toBeUndefined()
    const second = applyRestore(first, seed, live(['ig', 'IG'], ['dev', 'APP_dev']))!
    expect(second.cards.dev.x).toBe(1200)
    expect(second.viewport).toEqual(first.viewport)
  })

  it('makes a link only when both ends are live windows, and never twice', () => {
    const one = applyRestore(board(), seed, live(['ux', 'UX']))!
    expect(one.links).toEqual([])
    const both = applyRestore(one, seed, live(['ux', 'UX'], ['dev', 'APP_dev']))!
    expect(both.links).toHaveLength(1)
    const already = board({ links: [{ id: 'x', from: 'ux', to: 'dev' }] })
    expect(applyRestore(already, seed, live(['ux', 'UX'], ['dev', 'APP_dev']))!.links).toHaveLength(
      1
    )
  })

  it('matches an exact name before an alias, and skips a shared name', () => {
    const windows = live(['a', '개인 설정'], ['b', 'Code_review'])
    const matches = matchSeedCards(seed, windows)
    expect(matches.get('서브')).toBe('a')
    expect(matches.get('Code_review')).toBe('b')
    expect(matches.has('Code review')).toBe(false)
    expect(matchSeedCards(seed, live(['x', 'IG'], ['y', 'IG'])).has('IG')).toBe(false)
  })

  it('moves a chat in by the conversation it continues', () => {
    const chats = cardIdentities(
      [
        {
          key: 'chat',
          paneTitle: null,
          title: 'Claude Chat',
          chat: { sessionId: 's' }
        } as BoardTerminal
      ],
      () => null,
      seed.chatSessions,
      { chat: 'conv-ig' }
    )
    expect(applyRestore(board(), seed, chats)!.cards.chat.x).toBe(-100)
  })

  it('removes an automatic area the restore emptied, and keeps drawn ones', () => {
    const start = board({
      categories: [
        { id: 'auto', name: 'loopit_agent', color: '#000', anchor: { x: 0, y: 0 } },
        {
          id: 'drawn',
          name: 'mine',
          color: '#000',
          anchor: { x: 0, y: 0 },
          rect: { x: 0, y: 0, w: 9, h: 9 }
        }
      ],
      cards: { ig: geo(9) },
      categoryOf: { ig: 'auto' }
    })
    const next = reconcileIdentity(start, live(['ig', 'IG']), seed, NOW)!
    expect(next.categories.map((category) => category.id)).toContain('drawn')
    expect(next.categories.map((category) => category.id)).not.toContain('auto')
  })

  it('settles: running again changes nothing', () => {
    const windows = live(['ig', 'IG'], ['ux', 'UX'])
    const once = reconcileIdentity(board(), windows, seed, NOW)!
    expect(reconcileIdentity(once, windows, seed, NOW)).toBeNull()
  })
})

describe('reading the restore file', () => {
  const text = JSON.stringify({
    version: 1,
    source: 'backup-1',
    viewport: { zoom: 1, x: 2, y: 3 },
    chatSessions: { a: 'IG', b: 7 },
    aliases: { x: ['y', 5] },
    cards: [
      { name: 'IG', geometry: { x: 1, y: 2, w: 3, h: 4, fitPty: true }, area: null },
      { name: 'bad', geometry: { x: 'no' } }
    ],
    links: [{ from: 'a', to: 'b', label: null, rule: null }, { from: 1 }],
    areas: [{ name: '영역', color: '#fff', rect: { x: 0, y: 0, w: 5, h: 5 } }, { name: 'no rect' }],
    notes: { 'note:a': { kind: 'web' }, 'other:b': { kind: 'web' }, 'note:c': { kind: 'nope' } },
    noteCards: { 'note:a': { x: 1, y: 1, w: 2, h: 2 }, 'note:c': { x: 1, y: 1, w: 2, h: 2 } }
  })

  it('keeps well formed entries and drops the rest', () => {
    const parsed = parseRestoreSeed(text)!
    expect(parsed.chatSessions).toEqual({ a: 'IG' })
    expect(parsed.aliases).toEqual({ x: ['y'] })
    expect(parsed.cards.map((card) => card.name)).toEqual(['IG'])
    expect(parsed.cards[0].geometry.fitPty).toBe(true)
    expect(parsed.links).toHaveLength(1)
    expect(parsed.areas.map((area) => area.name)).toEqual(['영역'])
    expect(Object.keys(parsed.notes)).toEqual(['note:a'])
  })

  it('refuses anything that is not a known layout file', () => {
    expect(parseRestoreSeed('not json')).toBeNull()
    expect(parseRestoreSeed('[]')).toBeNull()
    expect(parseRestoreSeed(JSON.stringify({ version: 3, source: 'x' }))).toBeNull()
    expect(parseRestoreSeed(JSON.stringify({ version: 1 }))).toBeNull()
  })
})
