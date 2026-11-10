import type { BoardTerminal } from './board-terminal-listing'
import type { CollectedAssetSource } from './dudu-ade-store-types'

/** What an asset added by hand to this card records as its producer. */
export function sourceOf(terminal: BoardTerminal | undefined): CollectedAssetSource | undefined {
  return terminal
    ? {
        terminalTitle: terminal.paneTitle ?? terminal.title,
        worktreeId: terminal.worktreeId,
        worktreePath: terminal.worktreePath,
        branch: terminal.branch,
        tabId: terminal.tabId,
        leafId: terminal.leafId
      }
    : undefined
}
