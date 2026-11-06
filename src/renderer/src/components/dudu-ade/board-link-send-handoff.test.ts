import { afterEach, describe, expect, it, vi } from 'vitest'
import { attemptStructuredAgentSessionSend } from '../native-chat/structured-agent-session-send-attempt'
import { sendToCard } from './board-link-send'
import type { BoardTerminal } from './board-terminal-listing'

vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn() }))
vi.mock('../native-chat/structured-agent-session-send-attempt', () => ({
  attemptStructuredAgentSessionSend: vi.fn()
}))

const chat = { handle: 'tab-1', chat: { sessionId: 's' } } as BoardTerminal

describe('a board message to a chat', () => {
  afterEach(() => vi.unstubAllGlobals())
  const record = vi.fn()
  const stub = (answer: unknown): void => {
    record.mockClear()
    vi.mocked(attemptStructuredAgentSessionSend).mockResolvedValue(answer as never)
    vi.stubGlobal('window', { api: { shell: { duduAdeRecordHandoff: record } } })
  }

  it('shows on the board like a terminal send', async () => {
    stub({ kind: 'sent' })
    expect(await sendToCard(chat, 'hi', 'term-9')).toBe(true)
    expect(record).toHaveBeenCalledWith('term-9', 'tab-1')
  })

  it('records nothing when it was not sent or has no sender', async () => {
    stub({ kind: 'not-sent' })
    expect(await sendToCard(chat, 'hi', 'term-9')).toBe(false)
    stub({ kind: 'sent' })
    await sendToCard(chat, 'hi')
    expect(record).not.toHaveBeenCalled()
  })
})
