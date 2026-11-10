import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONTENT_SAVE_DELAY_MS,
  VIEW_SAVE_DELAY_MS,
  boardChangeKind,
  createLayoutAutoSaver
} from './board-layout-autosave'
import {
  cardIdentities,
  reconcileIdentity,
  recordIdentities,
  type CardIdentity
} from './board-identity'
import { isLinkApplied, linkFingerprint, migrateLinkFingerprints } from './board-link-rule'
import {
  buildLayoutSeed,
  buildWindows,
  layoutContent,
  mergeWithPrevious
} from './board-layout-seed'
import { emptyBoardLayout, type BoardLayout } from './board-layout-state'
import { applyRestore, parseRestoreSeed } from './board-restore'
import type { BoardTerminal } from './board-terminal-listing'
import { chooseSeed } from './use-board-identity'

const geo = (x: number, y = 0, extra = {}) => ({ x, y, w: 640, h: 400, ...extra })
const NOW = 100 * 24 * 60 * 60 * 1000
const live = (...pairs: [string, string | null][]): CardIdentity[] =>
  pairs.map(([key, name]) => ({ key, name }))
const board = (patch: Partial<BoardLayout> = {}): BoardLayout => ({
  ...emptyBoardLayout(),
  arrangePending: false,
  ...patch
})

describe('saving by itself', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = (text: string | null = '{"version":2,"source":"a","x":1}', initial?: string) => {
    const current = { text }
    const write = vi.fn(async () => true)
    const saver = createLayoutAutoSaver({
      build: () => current.text,
      contentOf: layoutContent,
      write,
      initialContent: initial
    })
    return { saver, write, current }
  }

  it('waits for the changes to stop, then saves once', async () => {
    const { saver, write } = setup()
    saver.notify('content')
    await vi.advanceTimersByTimeAsync(CONTENT_SAVE_DELAY_MS - 1)
    saver.notify('content')
    await vi.advanceTimersByTimeAsync(CONTENT_SAVE_DELAY_MS - 1)
    expect(write).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(write).toHaveBeenCalledOnce()
  })

  it('saves a pan or zoom alone later, and never lets it postpone a real change', async () => {
    const { saver, write } = setup()
    saver.notify('view')
    await vi.advanceTimersByTimeAsync(VIEW_SAVE_DELAY_MS - 1)
    expect(write).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(write).toHaveBeenCalledOnce()

    const second = setup()
    second.saver.notify('content')
    await vi.advanceTimersByTimeAsync(1000)
    second.saver.notify('view')
    await vi.advanceTimersByTimeAsync(CONTENT_SAVE_DELAY_MS - 1000)
    expect(second.write).toHaveBeenCalledOnce()
  })

  it('never writes while there is nothing safe to save', async () => {
    const { saver, write } = setup(null)
    saver.notify('content')
    await vi.advanceTimersByTimeAsync(CONTENT_SAVE_DELAY_MS)
    expect(write).not.toHaveBeenCalled()
    expect(await saver.saveNow()).toBe(false)
  })

  it('does not write the same layout again, whatever its time stamp', async () => {
    const { saver, write, current } = setup()
    await saver.saveNow()
    current.text = '{"version":2,"source":"b","x":1}'
    await saver.saveNow()
    expect(write).toHaveBeenCalledOnce()
    current.text = '{"version":2,"source":"c","x":2}'
    await saver.saveNow()
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('skips a write when the file on disk already says this', async () => {
    const text = '{"version":2,"source":"a","x":1}'
    const { saver, write } = setup(text, layoutContent('{"version":2,"source":"old","x":1}'))
    await saver.saveNow()
    expect(write).not.toHaveBeenCalled()
  })

  it('tries again after a failed write', async () => {
    const write = vi.fn(async () => false)
    const saver = createLayoutAutoSaver({
      build: () => '{"version":2,"source":"a"}',
      contentOf: layoutContent,
      write
    })
    expect(await saver.saveNow()).toBe(false)
    await saver.saveNow()
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('saves what is pending when the board closes', async () => {
    const { saver, write } = setup()
    saver.notify('content')
    saver.dispose()
    await vi.advanceTimersByTimeAsync(0)
    expect(write).toHaveBeenCalledOnce()
    const idle = setup()
    idle.saver.dispose()
    await vi.advanceTimersByTimeAsync(0)
    expect(idle.write).not.toHaveBeenCalled()
  })

  it('tells a pan from a real change, and ignores sightings', () => {
    const start = board()
    expect(boardChangeKind(start, start)).toBeNull()
    expect(boardChangeKind(start, { ...start, viewport: { x: 1, y: 1, zoom: 1 } })).toBe('view')
    expect(boardChangeKind(start, { ...start, cards: { a: geo(1) } })).toBe('content')
    expect(
      boardChangeKind(start, { ...start, cards: { a: geo(1) }, viewport: { x: 1, y: 1, zoom: 1 } })
    ).toBe('content')
    expect(boardChangeKind(start, { ...start, seenAt: { a: 1 } })).toBeNull()
  })
})

describe('window names', () => {
  const terminal = (key: string, paneTitle: string | null, session?: string) =>
    ({ key, paneTitle, title: 'x', session }) as unknown as BoardTerminal
  const desk = { 'conv-op': 'Operation', 'conv-biz': 'Business' }
  const sessions = (entry: BoardTerminal) => [(entry as unknown as { session?: string }).session]

  it('prefers the role from the conversation, then the pane title, then the tab title', () => {
    const names = cardIdentities(
      [terminal('a', 'Desk A', 'conv-op'), terminal('b', 'QA', 'unknown'), terminal('c', null)],
      () => '탭',
      {},
      {},
      desk,
      sessions
    )
    expect(names).toEqual([
      { key: 'a', name: 'Operation', fromDesk: true },
      { key: 'b', name: 'QA' },
      { key: 'c', name: '탭' }
    ])
  })

  it('names a chat from its conversation too', () => {
    const chat = {
      key: 'c',
      paneTitle: null,
      title: 'Claude Chat',
      chat: { sessionId: 's' }
    } as BoardTerminal
    expect(cardIdentities([chat], () => null, {}, { c: 'conv-biz' }, desk)[0].name).toBe('Business')
  })

  it('corrects a recorded name from the desk, but a title never replaces a role', () => {
    const start = board({ cards: { a: geo(1) }, names: { a: 'Desk A' } })
    const fixed = recordIdentities(start, [{ key: 'a', name: 'Operation', fromDesk: true }], NOW)
    expect(fixed.names?.a).toBe('Operation')
    const kept = recordIdentities(fixed, [{ key: 'a', name: '전략기획 역할 설정' }], NOW)
    expect(kept.names?.a).toBe('Operation')
  })

  it('lets a window keep its own spot and the old card links when the user already placed it', () => {
    const start = board({
      cards: { deadChat: geo(1), strategy: geo(500, 0, { placed: true }), biz: geo(2) },
      names: { deadChat: 'Strategy', biz: 'Business' },
      seenAt: { deadChat: 5 },
      hiddenKeys: ['deadChat'],
      links: [{ id: 'l', from: 'biz', to: 'deadChat' }]
    })
    const next = reconcileIdentity(
      start,
      [
        { key: 'strategy', name: 'Strategy', fromDesk: true },
        { key: 'biz', name: 'Business' }
      ],
      null,
      NOW
    )!
    expect(next.cards.strategy.x).toBe(500)
    expect(next.hiddenKeys).toEqual([])
    expect(next.cards.deadChat).toBeUndefined()
    expect(next.links[0].to).toBe('strategy')
  })
})

describe('whether a rule was told', () => {
  const names = { a: 'UX', b: 'APP_dev', a2: 'UX', b2: 'APP_dev' }
  const link = {
    id: 'l',
    from: 'a',
    to: 'b',
    rule: '넘긴다',
    twoWay: true,
    trigger: 'on-finish' as const
  }

  it('stays told when windows come back under new keys', () => {
    const told = { ...link, appliedFingerprint: linkFingerprint(link, names) }
    expect(isLinkApplied({ ...told, from: 'a2', to: 'b2' }, names)).toBe(true)
  })

  it('holds no key or handle', () => {
    const print = linkFingerprint(
      { ...link, from: 'term_abc::key', to: 'b' },
      { 'term_abc::key': 'UX', b: 'QA' }
    )
    expect(print).not.toContain('term_abc')
  })

  it('changes with the rule, the partner, the direction or the trigger', () => {
    const told = { ...link, appliedFingerprint: linkFingerprint(link, names) }
    expect(isLinkApplied({ ...told, rule: '다른 규칙' }, names)).toBe(false)
    expect(isLinkApplied({ ...told, twoWay: false }, names)).toBe(false)
    expect(isLinkApplied({ ...told, trigger: 'manual' }, names)).toBe(false)
    expect(isLinkApplied(told, { ...names, b: 'QA' })).toBe(false)
  })

  it('carries a key-based fingerprint over when its rule still matches, and waits for names', () => {
    const old = JSON.stringify(['keyA', 'keyB', '넘긴다', true])
    const links = [{ ...link, appliedFingerprint: old }]
    expect(migrateLinkFingerprints(links, {})).toBe(links)
    const moved = migrateLinkFingerprints(links, names)
    expect(isLinkApplied(moved[0], names)).toBe(true)
  })

  it('forgets a key-based fingerprint whose rule has changed since', () => {
    const old = JSON.stringify(['keyA', 'keyB', '예전 규칙', true])
    const moved = migrateLinkFingerprints([{ ...link, appliedFingerprint: old }], names)
    expect(moved[0].appliedFingerprint).toBeUndefined()
  })

  it('stays told when the desk only corrects a name', () => {
    const start = board({
      cards: { a: geo(1), b: geo(2) },
      names: { a: 'Code review', b: 'APP_dev' },
      links: [
        { ...link, appliedFingerprint: linkFingerprint(link, { a: 'Code review', b: 'APP_dev' }) }
      ]
    })
    const next = recordIdentities(
      start,
      [
        { key: 'a', name: 'Code_review', fromDesk: true },
        { key: 'b', name: 'APP_dev' }
      ],
      NOW
    )
    expect(isLinkApplied(next.links[0], next.names)).toBe(true)
  })
})

describe('the version 2 layout file', () => {
  const current = board({
    name: '메인 보드',
    autoPush: false,
    viewport: { x: 1, y: 2, zoom: 0.6 },
    cards: {
      ux: geo(0, 0, { fitPty: true, pinned: true, placed: true }),
      dev: geo(700, 0, { collapsed: true }),
      'note:a': geo(5),
      'note:t': geo(6),
      'asset:x': geo(7)
    },
    categories: [
      {
        id: 'one',
        name: '새 카테고리',
        color: '#111111',
        anchor: { x: 0, y: 0 },
        rect: { x: 1, y: 2, w: 3, h: 4 }
      },
      { id: 'two', name: '새 카테고리', color: '#222222', anchor: { x: 9, y: 9 }, collapsed: true }
    ],
    categoryOf: { ux: 'one', dev: 'two' },
    names: { ux: 'UX', dev: 'APP_dev' },
    links: [
      {
        id: 'l',
        from: 'ux',
        to: 'dev',
        label: '검수',
        rule: '전문 규칙',
        twoWay: true,
        trigger: 'on-finish',
        appliedFingerprint: linkFingerprint(
          { from: 'ux', to: 'dev', rule: '전문 규칙', twoWay: true, trigger: 'on-finish' },
          { ux: 'UX', dev: 'APP_dev' }
        )
      },
      { id: 'm', from: 'ux', to: 'note:a', label: '만든 창' }
    ],
    notes: {
      'note:a': { kind: 'artifact', url: 'https://claude.ai/artifact/x', title: '문서', items: [] },
      'note:t': { kind: 'text', text: 'BUSINESS', items: [] }
    },
    assetPanels: {
      ux: { collapsed: true, categories: [{ id: 'c', name: '시안', assetIds: ['i1', 'i2'] }] }
    }
  })
  const windows = live(['ux', 'UX'], ['dev', 'APP_dev'])
  const text = JSON.stringify(buildLayoutSeed(current, windows, {}, new Date(2026, 10, 5)))
  const file = JSON.parse(text) as Record<string, unknown>
  const parsed = parseRestoreSeed(text)!

  it('holds everything the board is, with no key or fingerprint', () => {
    expect(file.version).toBe(2)
    expect(text).not.toContain('appliedFingerprint')
    expect(parsed.boardName).toBe('메인 보드')
    expect(parsed.autoPush).toBe(false)
    expect(parsed.cards[0].geometry).toEqual(geo(0, 0, { fitPty: true, pinned: true }))
    expect(parsed.cards[1].geometry.collapsed).toBe(true)
    expect(parsed.links[0]).toMatchObject({
      rule: '전문 규칙',
      twoWay: true,
      trigger: 'on-finish',
      applied: true
    })
    expect(parsed.links[1]).toMatchObject({ from: 'UX', to: 'note:a', label: '만든 창' })
    expect(parsed.notes['note:a']).toMatchObject({
      url: 'https://claude.ai/artifact/x',
      title: '문서'
    })
    expect(parsed.notes['note:t'].text).toBe('BUSINESS')
    expect(parsed.assetCards['asset:x']).toEqual(geo(7))
    expect(parsed.assetPanels.UX.categories[0].assetIds).toEqual(['i1', 'i2'])
    expect((file.areas as { members: string[] }[])[0].members).toEqual(['UX'])
  })

  it('brings the whole board back on new keys, and a told rule stays told without a send', () => {
    const back = applyRestore(board(), parsed, live(['n1', 'UX'], ['n2', 'APP_dev']))!
    expect(back.cards.n1).toEqual(geo(0, 0, { fitPty: true, pinned: true }))
    expect(back.categoryOf.n1).toBe('one')
    expect(back.categoryOf.n2).toBe('two')
    expect(back.categories.find((entry) => entry.id === 'two')?.collapsed).toBe(true)
    expect(back.autoPush).toBe(false)
    const rule = back.links.find((link) => link.rule)!
    expect(isLinkApplied(rule, { n1: 'UX', n2: 'APP_dev' })).toBe(true)
    expect(back.links.find((link) => link.to === 'note:a')).toBeDefined()
    expect(back.notes['note:t'].text).toBe('BUSINESS')
    expect(back.cards['asset:x']).toEqual(geo(7))
    expect(back.assetPanels.n1.categories[0].name).toBe('시안')
  })

  it('stops a first-open grid pass from laying out over restored places', () => {
    const fresh = { ...board(), arrangePending: true }
    expect(applyRestore(fresh, parsed, live(['n1', 'UX']))!.arrangePending).toBe(false)
  })

  it('still reads a version 1 file', () => {
    const old = parseRestoreSeed(
      JSON.stringify({
        version: 1,
        source: 'v1',
        cards: [{ name: 'IG', geometry: geo(1), area: null }],
        areas: [
          { name: 'no rect' },
          { name: '영역', color: '#000', rect: { x: 0, y: 0, w: 1, h: 1 } }
        ]
      })
    )!
    expect(old.cards).toHaveLength(1)
    expect(old.areas.map((area) => area.name)).toEqual(['영역'])
    expect(old.windows).toEqual([])
    expect(old.assetPanels).toEqual({})
  })

  it('keeps windows that are off in the next save, and drops them from nothing else', () => {
    const previous = parseRestoreSeed(
      JSON.stringify({
        version: 2,
        source: 'p',
        cards: [
          { name: '서브 프로젝트', geometry: geo(9), area: '새 카테고리', areaId: 'one' },
          { name: 'UX', geometry: geo(1), area: null }
        ],
        links: [
          { from: 'UX', to: '서브 프로젝트', label: 'x' },
          { from: 'UX', to: 'APP_dev', label: 'stale' }
        ],
        windows: [{ name: '서브 프로젝트', surface: 'terminal', sessionId: 's', neighbors: [] }],
        assetPanels: { '서브 프로젝트': { categories: [{ name: 'c', assetIds: [] }] } }
      })
    )!
    const merged = mergeWithPrevious(
      buildLayoutSeed(current, windows, {}, new Date()),
      previous,
      new Set(['UX', 'APP_dev'])
    ) as Record<string, never>
    const names = (merged.cards as { name: string }[]).map((card) => card.name)
    expect(names).toEqual(['UX', 'APP_dev', '서브 프로젝트'])
    const labels = (merged.links as { label: string }[]).map((link) => link.label)
    expect(labels).toContain('x')
    expect(labels).not.toContain('stale')
    expect((merged.windows as { name: string; open: boolean }[])[0]).toMatchObject({
      name: '서브 프로젝트',
      open: false
    })
    expect((merged.areas as { members: string[] }[])[0].members).toContain('서브 프로젝트')
    expect(Object.keys(merged.assetPanels)).toContain('서브 프로젝트')
  })

  it('describes each window with its surface, conversation, tab and neighbours', () => {
    const terminals = [
      { key: 'a', tabId: 't1', worktreePath: '/p', title: 'x' },
      { key: 'b', tabId: 't1', worktreePath: '/q', title: 'y' },
      { key: 'c', tabId: 'chat', worktreePath: '', title: 'z', chat: { sessionId: 's' } },
      { key: 'nameless', tabId: 't1', worktreePath: '/r', title: 'n' }
    ] as BoardTerminal[]
    const list = buildWindows(
      terminals,
      live(['a', 'UX'], ['b', 'QA'], ['c', 'IG'], ['nameless', null]),
      {
        tabTitleOf: (key) => (key === 'a' ? 'Desk B' : null),
        sessionIdOf: (terminal) => (terminal.key === 'c' ? 'conv' : null)
      }
    )
    expect(list[0]).toEqual({
      name: 'UX',
      surface: 'terminal',
      sessionId: null,
      tabTitle: 'Desk B',
      neighbors: ['QA'],
      cwd: '/p',
      open: true
    })
    expect(list[2]).toMatchObject({
      name: 'IG',
      surface: 'chat',
      sessionId: 'conv',
      neighbors: [],
      cwd: null
    })
  })
})

describe('the file frozen from this setup', () => {
  const path = join(homedir(), 'projects', '_out', 'dudu-ade', 'board-layout.json')
  const restorePath = join(homedir(), 'projects', '_out', 'dudu-ade', 'board-restore-1105.json')
  const text = existsSync(path) ? readFileSync(path, 'utf8') : null
  const frozen = text?.includes('frozen-1105-1855') ? parseRestoreSeed(text) : null

  it.runIf(frozen)('opens with every window in place and wins over the restore file', () => {
    const restore = existsSync(restorePath)
      ? parseRestoreSeed(readFileSync(restorePath, 'utf8'))
      : null
    const seed = chooseSeed(frozen, restore)!
    expect(seed.source).toContain('frozen-1105-1855')
    const windows = frozen!.cards.map((card, index) => ({ key: `new${index}`, name: card.name }))
    const opened = reconcileIdentity(board(), windows, seed, NOW)!
    for (const [index, card] of frozen!.cards.entries()) {
      expect(opened.cards[`new${index}`].x).toBe(card.geometry.x)
      expect(opened.cards[`new${index}`].h).toBe(card.geometry.h)
    }
    expect(opened.categories).toHaveLength(frozen!.areas.length)
    expect(opened.links).toHaveLength(frozen!.links.length)
    expect(opened.viewport).toEqual(frozen!.viewport)
    expect(opened.links.filter((link) => isLinkApplied(link, opened.names))).toHaveLength(
      frozen!.links.filter((link) => link.applied).length
    )
    expect(reconcileIdentity(opened, windows, seed, NOW)).toBeNull()
  })

  it.runIf(frozen)('leaves what the user placed since alone, on the same keys', () => {
    const windows = frozen!.cards.map((card, index) => ({ key: `k${index}`, name: card.name }))
    const placed = board({
      cards: { k0: geo(12345, 0, { placed: true }) },
      names: { k0: frozen!.cards[0].name }
    })
    expect(reconcileIdentity(placed, windows, frozen, NOW)!.cards.k0.x).toBe(12345)
  })
})
