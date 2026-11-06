import { execFile } from 'node:child_process'
import { open, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import type { TerminalAgentModel } from '../../shared/dudu-ade-terminal-models'
import { recentTerminalHandoffs, recordTerminalHandoff } from './terminal-handoffs'
import { registerBoardMarkdownHandlers } from './board-markdown'
import { registerBoardRestoreHandler } from './board-restore'
import { registerTranscriptAssetHandlers } from './transcript-assets'
import { registerArtifactPageHandlers } from './artifact-page-protocol'

const TAIL_BYTES = 256 * 1024
const PS_TIMEOUT_MS = 4_000

type ClaudeProcess = { pid: number; command: string }
export type ClaudePane = ClaudeProcess & { paneKey: string; configDir: string }
type CachedModel = { mtimeMs: number; size: number; model: string | null }

// Session logs only change when a turn lands; unchanged files cost one stat.
const modelByLogPath = new Map<string, CachedModel>()

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: PS_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => resolve(error ? '' : stdout)
    )
  })
}

/** `claude` CLI processes (native binary or a path ending in /claude) from `ps -o pid=,command=`. */
export function parseClaudeProcesses(psOutput: string): ClaudeProcess[] {
  const found: ClaudeProcess[] = []
  for (const line of psOutput.split('\n')) {
    const match = /^\s*(\d+)\s+(\S+)(.*)$/.exec(line)
    if (!match) {
      continue
    }
    const executable = match[2]
    if (executable === 'claude' || executable.endsWith('/claude')) {
      found.push({ pid: Number(match[1]), command: `${executable}${match[3]}` })
    }
  }
  return found
}

/** Reads one env var out of `ps eww` output (values containing spaces are cut at the first space). */
export function envValue(psEnvLine: string, name: string): string | null {
  return new RegExp(`(?:^|\\s)${name}=(\\S+)`).exec(psEnvLine)?.[1] ?? null
}

export function effortFromCommand(command: string): string | null {
  return /\s--effort[\s=](\S+)/.exec(command)?.[1] ?? null
}

/** `-n <name>` from the command line; ps drops the quotes, so the name runs to the next flag. */
export function nameFromCommand(command: string): string | null {
  return /\s(?:-n|--name)[\s=]+([^-\s][^]*?)(?=\s+--?[a-zA-Z]|$)/.exec(command)?.[1]?.trim() || null
}

/** Claude Code names a project folder after its cwd with every non-alphanumeric character as '-'. */
export function claudeProjectDirName(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

/**
 * Newest assistant model in a session log tail. Only the `model` field is matched; message text is
 * never parsed or kept.
 */
export function lastAssistantModel(tail: string): string | null {
  const lines = tail.split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (!line.includes('"type":"assistant"')) {
      continue
    }
    const model = /"model":"([^"]{1,80})"/.exec(line)?.[1]
    if (model && model !== '<synthetic>') {
      return model
    }
  }
  return null
}

async function readTail(path: string, size: number): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const length = Math.min(size, TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    return buffer.toString('utf8')
  } finally {
    await handle.close()
  }
}

async function sessionIdOf(configDir: string, pid: number): Promise<string | null> {
  try {
    const session = JSON.parse(
      await readFile(join(configDir, 'sessions', `${pid}.json`), 'utf8')
    ) as { sessionId?: unknown }
    return typeof session.sessionId === 'string' ? session.sessionId : null
  } catch {
    return null
  }
}

async function sessionLogModel(configDir: string, pid: number): Promise<string | null> {
  try {
    const session = JSON.parse(
      await readFile(join(configDir, 'sessions', `${pid}.json`), 'utf8')
    ) as {
      sessionId?: unknown
      cwd?: unknown
    }
    if (typeof session.sessionId !== 'string' || typeof session.cwd !== 'string') {
      return null
    }
    const logPath = join(
      configDir,
      'projects',
      claudeProjectDirName(session.cwd),
      `${session.sessionId}.jsonl`
    )
    const info = await stat(logPath)
    const cached = modelByLogPath.get(logPath)
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
      return cached.model
    }
    // A turn without an assistant line yet keeps the previous model.
    const model = lastAssistantModel(await readTail(logPath, info.size)) ?? cached?.model ?? null
    modelByLogPath.set(logPath, { mtimeMs: info.mtimeMs, size: info.size, model })
    return model
  } catch {
    return null
  }
}

/** Running Claude Code processes that belong to an Orca pane, with their config folder. */
export async function readClaudePanes(): Promise<ClaudePane[]> {
  if (process.platform === 'win32') {
    return []
  }
  const processes = parseClaudeProcesses(await run('ps', ['-axww', '-o', 'pid=,command=']))
  if (processes.length === 0) {
    return []
  }
  const envOutput = await run('ps', [
    'eww',
    '-o',
    'pid=,command=',
    '-p',
    processes.map((entry) => entry.pid).join(',')
  ])
  const envByPid = new Map<number, string>()
  for (const line of envOutput.split('\n')) {
    const pid = Number(/^\s*(\d+)/.exec(line)?.[1])
    if (pid) {
      envByPid.set(pid, line)
    }
  }
  return processes.flatMap(({ pid, command }) => {
    const env = envByPid.get(pid) ?? ''
    const paneKey = envValue(env, 'ORCA_PANE_KEY')
    return paneKey
      ? [
          {
            pid,
            command,
            paneKey,
            configDir: envValue(env, 'CLAUDE_CONFIG_DIR') ?? join(homedir(), '.claude')
          }
        ]
      : []
  })
}

/** Model and effort per Orca pane key (`tabId:leafId`) for every running Claude Code process. */
export async function readTerminalAgentModels(): Promise<Record<string, TerminalAgentModel>> {
  const result: Record<string, TerminalAgentModel> = {}
  await Promise.all(
    (await readClaudePanes()).map(async ({ pid, command, paneKey, configDir }) => {
      const model =
        (await sessionLogModel(configDir, pid)) ?? /\s--model[\s=](\S+)/.exec(command)?.[1] ?? null
      const sessionId = await sessionIdOf(configDir, pid)
      const resumeId = /\s--resume[\s=](\S+)/.exec(command)?.[1]
      const name = nameFromCommand(command)
      result[paneKey] = {
        model,
        effort: effortFromCommand(command),
        ...(sessionId ? { sessionId } : {}),
        ...(resumeId ? { resumeId } : {}),
        ...(name ? { name } : {})
      }
    })
  )
  return result
}

export function registerDuduAdeHandlers(getProjectRoots: () => string[] = () => []): void {
  registerBoardMarkdownHandlers(getProjectRoots)
  registerBoardRestoreHandler()
  registerTranscriptAssetHandlers(readClaudePanes)
  registerArtifactPageHandlers()
  ipcMain.handle('duduAde:terminalAgentModels', () => readTerminalAgentModels())
  ipcMain.handle('duduAde:terminalHandoffs', () => recentTerminalHandoffs())
  ipcMain.handle('duduAde:recordHandoff', (_event, from: unknown, to: unknown) => {
    if (typeof from === 'string' && typeof to === 'string') {
      recordTerminalHandoff(from, to)
    }
  })
}
