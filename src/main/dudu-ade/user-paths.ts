import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Where Dudu ADE keeps and finds the user's files. Order: environment variable, then
 * ~/.dudu-ade/config.json, then a default under the home folder. The config file exists because an app
 * opened from the Dock or Finder does not see shell variables.
 */
type UserConfig = { outDir?: unknown; deskFile?: unknown; excludeDirs?: unknown }

const readConfig = (home: string): UserConfig => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(home, '.dudu-ade', 'config.json'), 'utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as UserConfig) : {}
  } catch {
    return {}
  }
}

const expandHome = (value: string, home: string): string =>
  value === '~' ? home : value.startsWith('~/') ? join(home, value.slice(2)) : value

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

/** Folder for the markdown cards, artifact pages, INDEX.md and the saved board layout. */
export function outRoot(home = homedir()): string {
  const chosen = text(process.env.DUDU_ADE_OUT_DIR) ?? text(readConfig(home).outDir)
  return chosen ? expandHome(chosen, home) : join(home, 'dudu-ade')
}

/** Optional desk.json (pane name and conversation id); when it is missing, role names are simply not shown. */
export function deskFile(home = homedir()): string {
  const chosen = text(process.env.DUDU_ADE_DESK_FILE) ?? text(readConfig(home).deskFile)
  return chosen ? expandHome(chosen, home) : join(home, '.dudu-ade', 'desk.json')
}

/** Folders whose files and conversations never become board assets. Empty unless the user lists some. */
export function excludedDirs(home = homedir()): string[] {
  const fromEnv = text(process.env.DUDU_ADE_EXCLUDE_DIRS)?.split(',')
  const fromFile = readConfig(home).excludeDirs
  const list = fromEnv ?? (Array.isArray(fromFile) ? fromFile : [])
  return list
    .map((item) => text(item))
    .filter((item): item is string => item !== null)
    .map((item) => expandHome(item, home).replace(/\/+$/, ''))
}

/** True when the path is one of the excluded folders or inside one. */
export function isExcludedPath(path: string, dirs = excludedDirs()): boolean {
  return dirs.some((dir) => path === dir || path.startsWith(`${dir}/`))
}
