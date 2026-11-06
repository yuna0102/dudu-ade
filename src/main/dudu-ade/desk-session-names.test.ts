import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseDeskSessionNames, readDeskSessionNames } from './desk-session-names'

let folder = ''
afterEach(async () => {
  if (folder) {
    await rm(folder, { recursive: true, force: true })
  }
  folder = ''
})

describe('role names from the desk file', () => {
  it('maps conversations to pane names and skips what is malformed', () => {
    const text = JSON.stringify({
      panes: [
        { name: 'Operation', session: 'abc', cwd: '/x' },
        { name: '', session: 'empty' },
        { name: 'NoSession' },
        null,
        { name: 7, session: 'num' }
      ]
    })
    expect(parseDeskSessionNames(text)).toEqual({ abc: 'Operation' })
  })

  it('gives an empty table for anything that is not a desk file', () => {
    expect(parseDeskSessionNames('nope')).toEqual({})
    expect(parseDeskSessionNames('[]')).toEqual({})
    expect(parseDeskSessionNames('{"panes":3}')).toEqual({})
  })

  it('ignores a missing file, a link and a file that is too large', async () => {
    folder = await mkdtemp(join(tmpdir(), 'desk-'))
    const good = join(folder, 'desk.json')
    await writeFile(good, JSON.stringify({ panes: [{ name: 'QA', session: 's' }] }))
    expect(await readDeskSessionNames(good)).toEqual({ s: 'QA' })
    expect(await readDeskSessionNames(join(folder, 'none.json'))).toEqual({})
    await symlink(good, join(folder, 'link.json'))
    expect(await readDeskSessionNames(join(folder, 'link.json'))).toEqual({})
    await writeFile(join(folder, 'big.json'), 'x'.repeat(1024 * 1024 + 1))
    expect(await readDeskSessionNames(join(folder, 'big.json'))).toEqual({})
  })
})
