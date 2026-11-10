import { describe, expect, it } from 'vitest'
import { computeAgentLaunchFingerprint } from '../agent-launch-operation'
import { AgentLaunch } from './agent-launch-params'

const launch = {
  agent: 'claude',
  target: { kind: 'existing', worktree: 'path:/x' },
  surface: 'chat',
  resumeFrom: { providerSessionId: 'conv-1' }
}

describe('agent.launch resumeFrom', () => {
  it('keeps the conversation for a chat', () => {
    expect(AgentLaunch.parse(launch).resumeFrom).toEqual({ providerSessionId: 'conv-1' })
  })

  it.each([
    ['a terminal', { surface: 'terminal' }],
    ['no explicit surface', { surface: undefined }],
    ['a prompt', { prompt: { text: 'hi', delivery: 'submit' } }]
  ])('refuses %s', (_name, change) => {
    expect(AgentLaunch.safeParse({ ...launch, ...change }).success).toBe(false)
  })

  it('names another launch for another conversation', () => {
    const fingerprint = (providerSessionId: string): string =>
      computeAgentLaunchFingerprint({
        agent: 'claude',
        target: { kind: 'existing', worktree: 'path:/x' },
        resumeFrom: { providerSessionId }
      } as never)
    expect(fingerprint('a')).not.toBe(fingerprint('b'))
  })
})
