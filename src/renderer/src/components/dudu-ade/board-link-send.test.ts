import { describe, expect, it } from 'vitest'
import { withoutAutoFiling } from './board-areas'
import { cardLabelLayout } from './board-card-label'
import { emptyBoardLayout } from './board-layout-state'
import {
  NUDGE_COOLDOWN_MS,
  isLinkApplied,
  linkFingerprint,
  nudgeMessage,
  receiverRuleMessage,
  ruleMessages,
  senderRuleMessage,
  shouldNudge
} from './board-link-send'

const from = { name: 'UX', handle: 'term_ux', isChat: false }
const to = { name: 'APP_dev', handle: 'term_dev', isChat: false }
const rule = '컨펌된 시안은 APP_dev 로 넘긴다.'

describe('rule messages', () => {
  it('tells the sender the rule, the form and how to reach the other window', () => {
    const message = senderRuleMessage(rule, from, to, false)
    expect(
      message.startsWith(
        '[보드 규칙] UX -> APP_dev: 컨펌된 시안은 APP_dev 로 넘긴다. 이 조건이 되면 [넘김] 5줄 양식'
      )
    ).toBe(true)
    expect(message).toContain('상대 창 이름은 APP_dev 이다')
    expect(message).toContain('`orca terminal list` 로 제목이 APP_dev 인 창의 handle 을 찾아서')
    expect(message).toContain('`orca terminal send --terminal <handle> --text ... --enter`')
    // A handle goes stale on restart, so it is only a note beside the lasting instruction.
    expect(message).toContain('지금 handle 은 참고용 term_dev')
    expect(message).not.toContain('--terminal term_dev')
  })

  it('tells a window to drop a handle it wrote down when the rule is sent again', () => {
    expect(senderRuleMessage(rule, from, to, true)).toContain('적어 둔 handle 이 있으면 지우고')
    expect(senderRuleMessage(rule, from, to, false)).not.toContain('적어 둔 handle')
    expect(receiverRuleMessage(rule, from, to, true)).toContain('적어 둔 handle 이 있으면 지우고')
  })

  it('tells the receiver what will arrive and to hand back', () => {
    const message = receiverRuleMessage(rule, from, to, false)
    expect(message).toContain('이런 규칙으로 UX 에서 일이 넘어온다')
    expect(message).toContain('term_ux')
  })

  it('marks a changed rule as an update, and sends nothing without a rule', () => {
    expect(ruleMessages({ rule }, from, to, true)?.toSender).toContain('[보드 규칙 갱신]')
    expect(ruleMessages({ rule: '  ' }, from, to, false)).toBeNull()
  })

  it('gives both windows the sender message when the rule runs both ways', () => {
    const messages = ruleMessages({ rule, twoWay: true }, from, to, false)!
    expect(messages.toReceiver).toContain('APP_dev -> UX')
    expect(messages.toReceiver).toContain('term_ux')
  })

  it('hands out the chat command for a chat window', () => {
    const message = senderRuleMessage(
      rule,
      from,
      { ...to, isChat: true, chatSessionId: 'claude_dev' },
      false
    )
    expect(message).not.toContain('orca terminal send')
    expect(message).toContain('orca chat send --session claude_dev --text')
  })

  it('shows not applied again after the rule changes', () => {
    const link = { id: 'l', from: 'a', to: 'b', rule }
    const applied = { ...link, appliedFingerprint: linkFingerprint(link) }
    expect(isLinkApplied(applied)).toBe(true)
    expect(isLinkApplied({ ...applied, rule: '다른 규칙' })).toBe(false)
    expect(isLinkApplied({ ...applied, twoWay: true })).toBe(false)
    expect(isLinkApplied(link)).toBe(false)
  })
})

describe('finish nudge', () => {
  const base = { id: 'l', from: 'a', to: 'b', rule, trigger: 'on-finish' as const }
  const link = { ...base, appliedFingerprint: linkFingerprint(base) }
  const finished = {
    link,
    before: 'working' as const,
    now: 'waiting' as const,
    echoPending: false,
    lastNudgeAt: undefined,
    time: 100_000
  }

  it('nudges when an applied rule sees the sender finish', () => {
    expect(shouldNudge(finished)).toBe(true)
    expect(nudgeMessage(rule, from, to)).toContain(
      '규칙 확인: 지금 끝난 작업이 규칙 조건에 맞으면 넘겨라'
    )
  })

  it('stays quiet for manual rules, unapplied rules and non-finishes', () => {
    expect(shouldNudge({ ...finished, link: { ...link, trigger: 'manual' } })).toBe(false)
    expect(shouldNudge({ ...finished, link: { ...link, appliedFingerprint: undefined } })).toBe(
      false
    )
    expect(shouldNudge({ ...finished, before: 'waiting' })).toBe(false)
    expect(shouldNudge({ ...finished, now: 'attention' })).toBe(false)
  })

  it('does not loop: the finish a nudge caused does not count', () => {
    expect(shouldNudge({ ...finished, echoPending: true })).toBe(false)
  })

  it('waits out the cooldown', () => {
    expect(shouldNudge({ ...finished, lastNudgeAt: 100_000 - NUDGE_COOLDOWN_MS + 1 })).toBe(false)
    expect(shouldNudge({ ...finished, lastNudgeAt: 100_000 - NUDGE_COOLDOWN_MS })).toBe(true)
  })
})

describe('floating card label', () => {
  it('keeps real screen size by undoing the board zoom', () => {
    expect(cardLabelLayout(0.25, 640).scale).toBe(4)
    expect(cardLabelLayout(0.25, 640).maxWidth).toBe(160)
  })

  it('never gets too narrow to read, and steps aside once the title bar is readable', () => {
    expect(cardLabelLayout(0.1, 200).maxWidth).toBe(60)
    expect(cardLabelLayout(0.5, 640).visible).toBe(true)
    expect(cardLabelLayout(1, 640).visible).toBe(false)
  })
})

describe('auto classify', () => {
  it('releases terminals for filing again but keeps drawn areas and non-terminal cards', () => {
    const board = {
      ...emptyBoardLayout(),
      categories: [
        { id: 'auto', name: '자동', color: '#000', anchor: { x: 0, y: 0 } },
        {
          id: 'drawn',
          name: '영역',
          color: '#000',
          anchor: { x: 0, y: 0 },
          rect: { x: 0, y: 0, w: 9, h: 9 }
        }
      ],
      categoryOf: { t1: 'auto', t2: 'drawn', t3: null, 'note:1': 'auto' }
    }
    expect(withoutAutoFiling(board).categoryOf).toEqual({ t2: 'drawn', 'note:1': 'auto' })
  })
})
