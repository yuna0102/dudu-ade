import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises'
import { join } from 'node:path'

const LAYOUT_FILE = 'board-layout.json'
const BACKUP_PATTERN = /^board-layout-\d{4}-\d{4}\.json$/
const KEEP_BACKUPS = 10
export const MAX_LAYOUT_BYTES = 2 * 1024 * 1024

/** The only two kinds of file this writes: the saved layout and its dated backups. */
export function isLayoutFileName(name: string): boolean {
  return name === LAYOUT_FILE || BACKUP_PATTERN.test(name)
}

export function layoutBackupName(now: Date): string {
  const two = (value: number): string => String(value).padStart(2, '0')
  return `board-layout-${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}.json`
}

/** Oldest backups beyond the newest `keep`; other files in the folder are never named. */
export function backupsToDelete(
  files: readonly { name: string; mtime: number }[],
  keep = KEEP_BACKUPS
): string[] {
  return files
    .filter((file) => BACKUP_PATTERN.test(file.name))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(keep)
    .map((file) => file.name)
}

/** Only a restore layout is saved: JSON with the layout version and a source line, within the size limit. */
export function isValidLayoutText(text: unknown): text is string {
  if (typeof text !== 'string' || text.length === 0 || Buffer.byteLength(text) > MAX_LAYOUT_BYTES) {
    return false
  }
  try {
    const parsed: unknown = JSON.parse(text)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      [1, 2].includes((parsed as { version?: unknown }).version as number) &&
      typeof (parsed as { source?: unknown }).source === 'string'
    )
  } catch {
    return false
  }
}

export async function readLayoutText(folder: string): Promise<string | null> {
  const path = join(folder, LAYOUT_FILE)
  try {
    const info = await lstat(path)
    return info.isFile() && info.size <= MAX_LAYOUT_BYTES ? await readFile(path, 'utf8') : null
  } catch {
    return null
  }
}

/** Keeps the layout being replaced as a dated backup (an earlier backup in the same minute is not overwritten), then writes. */
export async function saveLayoutText(folder: string, text: unknown, now: Date): Promise<boolean> {
  if (!isValidLayoutText(text)) {
    return false
  }
  const target = join(folder, LAYOUT_FILE)
  await mkdir(folder, { recursive: true })
  const existing = await lstat(target).catch(() => null)
  if (existing && !existing.isFile()) {
    return false
  }
  if (existing) {
    await copyFile(target, join(folder, layoutBackupName(now)), 1).catch(() => undefined)
  }
  await writeFile(target, text)
  const names = (await readdir(folder)).filter((name) => BACKUP_PATTERN.test(name))
  const files = await Promise.all(
    names.map(async (name) => ({ name, mtime: (await stat(join(folder, name))).mtimeMs }))
  )
  await Promise.all(
    backupsToDelete(files).map((name) => unlink(join(folder, name)).catch(() => undefined))
  )
  return true
}
