import { lstat, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import { DESK_FILE, readDeskSessionNames } from './desk-session-names'
import { readLayoutText, saveLayoutText } from './board-layout-file'

const MAX_SEED_BYTES = 2 * 1024 * 1024

/** The only file this reads: a restore layout the user made, at a fixed place. The renderer cannot name a path. */
export const BOARD_RESTORE_FILE = join(
  homedir(),
  'projects',
  '_out',
  'dudu-ade',
  'board-restore-1105.json'
)

/** The file's text, or null when it is missing, a link, not a plain file or too large. */
export async function readRestoreSeedText(path: string): Promise<string | null> {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.size > MAX_SEED_BYTES) {
      return null
    }
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * Where the saved layout and its backups live; the renderer sends only the text, never a path. Only the
 * installed app uses the real folder: a dev run or e2e on an isolated profile must never overwrite it.
 */
export function boardLayoutFolder(): string {
  return app.isPackaged
    ? join(homedir(), 'projects', '_out', 'dudu-ade')
    : join(app.getPath('userData'), 'board-layout')
}

export function registerBoardRestoreHandler(): void {
  ipcMain.handle('duduAde:readBoardRestore', () =>
    app.isPackaged ? readRestoreSeedText(BOARD_RESTORE_FILE) : null
  )
  ipcMain.handle('duduAde:readBoardLayout', () => readLayoutText(boardLayoutFolder()))
  ipcMain.handle('duduAde:writeBoardLayout', (_event, text: unknown) =>
    saveLayoutText(boardLayoutFolder(), text, new Date()).catch(() => false)
  )
  ipcMain.handle('duduAde:deskSessionNames', () =>
    app.isPackaged ? readDeskSessionNames(DESK_FILE) : {}
  )
}
