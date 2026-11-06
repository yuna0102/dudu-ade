import { mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  backupsToDelete,
  isLayoutFileName,
  isValidLayoutText,
  layoutBackupName,
  readLayoutText,
  saveLayoutText
} from './board-layout-file'

let folder = ''
afterEach(async () => {
  if (folder) {
    await rm(folder, { recursive: true, force: true })
  }
  folder = ''
})
const layout = (source: string): string => JSON.stringify({ version: 1, source })
const when = new Date(2026, 10, 5, 16, 7)

describe('which files are written', () => {
  it('allows only the layout and its dated backups', () => {
    expect(isLayoutFileName('board-layout.json')).toBe(true)
    expect(isLayoutFileName('board-layout-1105-1607.json')).toBe(true)
    expect(isLayoutFileName('board-restore-1105.json')).toBe(false)
    expect(isLayoutFileName('../board-layout.json')).toBe(false)
    expect(isLayoutFileName('board-layout-1105.json')).toBe(false)
    expect(layoutBackupName(when)).toBe('board-layout-1105-1607.json')
  })

  it('accepts only a layout file of the right version within the size limit', () => {
    expect(isValidLayoutText(layout('a'))).toBe(true)
    expect(isValidLayoutText('not json')).toBe(false)
    expect(isValidLayoutText(JSON.stringify({ version: 2, source: 'a' }))).toBe(true)
    expect(isValidLayoutText(JSON.stringify({ version: 3, source: 'a' }))).toBe(false)
    expect(isValidLayoutText(JSON.stringify({ version: 1 }))).toBe(false)
    expect(isValidLayoutText('')).toBe(false)
    expect(isValidLayoutText(42)).toBe(false)
    expect(isValidLayoutText(`{"version":1,"source":"${'x'.repeat(2 * 1024 * 1024)}"}`)).toBe(false)
  })

  it('names only the oldest backups beyond the newest ten', () => {
    const backups = Array.from({ length: 12 }, (_, index) => ({
      name: `board-layout-1105-${String(1000 + index)}.json`,
      mtime: index
    }))
    const files = [
      ...backups,
      { name: 'board-layout.json', mtime: -1 },
      { name: 'notes.md', mtime: -2 }
    ]
    expect(backupsToDelete(files)).toEqual([backups[1].name, backups[0].name])
    expect(backupsToDelete(files)).not.toContain('board-layout.json')
    expect(backupsToDelete(files.slice(0, 5))).toEqual([])
  })
})

describe('saving', () => {
  it('writes the layout and keeps the one it replaces as a dated backup', async () => {
    folder = await mkdtemp(join(tmpdir(), 'layout-'))
    expect(await saveLayoutText(folder, layout('first'), when)).toBe(true)
    expect(await readdir(folder)).toEqual(['board-layout.json'])
    expect(await saveLayoutText(folder, layout('second'), when)).toBe(true)
    expect(await readFile(join(folder, 'board-layout.json'), 'utf8')).toBe(layout('second'))
    expect(await readFile(join(folder, 'board-layout-1105-1607.json'), 'utf8')).toBe(
      layout('first')
    )
    expect(await readLayoutText(folder)).toBe(layout('second'))
  })

  it('does not overwrite a backup made in the same minute', async () => {
    folder = await mkdtemp(join(tmpdir(), 'layout-'))
    await saveLayoutText(folder, layout('first'), when)
    await saveLayoutText(folder, layout('second'), when)
    await saveLayoutText(folder, layout('third'), when)
    expect(await readFile(join(folder, 'board-layout-1105-1607.json'), 'utf8')).toBe(
      layout('first')
    )
  })

  it('keeps only the newest ten backups and leaves other files alone', async () => {
    folder = await mkdtemp(join(tmpdir(), 'layout-'))
    await writeFile(join(folder, 'notes.md'), 'mine')
    for (let index = 0; index < 12; index += 1) {
      const name = `board-layout-1101-${String(1000 + index)}.json`
      await writeFile(join(folder, name), layout(String(index)))
      await utimes(join(folder, name), 1000 + index, 1000 + index)
    }
    await saveLayoutText(folder, layout('current'), when)
    await saveLayoutText(folder, layout('next'), new Date(2026, 10, 5, 16, 8))
    const names = await readdir(folder)
    expect(names.filter((name) => name.startsWith('board-layout-'))).toHaveLength(10)
    expect(names).toContain('notes.md')
    expect(names).not.toContain('board-layout-1101-1000.json')
  })

  it('refuses bad text and a layout path that is not a plain file', async () => {
    folder = await mkdtemp(join(tmpdir(), 'layout-'))
    expect(await saveLayoutText(folder, 'junk', when)).toBe(false)
    await writeFile(join(folder, 'real.json'), '{}')
    await symlink(join(folder, 'real.json'), join(folder, 'board-layout.json'))
    expect(await saveLayoutText(folder, layout('x'), when)).toBe(false)
    expect(await readFile(join(folder, 'real.json'), 'utf8')).toBe('{}')
    expect(await readLayoutText(folder)).toBeNull()
  })
})
