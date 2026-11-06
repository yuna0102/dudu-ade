// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nameFromCommand } from '../../../../main/dudu-ade/terminal-agent-models'
import { cardIdentities, stripStatusMark } from './board-identity'
import { addMissingCards, syncBoardTerminals } from './board-sync'
import { emptyBoardLayout, type BoardLayout } from './board-layout-state'
import type { BoardTerminal } from './board-terminal-listing'
import { useDuduAdeStore } from './dudu-ade-store'
import { useBoardAutoSync } from './use-board-view-model'

const WT = 'wt::/p/loopit_agent'
const TITLES = [
  '앱 기획',
  'UX',
  'APP_dev',
  'QA',
  'Code_review',
  '헤드',
  'Operation',
  '개인 브레인',
  '서브 프로젝트',
  'Strategy',
  'Figma',
  'IG',
  'HW design'
]
const keyOf = (index: number): string => `${WT}::tab${index}::leaf${index}`
const terminal = (index: number, over: Partial<BoardTerminal> = {}): BoardTerminal => ({
  key: keyOf(index),
  handle: `h${index}`,
  ptyId: `p${index}`,
  title: TITLES[index],
  paneTitle: null,
  worktreeId: WT,
  worktreePath: '/p/loopit_agent',
  branch: '',
  tabId: `tab${index}`,
  leafId: `leaf${index}`,
  connected: true,
  lastOutputAt: null,
  ...over
})

describe('names of running windows', () => {
  it('drops the status mark an agent puts in front of a title', () => {
    expect(stripStatusMark('◑ 헤드')).toBe('헤드')
    expect(stripStatusMark('✳ 개인 브레인')).toBe('개인 브레인')
    expect(stripStatusMark('Terminal 1')).toBe('Terminal 1')
    expect(stripStatusMark('✳')).toBeNull()
  })

  it('reads the name a window was started with out of the process arguments', () => {
    expect(nameFromCommand('claude -n 헤드 --effort medium --resume a552')).toBe('헤드')
    expect(nameFromCommand('claude -n 앱 기획 --effort medium --resume 5389')).toBe('앱 기획')
    expect(nameFromCommand('claude -n Figma --resume 487a')).toBe('Figma')
    expect(nameFromCommand('claude --resume ea69')).toBeNull()
    expect(nameFromCommand('claude -n Operation')).toBe('Operation')
  })

  it('names a window by its marked pane title, its start name, or a title the saved layout knows', () => {
    const live = [
      terminal(5, { paneTitle: '◑ 헤드' }),
      terminal(6, { title: 'Terminal 1' }),
      terminal(7, { title: '✳ 개인 브레인' }),
      terminal(9, { title: '전략기획 역할 설정' })
    ]
    const names = cardIdentities(
      live,
      () => null,
      {},
      {},
      {},
      () => [],
      {
        startedNameOf: (t) => (t.key === keyOf(6) ? 'Operation' : undefined),
        knownNames: new Set(['개인 브레인'])
      }
    ).map((card) => card.name)
    // A generated title the layout does not know is not a name.
    expect(names).toEqual(['헤드', 'Operation', '개인 브레인', null])
  })
})

describe('a running window always gets a card', () => {
  const list = (names: (string | null)[]) =>
    names.map((categoryName, index) => ({ key: keyOf(index), categoryName }))

  it('places windows even when the board waits to arrange and a name is unresolved', () => {
    const board: BoardLayout = { ...emptyBoardLayout(), arrangePending: true }
    const terminals = list(['loopit_agent', null, 'loopit_agent'])
    // The ordinary pass holds back everything until every name is known.
    expect(Object.keys(syncBoardTerminals(board, terminals)?.cards ?? {})).toHaveLength(0)
    // The caller names each window by its tab, else its workspace, so every one has a name by then.
    const named = terminals.map((t) => ({ ...t, categoryName: t.categoryName ?? 'loopit_agent' }))
    expect(Object.keys(addMissingCards(board, named, false)?.cards ?? {})).toHaveLength(3)
  })

  it('skips windows the user hid unless asked', () => {
    const board: BoardLayout = {
      ...emptyBoardLayout(),
      arrangePending: false,
      hiddenKeys: [keyOf(1)]
    }
    const terminals = list(['a', 'a'])
    expect(Object.keys(addMissingCards(board, terminals, false)?.cards ?? {})).toEqual([keyOf(0)])
    const all = addMissingCards(board, terminals, true)
    expect(Object.keys(all?.cards ?? {}).sort()).toEqual([keyOf(0), keyOf(1)])
    expect(all?.hiddenKeys).toEqual([])
  })

  it('only unhides a hidden window that already has a card', () => {
    const base = addMissingCards(
      { ...emptyBoardLayout(), arrangePending: false },
      list(['a']),
      false
    ) as Partial<BoardLayout>
    const board = { ...emptyBoardLayout(), ...base, hiddenKeys: [keyOf(0)] } as BoardLayout
    expect(addMissingCards(board, list(['a']), true)).toEqual({ hiddenKeys: [] })
    expect(addMissingCards(board, list(['a']), false)).toBeNull()
  })
})

describe('13 windows opening one by one', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    const board = { ...emptyBoardLayout(), arrangePending: false }
    useDuduAdeStore.setState({
      board,
      workspaces: { activeId: board.id, boards: [board] }
    } as never)
  })
  afterEach(() => vi.useRealTimers())

  it('every one has a card, with marked titles and tabs the app store never reports', async () => {
    const found = new Set<string>()
    const props = (count: number) => {
      const terminals = TITLES.slice(0, count).map((_, index) =>
        terminal(index, { title: `◑ ${TITLES[index]}` })
      )
      return {
        board: useDuduAdeStore.getState().board,
        terminals,
        // Half the tabs are never found: a single-tab window the store does not list.
        meta: new Map(
          terminals.map((t, index) => [
            t.key,
            { status: undefined, tabName: null, tabFound: index % 2 === 0 && found.has(t.key) }
          ])
        ),
        loaded: true,
        workspaceName: () => 'loopit_agent',
        updateBoard: (
          update: Parameters<ReturnType<typeof useDuduAdeStore.getState>['updateBoard']>[0]
        ) => useDuduAdeStore.getState().updateBoard(update)
      }
    }
    TITLES.forEach((_, index) => found.add(keyOf(index)))
    const { rerender } = renderHook((p: ReturnType<typeof props>) => useBoardAutoSync(p), {
      initialProps: props(0)
    })
    for (let count = 1; count <= TITLES.length; count += 1) {
      rerender(props(count))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    const cards = useDuduAdeStore.getState().board.cards
    expect(TITLES.every((_, index) => keyOf(index) in cards)).toBe(true)
  })
})
