import { resolve, sep } from 'node:path'

/**
 * Dudu ADE runs beside the official Orca. Agent hook configs and scripts outside this app's own
 * userData (~/.claude, ~/.codex, ~/.orca/agent-hooks, ...) belong to the official app, so the fork never writes them.
 */
export function isDuduAdeOwnedAgentConfigPath(targetPath: string): boolean {
  const userData = process.env.ORCA_USER_DATA_PATH
  if (!userData) {
    return false
  }
  const root = resolve(userData)
  const target = resolve(targetPath)
  return target === root || target.startsWith(`${root}${sep}`)
}
