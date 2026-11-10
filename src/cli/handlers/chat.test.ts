import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeClient } from '../runtime-client'
import { CHAT_HANDLERS } from './chat'

function run(call: ReturnType<typeof vi.fn>) {
  return CHAT_HANDLERS['chat send']({
    flags: new Map([
      ['session', 'claude_1'],
      ['text', 'hello']
    ]),
    client: { call } as unknown as RuntimeClient,
    json: false
  } as never)
}

const answers = (history: unknown, send?: unknown) =>
  vi.fn(async (method: string) => ({
    result: method === 'agentSession.history' ? history : send
  }))

afterEach(() => vi.restoreAllMocks())

describe('orca chat send', () => {
  it('sends with the fence the session serves, queued if it is working', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const call = answers(
      { ok: true, page: { fence: 7 } },
      { ok: true, value: { clientMessageId: 'm1' } }
    )
    await run(call)
    const [method, params] = call.mock.calls[1] as unknown as [string, Record<string, never>]
    expect(method).toBe('agentSession.send')
    expect(params.delivery).toBe('queue-if-active')
    expect(params.envelope).toMatchObject({ sessionId: 'claude_1', expectedRuntimeFence: 7 })
  })

  it('says so when the session has no fence, sending nothing', async () => {
    const call = answers({ ok: true, page: {} })
    await expect(run(call)).rejects.toThrow('is not open')
    expect(call).toHaveBeenCalledOnce()
  })

  it('reports a refusal', async () => {
    const call = answers(
      { ok: true, page: { fence: 1 } },
      { ok: false, refusal: { code: 'agent_session_conflict', message: 'held' } }
    )
    await expect(run(call)).rejects.toThrow('held')
  })
})
