import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { app, dialog, ipcMain } from 'electron'
import type {
  BoardMarkdownRead,
  BoardMarkdownWrite,
  RecentMarkdown
} from '../../shared/dudu-ade-terminal-models'
import {
  isAllowedMarkdownPath,
  markdownFileStem,
  realPathStaysAllowed,
  todayFolder,
  uniqueMarkdownPath
} from './board-markdown-paths'

const RECENT_LIMIT = 30
const WALK_DEPTH = 4
const WALK_FILE_LIMIT = 2000
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'out', 'build'])

const outRoot = (): string => join(homedir(), 'projects', '_out')
const approvedFile = (): string => join(app.getPath('userData'), 'dudu-ade-board-markdown.json')

/** Files the user chose keep working after a restart, so the choice is kept in the main process. */
function loadApproved(): Set<string> {
  try {
    const saved: unknown = JSON.parse(readFileSync(approvedFile(), 'utf8'))
    return new Set(Array.isArray(saved) ? saved.filter((path) => typeof path === 'string') : [])
  } catch {
    return new Set()
  }
}

async function walkMarkdown(root: string): Promise<RecentMarkdown[]> {
  const found: RecentMarkdown[] = []
  let budget = WALK_FILE_LIMIT
  const visit = async (dir: string, depth: number): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (budget <= 0 || entry.name.startsWith('.')) {
        continue
      }
      budget -= 1
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < WALK_DEPTH && !SKIPPED_DIRS.has(entry.name)) {
          await visit(path, depth + 1)
        }
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const info = await stat(path).catch(() => null)
        if (info) {
          found.push({ path, name: entry.name, mtime: info.mtimeMs })
        }
      }
    }
  }
  await visit(root, 0)
  return found
}

/** Every path comes from the renderer, which must not reach beyond the rules in board-markdown-paths. */
export function registerBoardMarkdownHandlers(getProjectRoots: () => string[]): void {
  const approved = loadApproved()
  // Listed by this process during this run; becomes approved only when the user picks one.
  const offered = new Set<string>()
  const approve = (path: string): void => {
    approved.add(path)
    try {
      writeFileSync(approvedFile(), JSON.stringify([...approved]))
    } catch {
      // Still approved for this run.
    }
  }
  const check = async (path: unknown): Promise<string | null> => {
    if (!isAllowedMarkdownPath(path, { outRoot: outRoot(), approved })) {
      return null
    }
    if (approved.has(path)) {
      return path
    }
    const realOutRoot = await realpath(outRoot()).catch(() => outRoot())
    const realFolder = await realpath(dirname(path)).catch(() => null)
    const realFile = await realpath(path).catch(() => path)
    return realFolder && realPathStaysAllowed(realFile, realFolder, { realOutRoot, approved })
      ? path
      : null
  }

  ipcMain.handle('duduAde:readOutIndex', async () => ({
    outRoot: outRoot(),
    text: await readFile(join(outRoot(), 'INDEX.md'), 'utf8').catch(() => '')
  }))

  ipcMain.handle('duduAde:pickMarkdown', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    const path = result.canceled ? undefined : result.filePaths[0]
    if (!path || !path.toLowerCase().endsWith('.md')) {
      return null
    }
    approve(path)
    return path
  })

  ipcMain.handle('duduAde:recentMarkdown', async (): Promise<RecentMarkdown[]> => {
    const lists = await Promise.all([outRoot(), ...getProjectRoots()].map(walkMarkdown))
    const recent = lists
      .flat()
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, RECENT_LIMIT)
    for (const { path } of recent) {
      offered.add(path)
    }
    return recent
  })

  ipcMain.handle('duduAde:adoptMarkdown', (_event, path: unknown): boolean => {
    if (typeof path !== 'string' || !offered.has(path)) {
      return false
    }
    approve(path)
    return true
  })

  ipcMain.handle(
    'duduAde:createMarkdown',
    async (_event, name: unknown): Promise<string | null> => {
      const stem = markdownFileStem(name)
      if (!stem) {
        return null
      }
      const folder = todayFolder(outRoot(), new Date())
      await mkdir(folder, { recursive: true })
      const path = uniqueMarkdownPath(folder, stem, existsSync)
      // wx: a file that appeared since the check is never overwritten.
      await writeFile(path, `# ${stem}\n`, { flag: 'wx' })
      return path
    }
  )

  ipcMain.handle(
    'duduAde:readMarkdown',
    async (_event, path: unknown): Promise<BoardMarkdownRead> => {
      const allowedPath = await check(path)
      if (!allowedPath) {
        return { status: 'denied' }
      }
      try {
        const info = await stat(allowedPath)
        return { status: 'ok', content: await readFile(allowedPath, 'utf8'), mtime: info.mtimeMs }
      } catch {
        return { status: 'missing' }
      }
    }
  )

  ipcMain.handle(
    'duduAde:writeMarkdown',
    async (
      _event,
      args: { path?: unknown; content?: unknown; expectedMtime?: unknown }
    ): Promise<BoardMarkdownWrite> => {
      const allowedPath = await check(args?.path)
      if (!allowedPath || typeof args.content !== 'string') {
        return { status: 'denied' }
      }
      const info = await stat(allowedPath).catch(() => null)
      if (!info) {
        return { status: 'missing' }
      }
      if (info.mtimeMs !== args.expectedMtime) {
        return { status: 'conflict' }
      }
      await writeFile(allowedPath, args.content)
      return { status: 'ok', mtime: (await stat(allowedPath)).mtimeMs }
    }
  )
}
