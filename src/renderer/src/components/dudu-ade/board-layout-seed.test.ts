import { describe, expect, it } from 'vitest'
import { reconcileIdentity, type CardIdentity } from './board-identity'
import { buildLayoutSeed } from './board-layout-seed'
import { emptyBoardLayout, type BoardLayout } from './board-layout-state'
import { applyRestore, parseRestoreSeed, type RestoreSeed } from './board-restore'
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
const rect = (x: number) => ({ x, y: 0, w: 2000, h: 1000 })

const v2: RestoreSeed = {
  source: 'board-restore-1105-v2',
  viewport: { zoom: 0.18, x: 120, y: 360 },
  chatSessions: { 'conv-ig': 'IG' },
  aliases: { Code_review: ['Code review'], '서브 프로젝트': ['개인 일상 에이전트 설정'] },
  cards: [
    { name: 'IG', geometry: geo(0), area: 'Loopit 데스크' },
    { name: 'Strategy', geometry: geo(672), area: 'Loopit 데스크' },
    { name: 'Code_review', geometry: geo(3568), area: 'Loopit product' },
    { name: '서브 프로젝트', geometry: geo(5120), area: '개인 및 Figma' }
  ],
  links: [],
  areas: [
    { name: 'Loopit 데스크', color: '#6E48E5', rect: rect(-40) },
    { name: 'Loopit product', color: '#E5484D', rect: rect(2184) },
    { name: '개인 및 Figma', color: '#2F80ED', rect: rect(4408) }
  ],
  assetCards: {},
  assetPanels: {},
  windows: [],
  notes: {},
  noteCards: {}
}

describe('a newer restore file after an older one', () => {
  const v1Done = board({
    cards: { ig: geo(-2676), strat: geo(1) },
    categories: [
      {
        id: 'old',
        name: 'Loopit 데스크',
        color: '#8E8C99',
        anchor: { x: 0, y: 0 },
        rect: rect(-673)
      }
    ],
    categoryOf: { ig: 'old' },
    restoredFrom: 'board-restore-1105-v1',
    restoredProgress: { areas: true, notes: true, viewport: true, cards: ['IG'], links: [] }
  })

  it('applies again, and fits an existing area to the new rect and color', () => {
    const next = applyRestore(v1Done, v2, live(['ig', 'IG'], ['strat', 'Strategy']))!
    expect(next.cards.ig.x).toBe(0)
    expect(next.cards.strat.x).toBe(672)
    const desk = next.categories.find((category) => category.name === 'Loopit 데스크')!
    expect(desk.id).toBe('old')
    expect(desk.rect).toEqual(rect(-40))
    expect(desk.color).toBe('#6E48E5')
    expect(next.viewport).toEqual({ zoom: 0.18, x: 120, y: 360 })
    expect(next.restoredFrom).toBe('board-restore-1105-v2')
  })

  it('moves cards into the seed areas, and keeps a card the user placed since', () => {
    const placed = { ...v1Done, cards: { ...v1Done.cards, ig: geo(55, 0, { placed: true }) } }
    const next = applyRestore(placed, v2, live(['ig', 'IG'], ['strat', 'Strategy']))!
    expect(next.cards.ig.x).toBe(55)
    const desk = next.categories.find((category) => category.name === 'Loopit 데스크')!
    expect(next.categoryOf.strat).toBe(desk.id)
  })

  it('looks at aliases for windows named differently now', () => {
    const next = applyRestore(
      board(),
      v2,
      live(['a', '개인 일상 에이전트 설정'], ['b', 'Code review'])
    )!
    expect(next.cards.a.x).toBe(5120)
    expect(next.cards.b.x).toBe(3568)
  })
})

describe('areas the seed does not know', () => {
  const start = board({
    cards: { ig: geo(1), figma: geo(2), dead: geo(3) },
    categories: [
      { id: 'main', name: 'main', color: '#000', anchor: { x: 0, y: 0 } },
      { id: 'figma', name: 'Figma', color: '#000', anchor: { x: 0, y: 0 } },
      { id: 'mine', name: '내 영역', color: '#000', anchor: { x: 0, y: 0 }, rect: rect(0) },
      { id: 'other', name: '다른 것', color: '#000', anchor: { x: 0, y: 0 } }
    ],
    categoryOf: { ig: 'main', dead: 'main', figma: 'other' }
  })

  it('drops an automatic area with no live card left, keeps drawn ones and ones still holding a card', () => {
    const next = applyRestore(start, v2, live(['ig', 'IG'], ['figma', 'Figma']))!
    const names = next.categories.map((category) => category.name)
    expect(names).not.toContain('main')
    expect(names).not.toContain('Figma')
    expect(names).toContain('내 영역')
    expect(names).toContain('다른 것')
  })
})

describe('asking for the saved layout', () => {
  const seed = { ...v2, source: 'board-layout T' }

  it('applies each time it is asked, to cards the user placed too', () => {
    const windows = live(['ig', 'IG'])
    const first = applyRestore(
      board({ cards: { ig: geo(9, 0, { placed: true }) } }),
      seed,
      windows,
      {
        force: true
      }
    )!
    expect(first.cards.ig.x).toBe(0)
    const moved = { ...first, cards: { ...first.cards, ig: geo(777, 0, { placed: true }) } }
    expect(applyRestore(moved, seed, windows)).toBeNull()
    expect(applyRestore(moved, seed, windows, { force: true })!.cards.ig.x).toBe(0)
  })

  it('does not double the links it made before', () => {
    const withLinks = {
      ...seed,
      links: [{ from: 'IG', to: 'Strategy', label: 'x' }]
    }
    const windows = live(['ig', 'IG'], ['s', 'Strategy'])
    const once = applyRestore(board(), withLinks, windows, { force: true })!
    expect(applyRestore(once, withLinks, windows, { force: true })!.links).toHaveLength(1)
  })
})

describe('building the saved layout', () => {
  const current = board({
    name: '메인 보드',
    viewport: { x: 1, y: 2, zoom: 0.5 },
    cards: {
      ig: geo(0, 0, { placed: true, fitPty: true }),
      ux: geo(700),
      dup1: geo(1),
      dup2: geo(2),
      gone: geo(3),
      hid: geo(4),
      'note:n': geo(9, 9)
    },
    categories: [
      { id: 'a', name: '데스크', color: '#6E48E5', anchor: { x: 0, y: 0 }, rect: rect(0) },
      { id: 'b', name: '자동', color: '#000', anchor: { x: 0, y: 0 } }
    ],
    categoryOf: { ig: 'a', ux: 'b' },
    links: [
      { id: 'l1', from: 'ig', to: 'ux', label: '검수' },
      { id: 'l2', from: 'ig', to: 'gone' }
    ],
    hiddenKeys: ['hid'],
    notes: { 'note:n': { kind: 'checklist', items: [{ id: 'i', text: '할 일' }] } }
  })
  const windows = live(
    ['ig', 'IG'],
    ['ux', 'UX'],
    ['dup1', 'Same'],
    ['dup2', 'Same'],
    ['hid', 'Hidden'],
    ['chat', null]
  )
  const text = JSON.stringify(
    buildLayoutSeed(current, windows, { ig: 'conv-1' }, new Date(2026, 10, 5))
  )
  const parsed = parseRestoreSeed(text)!

  it('writes live named cards by name with their area, without the placed mark', () => {
    expect(parsed.cards.map((card) => card.name)).toEqual(['IG', 'UX'])
    expect(parsed.cards[0].geometry).toEqual(geo(0, 0, { fitPty: true }))
    expect(parsed.cards.map((card) => card.area)).toEqual(['데스크', '자동'])
  })

  it('leaves out shared names and hidden cards', () => {
    expect(text).not.toContain('Same')
    expect(text).not.toContain('Hidden')
  })

  it('keeps links by name only when both ends are saved, every area, notes with their content and the view', () => {
    expect(parsed.links).toEqual([{ from: 'IG', to: 'UX', label: '검수' }])
    expect(parsed.areas.map((area) => [area.name, area.rect])).toEqual([
      ['데스크', rect(0)],
      ['자동', null]
    ])
    expect(parsed.notes['note:n'].items).toEqual([{ id: 'i', text: '할 일' }])
    expect(parsed.noteCards['note:n']).toEqual(geo(9, 9))
    expect(parsed.viewport).toEqual({ x: 1, y: 2, zoom: 0.5 })
    expect(parsed.chatSessions).toEqual({ 'conv-1': 'IG' })
    expect(parsed.source.startsWith('board-layout ')).toBe(true)
  })

  it('puts the same places back on windows that came back under new keys', () => {
    const fresh = board()
    const back = applyRestore(fresh, parsed, live(['n1', 'IG'], ['n2', 'UX']), { force: true })!
    expect(back.cards.n1).toEqual(geo(0, 0, { fitPty: true }))
    expect(back.cards.n2.x).toBe(700)
    expect(back.links).toHaveLength(1)
    expect(back.categories.find((category) => category.name === '자동')).toBeDefined()
  })
})

describe('which seed wins at start', () => {
  it('prefers the saved layout and keeps what only the restore file knows', () => {
    const layout = { ...v2, source: 'board-layout T', chatSessions: { a: 'Business' }, aliases: {} }
    const chosen = chooseSeed(layout, v2)!
    expect(chosen.source).toBe('board-layout T')
    expect(chosen.chatSessions).toEqual({ 'conv-ig': 'IG', a: 'Business' })
    expect(chosen.aliases.Code_review).toEqual(['Code review'])
    expect(chooseSeed(null, v2)).toBe(v2)
    expect(chooseSeed(null, null)).toBeNull()
  })

  it('places an unplaced window from the layout after names took the old places', () => {
    const layout = { ...v2, source: 'board-layout T' }
    const old = board({
      cards: { oldIG: geo(900, 0, { placed: true }), auto: geo(-5) },
      names: { oldIG: 'IG' },
      seenAt: { oldIG: 1 }
    })
    const next = reconcileIdentity(old, live(['newIG', 'IG'], ['auto', 'Strategy']), layout, NOW)!
    expect(next.cards.newIG.x).toBe(900)
    expect(next.cards.auto.x).toBe(672)
  })
})
