export type MarkdownDisk = { status: 'ok'; mtime: number } | { status: 'missing' | 'denied' }

/**
 * What to do with a fresh look at the file. An outside change simply reloads, unless there are unsaved
 * edits: then neither side wins and the user is told, because saving would destroy the other version.
 */
export function markdownSyncAction(args: {
  disk: MarkdownDisk
  knownMtime: number | null
  dirty: boolean
}): 'none' | 'reload' | 'conflict' | 'missing' | 'denied' {
  const { disk, knownMtime, dirty } = args
  if (disk.status !== 'ok') {
    return disk.status
  }
  if (disk.mtime === knownMtime) {
    return 'none'
  }
  return dirty ? 'conflict' : 'reload'
}
