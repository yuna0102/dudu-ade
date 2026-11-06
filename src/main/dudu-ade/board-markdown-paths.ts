import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

const MAX_NAME_LENGTH = 80

export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/** The only files a board card may touch: Markdown under the results folder, or one the user chose. */
export function isAllowedMarkdownPath(
  path: unknown,
  allowed: { outRoot: string; approved: ReadonlySet<string> }
): path is string {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) {
    return false
  }
  const normal = resolve(path)
  return (
    normal === path &&
    normal.toLowerCase().endsWith('.md') &&
    (allowed.approved.has(normal) || isInside(allowed.outRoot, normal))
  )
}

/** A file name from what the user typed: no folders, no hidden files, always .md. Null when nothing usable is left. */
export function markdownFileStem(name: unknown): string | null {
  if (typeof name !== 'string') {
    return null
  }
  const stem = name
    .trim()
    .replace(/\.md$/i, '')
    // eslint-disable-next-line no-control-regex -- control characters are what this strips
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
  return stem || null
}

/** First free name in the folder: 메모.md, then 메모-2.md; an existing file is never reused. */
export function uniqueMarkdownPath(
  folder: string,
  stem: string,
  exists: (path: string) => boolean
): string {
  let path = join(folder, `${stem}.md`)
  for (let number = 2; exists(path); number += 1) {
    path = join(folder, `${stem}-${number}.md`)
  }
  return path
}

export function todayFolder(outRoot: string, now: Date): string {
  const stamp = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return join(outRoot, 'dudu-ade', stamp)
}

/** A symlink inside the results folder must not carry a write out of it, unless the target itself was chosen. */
export function realPathStaysAllowed(
  realPath: string,
  realFolder: string,
  allowed: { realOutRoot: string; approved: ReadonlySet<string> }
): boolean {
  return (
    allowed.approved.has(realPath) ||
    realFolder === allowed.realOutRoot ||
    isInside(allowed.realOutRoot, realFolder) ||
    dirname(realPath) === allowed.realOutRoot
  )
}
