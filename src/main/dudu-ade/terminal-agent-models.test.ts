import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import {
  claudeProjectDirName,
  effortFromCommand,
  envValue,
  lastAssistantModel,
  parseClaudeProcesses
} from './terminal-agent-models'

describe('terminal agent models', () => {
  it('finds claude CLI processes only', () => {
    const ps = [
      '  101 claude -n IG --effort medium --resume abc',
      '  102 /usr/local/bin/claude --resume x',
      '  103 node /tmp/claude-helper.js',
      '  104 zsh'
    ].join('\n')
    expect(parseClaudeProcesses(ps).map((entry) => entry.pid)).toEqual([101, 102])
    expect(effortFromCommand('claude -n IG --effort medium --resume abc')).toBe('medium')
    expect(effortFromCommand('claude --resume abc')).toBeNull()
  })

  it('reads env vars out of ps eww output', () => {
    const line = '101 claude --resume a ORCA_PANE_KEY=tab-1:leaf-2 CLAUDE_CONFIG_DIR=/x/.c HOME=/h'
    expect(envValue(line, 'ORCA_PANE_KEY')).toBe('tab-1:leaf-2')
    expect(envValue(line, 'CLAUDE_CONFIG_DIR')).toBe('/x/.c')
    expect(envValue(line, 'MISSING')).toBeNull()
  })

  it('maps a cwd to the Claude Code project folder name', () => {
    expect(claudeProjectDirName('/Users/me/projects/houme_agent/a.b')).toBe(
      '-Users-me-projects-houme-agent-a-b'
    )
  })

  it('takes the newest real assistant model from a log tail', () => {
    const tail = [
      '{"type":"assistant","message":{"model":"claude-opus-5-5","content":"hi"}}',
      '{"type":"user","message":{"content":"x"}}',
      '{"type":"assistant","message":{"model":"claude-fable-5-1"}}',
      '{"type":"assistant","message":{"model":"<synthetic>"}}',
      '{"type":"user"'
    ].join('\n')
    expect(lastAssistantModel(tail)).toBe('claude-fable-5-1')
    expect(lastAssistantModel('{"type":"user"}')).toBeNull()
  })
})
