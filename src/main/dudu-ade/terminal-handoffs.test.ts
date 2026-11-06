import { describe, expect, it } from 'vitest'
import { recentTerminalHandoffs, recordTerminalHandoff } from './terminal-handoffs'

describe('terminal handoffs', () => {
  it('keeps recent sends between different terminals only', () => {
    recordTerminalHandoff('a', 'a', 1_000)
    recordTerminalHandoff('', 'b', 1_000)
    recordTerminalHandoff('a', 'b', 1_000)
    expect(recentTerminalHandoffs(2_000)).toEqual([{ from: 'a', to: 'b', at: 1_000 }])
    expect(recentTerminalHandoffs(40_000)).toEqual([])
  })
})
