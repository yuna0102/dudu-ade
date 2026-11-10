import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  closeUnifiedTab: vi.fn(),
  fork: vi.fn(async () => {}),
  list: vi.fn(),
  probe: vi.fn(),
  toast: vi.fn(),
  status: undefined as string | undefined
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({ closeUnifiedTab: mocks.closeUnifiedTab, settings: {} })
  }
}))
vi.mock('../tab-bar/tab-session-history-switch', () => ({
  resolveTabSessionHistorySubject: () => ({ kind: 'chat' })
}))
vi.mock('../tab-bar/native-chat-cli-fork-run', () => ({ runNativeChatCliFork: mocks.fork }))
vi.mock('../terminal/pty-running-work-probe', () => ({ probePtyRunningWork: mocks.probe }))
vi.mock('./board-terminal-listing', () => ({ listLocalBoardTerminals: mocks.list }))
vi.mock('@/runtime/structured-agent-session-status-feed', () => ({
  getStructuredAgentSessionStatusFeed: () => ({
    getSnapshot: () => new Map([['s1', { status: mocks.status }]])
  })
}))
vi.mock('./dudu-ade-store', () => ({
  useDuduAdeStore: {
    getState: () => ({ panel: null, carryCard: vi.fn(), removeCard: vi.fn(), openPanel: vi.fn() })
  }
}))

import { forkedAgentIsUp, runBoardChatToTerminal } from './board-chat-carry'
import type { BoardTerminal } from './board-terminal-listing'

const chat = {
  key: 'w::chat-tab::chat',
  tabId: 'chat-tab',
  worktreeId: 'w',
  chat: { sessionId: 's1' }
} as unknown as BoardTerminal
const forked = { key: 'w::new::leaf', tabId: 'new', worktreeId: 'w', ptyId: 'p', connected: true }
const start = (): Promise<void> =>
  runBoardChatToTerminal({ chat, sessionId: 's1', agent: 'claude' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.status = undefined
  mocks.list.mockResolvedValueOnce([]).mockResolvedValue([forked])
})

describe('chat to terminal', () => {
  it('counts only the agent in the foreground as up', () => {
    expect(forkedAgentIsUp({ verdict: 'live', foregroundProcess: 'claude' } as never)).toBe(true)
    expect(forkedAgentIsUp({ verdict: 'live', foregroundProcess: 'zsh' } as never)).toBe(false)
    expect(forkedAgentIsUp({ verdict: 'exited' } as never)).toBe(false)
    expect(forkedAgentIsUp(undefined)).toBe(false)
  })

  it('closes the chat tab once the terminal is up', async () => {
    mocks.probe.mockResolvedValue([{ verdict: 'live', foregroundProcess: 'claude' }])
    await start()
    expect(mocks.closeUnifiedTab).toHaveBeenCalledWith('chat-tab')
  })

  it('keeps the chat tab while the chat is still working', async () => {
    mocks.status = 'working'
    mocks.probe.mockResolvedValue([{ verdict: 'live', foregroundProcess: 'claude' }])
    await start()
    expect(mocks.closeUnifiedTab).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledOnce()
  })

  it('keeps the chat tab when the terminal never proves up', async () => {
    vi.useFakeTimers()
    mocks.probe.mockResolvedValue([{ verdict: 'live', foregroundProcess: 'zsh' }])
    const done = start()
    await vi.runAllTimersAsync()
    await done
    vi.useRealTimers()
    expect(mocks.closeUnifiedTab).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledOnce()
  })

  it('closes nothing when the fork produced no terminal', async () => {
    vi.useFakeTimers()
    mocks.list.mockReset()
    mocks.list.mockResolvedValue([])
    const done = start()
    await vi.runAllTimersAsync()
    await done
    vi.useRealTimers()
    expect(mocks.probe).not.toHaveBeenCalled()
    expect(mocks.closeUnifiedTab).not.toHaveBeenCalled()
  })
})
