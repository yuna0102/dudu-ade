import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false }, ipcMain: { handle: vi.fn() } }))
import { readRestoreSeedText } from './board-restore'

let folder: string | null = null
afterEach(async () => {
  if (folder) {
    await rm(folder, { recursive: true, force: true })
  }
  folder = null
})

describe('reading the restore file', () => {
  it('returns the text of a plain file and null for a missing one', async () => {
    folder = await mkdtemp(join(tmpdir(), 'restore-'))
    await writeFile(join(folder, 'a.json'), '{"version":1}')
    expect(await readRestoreSeedText(join(folder, 'a.json'))).toBe('{"version":1}')
    expect(await readRestoreSeedText(join(folder, 'none.json'))).toBeNull()
  })

  it('refuses a link, a folder and a file that is too large', async () => {
    folder = await mkdtemp(join(tmpdir(), 'restore-'))
    await writeFile(join(folder, 'real.json'), '{}')
    await symlink(join(folder, 'real.json'), join(folder, 'link.json'))
    await writeFile(join(folder, 'big.json'), 'x'.repeat(2 * 1024 * 1024 + 1))
    expect(await readRestoreSeedText(join(folder, 'link.json'))).toBeNull()
    expect(await readRestoreSeedText(folder)).toBeNull()
    expect(await readRestoreSeedText(join(folder, 'big.json'))).toBeNull()
  })
})
