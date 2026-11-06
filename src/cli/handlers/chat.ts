import { randomUUID } from 'node:crypto'
import type {
  AgentSessionHistoryResult,
  AgentSessionMutationResult,
  AgentSessionSendResult
} from '../../shared/agent-session/agent-session-wire'
import {
  structuredAgentSessionMessageSendMutation,
  structuredAgentSessionSendBody
} from '../../shared/agent-session/requests/structured-agent-session-send-mutation'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

export const CHAT_HANDLERS: Record<string, CommandHandler> = {
  'chat send': async ({ flags, client, json }) => {
    const sessionId = getRequiredStringFlag(flags, 'session')
    const text = getRequiredStringFlag(flags, 'text')
    const history = await client.call<AgentSessionHistoryResult>('agentSession.history', {
      sessionId,
      direction: 'tail',
      limit: 1
    })
    const fence =
      history.result.page.fence ?? (history.result.ok ? undefined : history.result.fence)
    if (typeof fence !== 'number') {
      throw new RuntimeClientError('invalid_argument', `Chat session "${sessionId}" is not open.`)
    }
    const sent = await client.call<AgentSessionMutationResult<AgentSessionSendResult>>(
      'agentSession.send',
      structuredAgentSessionMessageSendMutation({
        sessionId,
        clientOperationId: randomUUID(),
        expectedRuntimeFence: fence,
        body: structuredAgentSessionSendBody(text, []),
        delivery: 'queue-if-active'
      })
    )
    if (!sent.result.ok) {
      throw new RuntimeClientError(sent.result.refusal.code, sent.result.refusal.message)
    }
    printResult(
      { ...sent, result: { sessionId, messageId: sent.result.value.clientMessageId } },
      json,
      (result) => `sent to chat ${result.sessionId}`
    )
  }
}
