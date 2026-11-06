import { describe, expect, it } from 'vitest'
import {
  isAllowedMarkdownPath,
  markdownFileStem,
  realPathStaysAllowed,
  todayFolder,
  uniqueMarkdownPath
} from './board-markdown-paths'

const outRoot = '/home/me/projects/_out'
const allowed = { outRoot, approved: new Set(['/home/me/notes/picked.md']) }

describe('which files a card may touch', () => {
  it('allows Markdown under the results folder and files the user chose', () => {
    expect(isAllowedMarkdownPath(`${outRoot}/dudu-ade/1105/a.md`, allowed)).toBe(true)
    expect(isAllowedMarkdownPath('/home/me/notes/picked.md', allowed)).toBe(true)
  })

  it('refuses other extensions, other folders and climbing paths', () => {
    expect(isAllowedMarkdownPath(`${outRoot}/page.html`, allowed)).toBe(false)
    expect(isAllowedMarkdownPath(`${outRoot}/.env`, allowed)).toBe(false)
    expect(isAllowedMarkdownPath('/home/me/.ssh/config.md', allowed)).toBe(false)
    expect(isAllowedMarkdownPath(`${outRoot}/../../secret.md`, allowed)).toBe(false)
    expect(isAllowedMarkdownPath(`${outRoot}-evil/a.md`, allowed)).toBe(false)
    expect(isAllowedMarkdownPath('a.md', allowed)).toBe(false)
    expect(isAllowedMarkdownPath(`${outRoot}/a\0.md`, allowed)).toBe(false)
    expect(isAllowedMarkdownPath(42, allowed)).toBe(false)
  })

  it('refuses a symlink that leads out of the results folder', () => {
    const real = { realOutRoot: outRoot, approved: new Set<string>() }
    expect(realPathStaysAllowed(`${outRoot}/x/a.md`, `${outRoot}/x`, real)).toBe(true)
    expect(realPathStaysAllowed('/home/me/repo/a.md', '/home/me/repo', real)).toBe(false)
    expect(
      realPathStaysAllowed('/home/me/repo/a.md', '/home/me/repo', {
        ...real,
        approved: new Set(['/home/me/repo/a.md'])
      })
    ).toBe(true)
  })
})

describe('new file names', () => {
  it('strips folders and hidden prefixes, and keeps Korean', () => {
    expect(markdownFileStem(' 회의 메모.md ')).toBe('회의 메모')
    expect(markdownFileStem('../../etc/passwd')).toBe('-..-etc-passwd')
    expect(markdownFileStem('.hidden')).toBe('hidden')
    expect(markdownFileStem('   ')).toBeNull()
    expect(markdownFileStem(null)).toBeNull()
  })

  it('numbers a taken name instead of overwriting', () => {
    const taken = new Set(['/o/a.md', '/o/a-2.md'])
    expect(uniqueMarkdownPath('/o', 'a', (path) => taken.has(path))).toBe('/o/a-3.md')
    expect(uniqueMarkdownPath('/o', 'b', (path) => taken.has(path))).toBe('/o/b.md')
  })

  it('files new documents by date', () => {
    expect(todayFolder(outRoot, new Date(2026, 10, 5))).toBe(`${outRoot}/dudu-ade/1105`)
  })
})
