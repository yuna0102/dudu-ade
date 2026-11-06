import { describe, expect, it } from 'vitest'
import { agentBucket, modelDistribution, modelFamily, modelShortLabel } from './board-agent-labels'

describe('board agent labels', () => {
  it('names model families shortly, including Fable', () => {
    expect(modelShortLabel('claude-opus-5-5')).toBe('Opus')
    expect(modelShortLabel('claude-sonnet-4-5-20250929')).toBe('Sonnet')
    expect(modelShortLabel('claude-haiku-4-5')).toBe('Haiku')
    expect(modelShortLabel('claude-fable-5-1')).toBe('Fable')
    expect(modelFamily('claude-fable-5-1')).toBe('fable')
    expect(modelShortLabel('gpt-5')).toBe('gpt-5')
  })

  it('summarizes a category model mix, most used first', () => {
    expect(
      modelDistribution(['claude-opus-5-5', 'claude-fable-5-1', 'claude-opus-5-5', null])
    ).toBe('Opus 2, Fable 1')
  })

  it('buckets states for the mission map', () => {
    expect(agentBucket('working')).toBe('working')
    expect(agentBucket('permission')).toBe('attention')
    expect(agentBucket('done')).toBe('waiting')
    expect(agentBucket(undefined)).toBe('waiting')
  })
})
