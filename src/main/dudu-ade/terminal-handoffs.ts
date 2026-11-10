import type { TerminalHandoff } from '../../shared/dudu-ade-terminal-models'

const KEEP_MS = 30_000
const MAX_KEPT = 50
let recent: TerminalHandoff[] = []

/** Board arrows only: a terminal-to-terminal send seen by this host, kept briefly in memory. */
export function recordTerminalHandoff(from: string, to: string, now = Date.now()): void {
  if (!from || from === to) {
    return
  }
  recent = [...recent.filter((handoff) => now - handoff.at < KEEP_MS), { from, to, at: now }].slice(
    -MAX_KEPT
  )
}

export function recentTerminalHandoffs(now = Date.now()): TerminalHandoff[] {
  return recent.filter((handoff) => now - handoff.at < KEEP_MS)
}
