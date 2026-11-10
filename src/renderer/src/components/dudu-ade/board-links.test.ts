import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyBoardLayout } from './board-layout-state'
import { boardChatKey, cardKeyAt, linkSegment, rekeyBoardCard } from './board-links'
import { BOARDS_STORAGE_KEY, loadBoardWorkspaces } from './board-workspaces-storage'
import { chatBoardStatus, chatTabRows } from './use-board-chats'
import { handoffFlows } from './use-board-terminals'
import { unscaledPoint } from './use-unscaled-terminal-mouse'
import type { BoardTerminal } from './board-terminal-listing'

afterEach(() => vi.unstubAllGlobals())

describe('board links', () => {
  it('clips a link to both card borders', () => {
    const segment = linkSegment({ x: 0, y: 0, w: 100, h: 100 }, { x: 300, y: 0, w: 100, h: 100 })
    expect(segment).toEqual({
      a: { x: 100, y: 50 },
      b: { x: 300, y: 50 },
      mid: { x: 200, y: 50 }
    })
  })

  it('draws nothing between overlapping cards', () => {
    expect(linkSegment({ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 50, w: 100, h: 100 })).toBeNull()
  })

  it('finds the topmost card under a point, using the collapsed height', () => {
    const cards = {
      a: { x: 0, y: 0, w: 200, h: 200 },
      b: { x: 100, y: 100, w: 200, h: 200 },
      c: { x: 500, y: 0, w: 200, h: 200, collapsed: true }
    }
    expect(cardKeyAt({ x: 150, y: 150 }, ['a', 'b', 'c'], cards)).toBe('b')
    expect(cardKeyAt({ x: 600, y: 100 }, ['a', 'b', 'c'], cards)).toBeNull()
    expect(cardKeyAt({ x: 600, y: 10 }, ['a', 'b', 'c'], cards)).toBe('c')
  })

  it('gives boards saved before links an empty link list', () => {
    const { links: _links, assetPanels: _panels, ...old } = emptyBoardLayout()
    const saved = JSON.stringify({ activeId: old.id, boards: [old] })
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => (key === BOARDS_STORAGE_KEY ? saved : null)
      }
    })
    expect(loadBoardWorkspaces().boards[0].links).toEqual([])
    expect(loadBoardWorkspaces().boards[0].assetPanels).toEqual({})
  })

  it('moves place, category, hidden flag and links when a terminal becomes a chat', () => {
    const board = {
      ...emptyBoardLayout(),
      cards: {
        t: { x: 1, y: 2, w: 3, h: 4 },
        other: { x: 0, y: 0, w: 1, h: 1 }
      },
      categoryOf: { t: 'cat' },
      hiddenKeys: ['t'],
      links: [{ id: 'l', from: 'other', to: 't' }]
    }
    const chat = boardChatKey('wt', 'structured-agent-session-s1')
    const next = rekeyBoardCard(board, 't', chat)
    expect(next.cards[chat]).toEqual({ x: 1, y: 2, w: 3, h: 4 })
    expect(next.cards.t).toBeUndefined()
    expect(next.categoryOf).toEqual({ [chat]: 'cat' })
    expect(next.hiddenKeys).toEqual([chat])
    expect(next.links).toEqual([{ id: 'l', from: 'other', to: chat }])
    expect(next.assetPanels[chat]).toEqual({ categories: [], sources: ['t'] })
    expect(rekeyBoardCard(board, 'missing', chat)).toBe(board)
  })
})

describe('terminal handoffs', () => {
  const terminal = (key: string, handle: string) => ({ key, handle }) as BoardTerminal
  it('maps runtime handles to card keys and drops unknown or self sends', () => {
    const terminals = [terminal('A', 'term_a'), terminal('B', 'term_b')]
    expect(
      handoffFlows(
        [
          { from: 'term_a', to: 'term_b', at: 1 },
          { from: 'term_a', to: 'term_b', at: 2 },
          { from: 'term_x', to: 'term_b', at: 3 },
          { from: 'term_a', to: 'term_a', at: 4 }
        ],
        terminals
      )
    ).toEqual([{ from: 'A', to: 'B' }])
  })
})

describe('chat cards', () => {
  it('lists agent-session tabs with their session ids and names', () => {
    const rows = chatTabRows({
      wt: [
        {
          id: 'structured-agent-session-s1',
          contentType: 'agent-session',
          label: 'Claude',
          customLabel: null,
          generatedLabel: '기획'
        },
        {
          id: 'term-tab',
          contentType: 'terminal',
          label: 'zsh',
          customLabel: null
        }
      ]
    })
    expect(rows).toEqual([
      {
        worktreeId: 'wt',
        tabId: 'structured-agent-session-s1',
        sessionId: 's1',
        title: '기획',
        named: null
      }
    ])
  })

  it('maps chat status to board status', () => {
    expect(chatBoardStatus({ status: 'working' } as never)).toBe('working')
    expect(chatBoardStatus({ status: 'attention' } as never)).toBe('permission')
    expect(chatBoardStatus(undefined)).toBeUndefined()
  })
})

describe('terminal mouse on a zoomed board', () => {
  it('maps a click on a half-size terminal back to its real-size position', () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 }
    expect(unscaledPoint({ x: 300, y: 150 }, rect, { width: 800, height: 400 })).toEqual({
      x: 500,
      y: 250
    })
    expect(unscaledPoint({ x: 300, y: 150 }, rect, { width: 400, height: 200 })).toEqual({
      x: 300,
      y: 150
    })
  })
})
