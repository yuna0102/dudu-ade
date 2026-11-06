// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeCutLink, extractAssetReferences } from '../../../../shared/dudu-ade-asset-kinds'
import {
  findIndexEntry,
  localPageCandidates,
  parseOutIndex
} from '../../../../shared/dudu-ade-out-index'
import { artifactNoteRepair, joinCutAssetLinks } from './board-artifact-repair'
import { artifactNeedsLogin, isSignedInPage } from './BoardArtifactWebview'
import { claimBoardChat, isHeldByBoard, useBoardChatOwner } from './board-chat-owner'
import { chatStaysLive, boardWheelRoute } from './board-terminal-focus'
import { boardTerminalTitle, cardDisplayTitle } from './BoardTerminalCard'
import type { BoardTerminal } from './board-terminal-listing'
import type { CollectedAsset } from './dudu-ade-store-types'

const FULL = 'https://claude.ai/artifact/5zPMxSKPS9wSdXUKwG2uyr'
const CUT = 'https://claude.ai/artifact/5zPMxSKPS9w'
const row = (name: string, artifactUrl: string | null, extra = {}) => ({
  date: '1028',
  section: '부스',
  name,
  artifactUrl,
  localHtml: null,
  localMarkdown: null,
  localFolder: null,
  ...extra
})

describe('links cut at the screen edge', () => {
  it('puts a link back together from the next line, past a margin or box edge', () => {
    expect(completeCutLink(CUT, '', ['SdXUKwG2uyr'])).toBe(FULL)
    expect(completeCutLink(CUT, '  ', ['   │ SdXUKwG2uyr  and more'])).toBe(FULL)
    expect(completeCutLink('https://claude.ai/artifact/5zP', '', ['MxSKPS9w', 'SdXUKwG2uyr'])).toBe(
      FULL
    )
  })

  it('leaves it when text follows on the line, or the next line is not the rest of it', () => {
    expect(completeCutLink(CUT, ' 이 링크', ['SdXUKwG2uyr'])).toBe(CUT)
    expect(completeCutLink(CUT, '', ['다음 문장'])).toBe(CUT)
    expect(completeCutLink(CUT, '', ['thisTextIsMuchTooLongToBeTheRestOfTheId'])).toBe(CUT)
    expect(completeCutLink(FULL, '', ['More'])).toBe(FULL)
    expect(completeCutLink('https://claude.ai/code/artifact/abc', '', ['def'])).toBe(
      'https://claude.ai/code/artifact/abc'
    )
  })

  it('collects the whole address from a terminal screen', () => {
    const refs = extractAssetReferences([`게시: ${CUT}`, 'SdXUKwG2uyr'], {
      baseDir: '/p',
      homeDir: null
    })
    expect(refs).toEqual([{ kind: 'artifact-link', location: FULL }])
  })

  const asset = (location: string, first: number, title = 's'): CollectedAsset => ({
    id: `id:${location}`,
    kind: 'artifact-link',
    location,
    firstSeenAt: first,
    lastSeenAt: first,
    source: {
      terminalTitle: title,
      worktreeId: 'w',
      worktreePath: '/p',
      branch: 'b',
      tabId: 't',
      leafId: 'l'
    }
  })
  const idOf = (_kind: string, location: string) => `id:${location}`

  it('merges a cut asset into the full one, keeping the earlier source', () => {
    const { assets, moved } = joinCutAssetLinks(
      [asset(CUT, 1, 'first'), asset(FULL, 5, 'later')],
      idOf
    )
    expect(assets).toHaveLength(1)
    expect(assets[0]).toMatchObject({ location: FULL, firstSeenAt: 1, lastSeenAt: 5 })
    expect(assets[0].source.terminalTitle).toBe('first')
    expect(moved.get(`id:${CUT}`)).toBe(`id:${FULL}`)
  })

  it('completes a cut asset from the results table', () => {
    const { assets } = joinCutAssetLinks([asset(CUT, 1)], idOf, [FULL])
    expect(assets[0].location).toBe(FULL)
    expect(assets[0].id).toBe(`id:${FULL}`)
  })

  it('leaves a cut link two addresses could finish', () => {
    const short = 'https://claude.ai/artifact/5zP'
    const two = [
      'https://claude.ai/artifact/5zPMxSKPS9wSdXUKwG2uyr',
      'https://claude.ai/artifact/5zPAAAAAAAAAAAAAAAAAAA'
    ]
    const { assets, moved } = joinCutAssetLinks([asset(short, 1)], idOf, two)
    expect(assets[0].location).toBe(short)
    expect(moved.size).toBe(0)
  })
})

describe('correcting a card from the results table', () => {
  it('finds the row by the same address or as the start of one', () => {
    const entries = [
      row('견적', FULL),
      row('다른 것', 'https://claude.ai/artifact/AAAAAAAAAAAAAAAAAAAAAA')
    ]
    expect(findIndexEntry(FULL, entries)?.name).toBe('견적')
    expect(findIndexEntry(CUT, entries)?.name).toBe('견적')
    expect(findIndexEntry('https://claude.ai/artifact/ZZ', entries)).toBeNull()
  })

  it('corrects nothing when a short start matches two rows', () => {
    const entries = [
      row('하나', 'https://claude.ai/artifact/5zPxxxxxxxxxxxxxxxxxxx'),
      row('둘', 'https://claude.ai/artifact/5zPyyyyyyyyyyyyyyyyyyy')
    ]
    expect(findIndexEntry('https://claude.ai/artifact/5zP', entries)).toBeNull()
    const note = { kind: 'artifact' as const, url: 'https://claude.ai/artifact/5zP', items: [] }
    expect(artifactNoteRepair(note, entries, '/o')).toBeNull()
  })

  it('tries a folder index.html first, then the page the row names', () => {
    const [entry] = parseOutIndex(
      `| 1028 | 견적 | ${FULL} | \`stagecut/1028-rfq/\` | 비공개 |\n| 1027 | 둘 | ${FULL}x | \`a/b/\` (page.html) | |`
    )
    expect(localPageCandidates(entry, '/o')).toEqual(['/o/stagecut/1028-rfq/index.html'])
    const [, named] = parseOutIndex(
      `| 1028 | 견적 | ${FULL} | \`stagecut/1028-rfq/\` | 비공개 |\n| 1027 | 둘 | ${FULL}x | \`a/b/\` (page.html) | |`
    )
    expect(localPageCandidates(named, '/o')).toEqual(['/o/a/b/index.html', '/o/a/b/page.html'])
  })

  it('fixes the address and an address-only title, and keeps a readable title', () => {
    const entries = [row('키오스크 견적', FULL, { localFolder: 'stagecut/rfq/' })]
    const note = {
      kind: 'artifact' as const,
      url: CUT,
      title: 'claude.ai/artifact/5zPMxSKPS9w',
      items: []
    }
    expect(artifactNoteRepair(note, entries, '/o')).toEqual({
      url: FULL,
      title: '키오스크 견적',
      pages: ['/o/stagecut/rfq/index.html']
    })
    const named = { ...note, url: FULL, title: '내 제목', localHtml: '/o/x.html' }
    expect(artifactNoteRepair(named, entries, '/o')).toBeNull()
  })

  it('waits through another site during sign-in', () => {
    expect(isSignedInPage('https://accounts.google.com/signin')).toBe(false)
    expect(isSignedInPage('https://claude.ai/login')).toBe(false)
    expect(isSignedInPage('https://claude.ai/new')).toBe(true)
  })

  it('sees a login page or a page that never opened', () => {
    expect(artifactNeedsLogin({ url: 'https://claude.ai/login', bodyChars: 900 })).toBe(true)
    expect(artifactNeedsLogin({ url: FULL, bodyChars: 3 })).toBe(true)
    expect(artifactNeedsLogin({ url: FULL, bodyChars: 900 })).toBe(false)
    expect(artifactNeedsLogin({ url: FULL, bodyChars: null })).toBe(false)
  })
})

const mounts = vi.hoisted(() => ({
  count: 0,
  unmounts: 0,
  last: null as null | Record<string, unknown>
}))
vi.mock('../native-chat/NativeChatView', () => ({
  default: function NativeChatViewMock(props: Record<string, unknown>) {
    mounts.last = props
    useEffect(() => {
      mounts.count += 1
      return () => {
        mounts.unmounts += 1
      }
    }, [])
    return <div data-testid="chat" />
  }
}))
vi.mock('@/store', () => ({
  useAppStore: (select: (state: unknown) => unknown) =>
    select({
      unifiedTabsByWorktree: {
        wt: [
          {
            id: 'tab',
            groupId: 'g',
            contentType: 'agent-session',
            agentSessionAgent: 'claude',
            entityId: 's'
          }
        ]
      }
    })
}))
vi.mock('@/runtime/structured-agent-session-owner', () => ({
  structuredAgentSessionOwnerForTab: () => 'local',
  structuredAgentSessionTargetForHost: () => ({ kind: 'local' })
}))
vi.mock('@/runtime/structured-agent-session-client', () => ({
  readStructuredAgentSessionConversationOutline: vi.fn(async () => ({ entries: [] }))
}))
vi.mock('../../../../shared/agent-session/view/structured-agent-session-tab', () => ({
  isStructuredTab: () => true
}))

describe('a chat card stays the real chat', () => {
  afterEach(() => {
    cleanup()
    useBoardChatOwner.setState({ tabIds: {} })
    mounts.count = 0
    mounts.unmounts = 0
  })

  it('does not remount when focus comes and goes', async () => {
    const { BoardChatLive } = await import('./BoardChatLive')
    const view = (focused: boolean) => (
      <BoardChatLive
        worktreeId="wt"
        tabId="tab"
        sessionId="s"
        focused={focused}
        onScreen
        wide={false}
      />
    )
    const { rerender } = render(view(false))
    await act(async () => undefined)
    expect(mounts.count).toBe(1)
    expect(mounts.last?.isFocusedGroup).toBe(false)
    rerender(view(true))
    expect(mounts.last?.isFocusedGroup).toBe(true)
    rerender(view(false))
    await act(async () => undefined)
    expect(mounts.count).toBe(1)
    expect(mounts.unmounts).toBe(0)
  })

  it('stays mounted and only lowers its updates when off screen', async () => {
    const { BoardChatLive } = await import('./BoardChatLive')
    const { rerender } = render(
      <BoardChatLive worktreeId="wt" tabId="tab" sessionId="s" focused={false} onScreen wide />
    )
    await act(async () => undefined)
    rerender(
      <BoardChatLive
        worktreeId="wt"
        tabId="tab"
        sessionId="s"
        focused={false}
        onScreen={false}
        wide
      />
    )
    expect(mounts.last?.isVisible).toBe(false)
    expect(mounts.count).toBe(1)
  })

  it('holds the tab while mounted and gives it back on close', async () => {
    const { BoardChatLive } = await import('./BoardChatLive')
    const { unmount } = render(
      <BoardChatLive worktreeId="wt" tabId="tab" sessionId="s" focused={false} onScreen wide />
    )
    await act(async () => undefined)
    expect(isHeldByBoard(useBoardChatOwner.getState(), 'tab')).toBe(true)
    unmount()
    expect(isHeldByBoard(useBoardChatOwner.getState(), 'tab')).toBe(false)
  })

  it('lets several cards hold their chats at once', () => {
    const a = claimBoardChat('a')
    claimBoardChat('b')
    expect(isHeldByBoard(useBoardChatOwner.getState(), 'a')).toBe(true)
    expect(isHeldByBoard(useBoardChatOwner.getState(), 'b')).toBe(true)
    a()
    expect(isHeldByBoard(useBoardChatOwner.getState(), 'a')).toBe(false)
    expect(isHeldByBoard(useBoardChatOwner.getState(), 'b')).toBe(true)
  })

  it('routes wheel over an unfocused chat to the board and over a focused one to the chat', () => {
    const base = {
      modified: false,
      insideCardBody: true,
      insideFocusedCard: false,
      canScrollHere: true
    }
    expect(boardWheelRoute({ ...base, insideLockedBody: true })).toBe('pan')
    expect(boardWheelRoute({ ...base, insideLockedBody: false, insideFocusedCard: true })).toBe(
      'card'
    )
    expect(boardWheelRoute({ ...base, modified: true, insideLockedBody: true })).toBe('zoom')
  })

  it('keeps a chat fully live only when focused or readable on screen', () => {
    const card = { x: 0, y: 0, w: 100, h: 100 }
    const view = { x: 0, y: 0, w: 1000, h: 1000 }
    expect(chatStaysLive(card, view, 0.5, false)).toBe(true)
    expect(chatStaysLive(card, view, 0.1, false)).toBe(false)
    expect(chatStaysLive(card, { ...view, x: 5000 }, 1, false)).toBe(false)
    expect(chatStaysLive(card, { ...view, x: 5000 }, 0.1, true)).toBe(true)
  })
})

describe('card titles', () => {
  const terminal = (title: string) =>
    ({ key: 'k', title, branch: 'b', handle: 'h' }) as BoardTerminal

  it('uses the role name, and drops status marks when there is none', () => {
    expect(cardDisplayTitle(terminal('Claude Chat'), { k: 'IG' })).toBe('IG')
    expect(cardDisplayTitle(terminal('✳ 전략기획 역할 설정'), undefined)).toBe('전략기획 역할 설정')
    expect(boardTerminalTitle(terminal('⠂ QA'))).toBe('QA')
    expect(boardTerminalTitle(terminal('✳'))).toBe('b')
  })
})
