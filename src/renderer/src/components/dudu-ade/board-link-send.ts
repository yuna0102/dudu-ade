import { createBrowserUuid } from '@/lib/browser-uuid'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { structuredAgentSessionSendBody } from '../../../../shared/agent-session/requests/structured-agent-session-send-mutation'
import { attemptStructuredAgentSessionSend } from '../native-chat/structured-agent-session-send-attempt'
import type { BoardAgentBucket } from './board-agent-labels'
import type { BoardLink } from './board-layout-state'
import { isLinkApplied } from './board-link-rule'
import type { BoardTerminal } from './board-terminal-listing'

export const NUDGE_COOLDOWN_MS = 60_000

export const LINK_RULE_TEMPLATES: { name: string; rule: string }[] = [
  {
    name: '컨펌된 시안 넘기기',
    rule: '사용자가 localhost 확인까지 끝내고 컨펌한 시안은 개발 창으로 넘겨 실제 올라갈 코드로 구현한다'
  },
  {
    name: '구현 완료 점검 요청',
    rule: '구현이 끝나면 QA 가 예외 케이스, 안정성, 보안을 점검해 권장 목록을 돌려준다'
  },
  {
    name: '권장 목록 반영',
    rule: 'QA 가 돌려준 권장 목록을 개발 창이 반영한다. 막음 등급은 꼭 반영하고, 반영하지 않는 항목은 이유를 적는다'
  },
  {
    name: 'PR 전 검수',
    rule: 'QA 반영이 끝나면 Code_review 가 PR 전 검수와 코드 최적화를 한다'
  }
]

const HANDOFF_FORM =
  '[넘김] 5줄 양식(보내는 역할 -> 받는 역할 / 대상 / 한 일, 요청 / 판단 필요 / 다음 단계)'

export type LinkEnd = { name: string; handle: string; isChat: boolean; chatSessionId?: string }

const cleanRule = (rule: string): string => rule.trim().replace(/[.。]+$/, '')

/** By name, not handle: a handle changes on every restart, so one written down goes stale and sends nowhere. */
function reachBy(other: LinkEnd): string {
  return other.isChat
    ? `상대 창 이름은 ${other.name} 이고 채팅 창이다. 보낼 때는 \`orca chat send --session ${other.chatSessionId} --text ...\` 로 보낸다`
    : `상대 창 이름은 ${other.name} 이다. 보낼 때마다 \`orca terminal list\` 로 제목이 ${other.name} 인 창의 handle 을 찾아서 \`orca terminal send --terminal <handle> --text ... --enter\` 로 보낸다(지금 handle 은 참고용 ${other.handle}, 재시작하면 바뀌니 적어 두지 않는다)`
}

const STALE_HANDLE_NOTE = ' 전에 받은 안내나 메모에 적어 둔 handle 이 있으면 지우고 이 방법을 쓴다.'

/** What the sending window is told: the rule, the form, and how to reach the other window. It judges and sends by itself. */
export function senderRuleMessage(
  rule: string,
  from: LinkEnd,
  to: LinkEnd,
  update: boolean
): string {
  const tag = update ? '[보드 규칙 갱신]' : '[보드 규칙]'
  return `${tag} ${from.name} -> ${to.name}: ${cleanRule(rule)}. 이 조건이 되면 ${HANDOFF_FORM}으로 상대 창에 직접 보내라. ${reachBy(to)}.${update ? STALE_HANDLE_NOTE : ''}`
}

/** What the receiving window is told: what will arrive, and to hand the result back the same way. */
export function receiverRuleMessage(
  rule: string,
  from: LinkEnd,
  to: LinkEnd,
  update: boolean
): string {
  const tag = update ? '[보드 규칙 갱신]' : '[보드 규칙]'
  return `${tag} ${from.name} -> ${to.name}: ${cleanRule(rule)}. 이런 규칙으로 ${from.name} 에서 일이 넘어온다. 받으면 끝난 뒤 ${HANDOFF_FORM}으로 되돌려 준다. ${reachBy(from)}.${update ? STALE_HANDLE_NOTE : ''}`
}

export function nudgeMessage(rule: string, from: LinkEnd, to: LinkEnd): string {
  return `규칙 확인: 지금 끝난 작업이 규칙 조건에 맞으면 넘겨라. ${from.name} -> ${to.name}: ${cleanRule(rule)}`
}

/** One message per window: both get the sender's message when the rule runs both ways. */
export function ruleMessages(
  link: Pick<BoardLink, 'rule' | 'twoWay'>,
  from: LinkEnd,
  to: LinkEnd,
  update: boolean
): { toSender: string; toReceiver: string } | null {
  const rule = link.rule?.trim()
  if (!rule) {
    return null
  }
  return {
    toSender: senderRuleMessage(rule, from, to, update),
    toReceiver: link.twoWay
      ? senderRuleMessage(rule, to, from, update)
      : receiverRuleMessage(rule, from, to, update)
  }
}

/**
 * Nudge a window when it finishes, if the rule asks for it. A nudge or rule notice itself makes the window
 * work and finish again, so that one finish is an echo and does not count; otherwise the board would loop.
 */
export function shouldNudge(args: {
  link: BoardLink
  names?: Readonly<Record<string, string>>
  before: BoardAgentBucket | undefined
  now: BoardAgentBucket | undefined
  echoPending: boolean
  lastNudgeAt: number | undefined
  time: number
}): boolean {
  return (
    args.link.trigger === 'on-finish' &&
    isLinkApplied(args.link, args.names) &&
    args.before === 'working' &&
    args.now === 'waiting' &&
    !args.echoPending &&
    (args.lastNudgeAt === undefined || args.time - args.lastNudgeAt >= NUDGE_COOLDOWN_MS)
  )
}

/** Terminals take the runtime's send, carrying the sender's handle when another window sends; chats take a chat message. */
export async function sendToCard(
  to: BoardTerminal,
  text: string,
  fromHandle?: string
): Promise<boolean> {
  if (to.chat) {
    const answer = await attemptStructuredAgentSessionSend({
      entry: {
        clientMessageId: createBrowserUuid(),
        sessionId: to.chat.sessionId,
        body: structuredAgentSessionSendBody(text, []),
        previewUris: [],
        queuedAt: Date.now(),
        delivery: 'queue-if-active',
        phase: 'sending',
        issued: false
      },
      target: { kind: 'local' },
      beforeIssue: () => undefined,
      abandoned: () => false,
      reconcile: () => undefined
    })
    const sent = answer !== null && answer.kind !== 'not-sent'
    if (sent && fromHandle) {
      void window.api.shell.duduAdeRecordHandoff?.(fromHandle, to.handle)
    }
    return sent
  }
  const result = await callRuntimeRpc<{ send: { accepted: boolean } }>(
    { kind: 'local' },
    'terminal.send',
    {
      terminal: to.handle,
      text,
      enter: true,
      agentPrompt: true,
      client: { id: 'orca-cli', type: 'desktop' },
      ...(fromHandle ? { fromTerminal: fromHandle } : {})
    }
  )
  return result.send.accepted
}

export { isLinkApplied, linkFingerprint } from './board-link-rule'
