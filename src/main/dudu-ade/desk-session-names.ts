import { lstat, readFile } from 'node:fs/promises'
import { deskFile } from './user-paths'

const MAX_DESK_BYTES = 1024 * 1024

/** The only file this reads; the renderer gets just the table, never a path or the rest of the file. */
export const DESK_FILE = deskFile()

/** Conversation id to role name; anything malformed is skipped and a foreign file gives an empty table. */
export function parseDeskSessionNames(text: string): Record<string, string> {
  try {
    const desk = JSON.parse(text) as { panes?: unknown }
    if (!Array.isArray(desk.panes)) {
      return {}
    }
    return Object.fromEntries(
      desk.panes.flatMap((pane: { name?: unknown; session?: unknown }) =>
        typeof pane?.name === 'string' &&
        pane.name &&
        typeof pane.session === 'string' &&
        pane.session
          ? [[pane.session, pane.name]]
          : []
      )
    )
  } catch {
    return {}
  }
}

export async function readDeskSessionNames(path: string): Promise<Record<string, string>> {
  try {
    const info = await lstat(path)
    return info.isFile() && info.size <= MAX_DESK_BYTES
      ? parseDeskSessionNames(await readFile(path, 'utf8'))
      : {}
  } catch {
    return {}
  }
}
