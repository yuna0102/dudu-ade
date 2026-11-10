import { appendFileSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, ipcMain: { handle: vi.fn() } }))

import { isPersonalCwd, readLinesFrom, refsInLine, updateLogState } from './transcript-assets'

const line = (entry: unknown): Buffer => Buffer.from(JSON.stringify(entry))
const write = (path: string, name = 'Write'): string =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-11-05T00:00:00.000Z',
    message: { content: [{ type: 'tool_use', name, input: { file_path: path, content: 'x' } }] }
  })

const bashLine = (command: string, cwd = '/w'): Buffer =>
  line({
    type: 'assistant',
    cwd,
    timestamp: '2026-11-05T00:00:00.000Z',
    message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] }
  })

describe('refsInLine from shell commands', () => {
  it('takes what a command wrote as a pending mention, with the command time', () => {
    expect(refsInLine(bashLine('cp a.png out/b.png && echo x > n.md'), '/h')).toEqual([
      {
        location: '/w/out/b.png',
        kind: 'image',
        at: Date.parse('2026-11-05T00:00:00.000Z'),
        mentioned: true,
        bash: true
      },
      {
        location: '/w/n.md',
        kind: 'markdown',
        at: Date.parse('2026-11-05T00:00:00.000Z'),
        mentioned: true,
        bash: true
      }
    ])
  })

  it('drops other kinds and personal paths, and a command that wrote nothing', () => {
    expect(refsInLine(bashLine('ls -la'), '/h')).toEqual([])
    expect(refsInLine(bashLine('echo a > run.log'), '/h')).toEqual([])
    expect(refsInLine(bashLine('echo a > /Users/x/.claude/memory.md'), '/h')).toEqual([])
  })
})

describe('refsInLine', () => {
  it('takes Write and Edit targets of tracked kinds with the line time, and nothing else', () => {
    expect(refsInLine(Buffer.from(write('/a/b.png')))).toEqual([
      { location: '/a/b.png', kind: 'image', at: Date.parse('2026-11-05T00:00:00.000Z') }
    ])
    expect(refsInLine(Buffer.from(write('/a/b.md', 'Edit')))[0]?.kind).toBe('markdown')
    expect(refsInLine(Buffer.from(write('/a/b.ts')))).toEqual([])
    expect(refsInLine(Buffer.from(write('/a/b.png', 'Read')))).toEqual([])
  })

  it('marks paths only named in a reply as mentions, and keeps text out', () => {
    const reply = line({
      type: 'assistant',
      cwd: '/w',
      message: { content: [{ type: 'text', text: 'saved ~/out/a.mp4 and ./b.png, secret words' }] }
    })
    expect(refsInLine(reply, '/h').map(({ location, mentioned }) => [location, mentioned])).toEqual(
      [
        ['/h/out/a.mp4', true],
        ['/w/b.png', true]
      ]
    )
  })

  it('drops agent memory and excluded folders', () => {
    vi.stubEnv('DUDU_ADE_EXCLUDE_DIRS', '/Users/x/private,/Users/x/vault/notes')
    expect(refsInLine(Buffer.from(write('/Users/x/.claude/projects/m/MEMORY.md')))).toEqual([])
    expect(refsInLine(Buffer.from(write('/Users/x/.claude-other/a.md')))).toEqual([])
    expect(refsInLine(Buffer.from(write('/Users/x/private/a.md')))).toEqual([])
    expect(refsInLine(Buffer.from(write('/Users/x/vault/notes/a.md')))).toEqual([])
    vi.unstubAllEnvs()
  })

  it('reads artifact links from conversation lines but not the system prompt or a listing', () => {
    const url = 'https://claude.ai/code/artifact/abc-123'
    expect(
      refsInLine(
        line({ type: 'assistant', message: { content: [{ type: 'text', text: url }] } })
      ).map((ref) => ref.location)
    ).toEqual([url])
    expect(refsInLine(line({ type: 'api-request-shape', message: { content: url } }))).toEqual([])
    const listing = ['a', 'b', 'c', 'd'].map((id) => `https://claude.ai/artifact/${id}`).join(' ')
    expect(refsInLine(line({ type: 'user', message: { content: listing } }))).toEqual([])
  })

  it('survives a broken line', () => {
    expect(refsInLine(Buffer.from('{"type":"assistant","name":"Write"'))).toEqual([])
  })
})

describe('isPersonalCwd', () => {
  it('matches the folder and below only', () => {
    const dirs = ['/h/projects/private']
    expect(isPersonalCwd('/h/projects/private', dirs)).toBe(true)
    expect(isPersonalCwd('/h/projects/private/sub', dirs)).toBe(true)
    expect(isPersonalCwd('/h/projects/private-2', dirs)).toBe(false)
    expect(isPersonalCwd('/h/projects/private', [])).toBe(false)
  })
})

describe('log reading', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const temp = (): string => {
    dir = mkdtempSync(join(tmpdir(), 'transcript-assets-'))
    return join(dir, 'log.jsonl')
  }

  it('leaves an unfinished line for the next read', async () => {
    const path = temp()
    writeFileSync(path, 'one\ntwo\nthr')
    const lines: string[] = []
    const offset = await readLinesFrom(path, 0, (found) => lines.push(found.toString()))
    expect(lines).toEqual(['one', 'two'])
    expect(offset).toBe(8)
    appendFileSync(path, 'ee\n')
    const more: string[] = []
    expect(await readLinesFrom(path, offset, (found) => more.push(found.toString()))).toBe(14)
    expect(more).toEqual(['three'])
  })

  it('joins a line across chunks and skips one over the size limit', async () => {
    const path = temp()
    const long = 'x'.repeat(3 * 1024 * 1024)
    const huge = 'y'.repeat(33 * 1024 * 1024)
    writeFileSync(path, `${long}\n${huge}\nend\n`)
    const lengths: number[] = []
    await readLinesFrom(path, 0, (found) => lengths.push(found.length))
    expect(lengths).toEqual([long.length, 3])
  })

  it('keeps a mentioned file only if it exists', async () => {
    const path = temp()
    const real = join(dir, 'real.png')
    writeFileSync(real, 'x')
    const reply = (text: string): string =>
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
    writeFileSync(path, `${reply(real)}\n${reply(join(dir, 'gone.png'))}\n`)
    const logs: Record<string, { refs: { location: string }[] }> = {}
    await updateLogState(logs as never, path)
    expect(logs[path].refs.map((ref) => ref.location)).toEqual([real])
  })

  it('keeps a shell target only when the file is there and was written after the command', async () => {
    const path = temp()
    const made = join(dir, 'made.png')
    const old = join(dir, 'old.png')
    writeFileSync(made, 'x')
    writeFileSync(old, 'x')
    utimesSync(old, new Date('2020-01-01'), new Date('2020-01-01'))
    const command = (target: string): string =>
      JSON.stringify({
        type: 'assistant',
        cwd: dir,
        timestamp: new Date().toISOString(),
        message: {
          content: [{ type: 'tool_use', name: 'Bash', input: { command: `cp s.png ${target}` } }]
        }
      })
    writeFileSync(path, `${[made, old, join(dir, 'never.png')].map(command).join('\n')}\n`)
    const logs: Record<string, { refs: { location: string }[] }> = {}
    await updateLogState(logs as never, path)
    expect(logs[path].refs.map((ref) => ref.location)).toEqual([made])
  })

  it('continues from the offset, keeps earlier references, and restarts on a shrunken log', async () => {
    const path = temp()
    writeFileSync(path, `${write('/a/one.png')}\n`)
    const logs = {}
    expect(await updateLogState(logs, path)).toBe(true)
    expect(await updateLogState(logs, path)).toBe(false)
    appendFileSync(path, `${write('/a/two.png')}\n${write('/a/one.png')}\n`)
    expect(await updateLogState(logs, path)).toBe(true)
    expect(logs[path].refs.map((ref: { location: string }) => ref.location)).toEqual([
      '/a/one.png',
      '/a/two.png'
    ])
    writeFileSync(path, `${write('/a/three.png')}\n`)
    await updateLogState(logs, path)
    expect(logs[path].refs.map((ref: { location: string }) => ref.location)).toEqual([
      '/a/three.png'
    ])
  })
})
