/* eslint-disable max-lines -- one streaming and layout pass kept together; it has no natural seam */
import { createReadStream } from 'node:fs'
import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, normalize } from 'node:path'
import { app, ipcMain } from 'electron'
import {
  ARTIFACT_LINK_PATTERN,
  assetKindForPath,
  extractAssetReferences
} from '../../shared/dudu-ade-asset-kinds'
import type {
  TranscriptAssetRef,
  TranscriptAssetRequest,
  TranscriptAssets
} from '../../shared/dudu-ade-terminal-models'
import { claudeProjectDirName, type ClaudePane } from './terminal-agent-models'

const CHUNK_BYTES = 1024 * 1024
// A longer line is a pasted image or a giant tool result, never a Write worth the memory.
const MAX_LINE_BYTES = 32 * 1024 * 1024
// A tool result naming more links than this is a listing of old artifacts, not something this conversation made.
const MAX_LINKS_PER_USER_LINE = 3
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'Artifact'])
const SESSION_ID = /^[0-9a-fA-F-]{8,64}$/
// Only the work account's folder is ever read; the personal account has its own config folder.
const workConfigDir = (): string => join(homedir(), '.claude')
// Agent memory and the personal account's folders are not work products.
const NOT_ASSET_PATH =
  /\/\.claude(?:-[^/]*)?\/|\/memory-vault\/개인|\/projects\/personal-agent(?:\/|$)/

type LogState = { mtimeMs: number; size: number; offset: number; refs: TranscriptAssetRef[] }

export function isPersonalCwd(cwd: string, home = homedir()): boolean {
  const personal = join(home, 'projects', 'personal-agent')
  return cwd === personal || cwd.startsWith(`${personal}/`)
}

function isPersonalProjectDir(name: string, home = homedir()): boolean {
  const personal = claudeProjectDirName(join(home, 'projects', 'personal-agent'))
  return name === personal || name.startsWith(`${personal}-`)
}

export type LineRef = TranscriptAssetRef & {
  /** Only named in the agent's reply (Bash renders end up here); kept only if the file exists. */
  mentioned?: boolean
}

/** Paths a line's file tools touched or its reply names, and artifact links. Message text is parsed here and dropped. */
export function refsInLine(line: Buffer, home = homedir()): LineRef[] {
  const assistant = line.includes('"assistant"')
  const hasLink = line.includes('claude.ai/')
  if (!assistant && !hasLink) {
    return []
  }
  let entry: {
    type?: unknown
    timestamp?: unknown
    cwd?: unknown
    message?: { content?: unknown }
  }
  try {
    entry = JSON.parse(line.toString('utf8'))
  } catch {
    return []
  }
  // Other line types carry the system prompt, which is not this conversation's output.
  if (entry.type !== 'assistant' && entry.type !== 'user') {
    return []
  }
  const at = Date.parse(String(entry.timestamp)) || 0
  const refs: LineRef[] = []
  const content = entry.message?.content
  if (entry.type === 'assistant' && Array.isArray(content)) {
    for (const block of content as {
      type?: unknown
      name?: unknown
      text?: unknown
      input?: { file_path?: unknown }
    }[]) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        const context = { baseDir: typeof entry.cwd === 'string' ? entry.cwd : '', homeDir: home }
        for (const { kind, location } of extractAssetReferences([block.text], context)) {
          if (kind !== 'artifact-link' && !NOT_ASSET_PATH.test(location)) {
            refs.push({ location, kind, at, mentioned: true })
          }
        }
        continue
      }
      const filePath = block?.input?.file_path
      if (block?.type !== 'tool_use' || !FILE_TOOLS.has(String(block.name))) {
        continue
      }
      if (typeof filePath !== 'string' || !filePath.startsWith('/')) {
        continue
      }
      const location = normalize(filePath)
      const kind = assetKindForPath(location)
      if (kind && !NOT_ASSET_PATH.test(location)) {
        refs.push({ location, kind, at })
      }
    }
  }
  if (hasLink) {
    const links = new Set(JSON.stringify(content ?? '').match(ARTIFACT_LINK_PATTERN) ?? [])
    if (entry.type === 'assistant' || links.size <= MAX_LINKS_PER_USER_LINE) {
      for (const location of links) {
        refs.push({ location, kind: 'artifact-link', at })
      }
    }
  }
  return refs
}

/** Streams complete lines from `start` and returns the offset after the last one, so an unfinished line is read again next time. */
export async function readLinesFrom(
  path: string,
  start: number,
  onLine: (line: Buffer) => void
): Promise<number> {
  let position = start
  let consumed = start
  let carry: Buffer[] = []
  let carryBytes = 0
  let skipping = false
  for await (const value of createReadStream(path, { start, highWaterMark: CHUNK_BYTES })) {
    const chunk = value as Buffer
    let from = 0
    for (let end = chunk.indexOf(10, from); end !== -1; end = chunk.indexOf(10, from)) {
      if (!skipping) {
        const piece = chunk.subarray(from, end)
        onLine(carry.length > 0 ? Buffer.concat([...carry, piece]) : piece)
      }
      carry = []
      carryBytes = 0
      skipping = false
      from = end + 1
      consumed = position + from
    }
    if (!skipping && from < chunk.length) {
      const rest = chunk.subarray(from)
      if (carryBytes + rest.length > MAX_LINE_BYTES) {
        carry = []
        carryBytes = 0
        skipping = true
      } else {
        // Copied: the stream may reuse the chunk's memory.
        carry.push(Buffer.from(rest))
        carryBytes += rest.length
      }
    }
    position += chunk.length
    // Hands the main process back between chunks, so a 100MB log never holds up the UI.
    await new Promise((resolve) => setImmediate(resolve))
  }
  return consumed
}

/** Brings one log's references up to date; an unchanged file costs one stat. Returns whether anything changed. */
export async function updateLogState(
  logs: Record<string, LogState>,
  logPath: string
): Promise<boolean> {
  const info = await stat(logPath)
  const known = logs[logPath]
  if (known && known.mtimeMs === info.mtimeMs && known.size === info.size) {
    return false
  }
  // A shrunken log was rewritten, so its offset means nothing any more.
  const state: LogState =
    known && known.offset <= info.size ? known : { mtimeMs: 0, size: 0, offset: 0, refs: [] }
  const seen = new Set(state.refs.map((ref) => ref.location))
  const found = new Map<string, LineRef>()
  const offset = await readLinesFrom(logPath, state.offset, (line) => {
    for (const ref of refsInLine(line)) {
      // A real write outranks an earlier mention of the same file.
      if (
        !seen.has(ref.location) &&
        (!found.has(ref.location) || found.get(ref.location)?.mentioned)
      ) {
        found.set(
          ref.location,
          found.get(ref.location) ? { ...ref, at: found.get(ref.location)!.at } : ref
        )
      }
    }
  })
  const added: TranscriptAssetRef[] = []
  for (const { mentioned, ...ref } of found.values()) {
    if (
      !mentioned ||
      (await stat(ref.location)
        .then((file) => file.isFile())
        .catch(() => false))
    ) {
      added.push(ref)
    }
  }
  logs[logPath] = {
    mtimeMs: info.mtimeMs,
    size: info.size,
    offset,
    refs: [...state.refs, ...added]
  }
  return true
}

export function isLogState(value: unknown): value is LogState {
  const state = value as Partial<LogState> | null
  return (
    !!state &&
    typeof state.mtimeMs === 'number' &&
    typeof state.size === 'number' &&
    typeof state.offset === 'number' &&
    Array.isArray(state.refs)
  )
}

const stateFile = (): string => join(app.getPath('userData'), 'dudu-ade-transcript-assets.json')
let loadedLogs: Record<string, LogState> | null = null

async function loadLogs(): Promise<Record<string, LogState>> {
  if (loadedLogs) {
    return loadedLogs
  }
  try {
    const parsed = JSON.parse(await readFile(stateFile(), 'utf8')) as Record<string, unknown>
    loadedLogs = Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, LogState] => isLogState(entry[1]))
    )
  } catch {
    loadedLogs = {}
  }
  return loadedLogs
}

async function saveLogs(logs: Record<string, LogState>): Promise<void> {
  const temp = `${stateFile()}.tmp`
  await writeFile(temp, JSON.stringify(logs))
  await rename(temp, stateFile())
}

const chatLogPaths = new Map<string, string | null>()

/** A chat may have started in another folder than its workspace, so look its log up by id across the work account. */
async function findChatLog(sessionId: string): Promise<string | null> {
  if (chatLogPaths.get(sessionId)) {
    return chatLogPaths.get(sessionId) ?? null
  }
  const projects = join(workConfigDir(), 'projects')
  for (const dir of await readdir(projects).catch(() => [] as string[])) {
    if (isPersonalProjectDir(dir)) {
      continue
    }
    const logPath = join(projects, dir, `${sessionId}.jsonl`)
    if (await stat(logPath).catch(() => null)) {
      chatLogPaths.set(sessionId, logPath)
      return logPath
    }
  }
  return null
}

/** Personal-account processes and the personal folder are skipped here, before any log is opened. */
async function terminalLog(
  pane: ClaudePane
): Promise<{ sessionId: string; logPath: string } | null> {
  if (pane.configDir !== workConfigDir()) {
    return null
  }
  try {
    const session = JSON.parse(
      await readFile(join(pane.configDir, 'sessions', `${pane.pid}.json`), 'utf8')
    ) as { sessionId?: unknown; cwd?: unknown }
    if (
      typeof session.sessionId !== 'string' ||
      !SESSION_ID.test(session.sessionId) ||
      typeof session.cwd !== 'string' ||
      isPersonalCwd(session.cwd)
    ) {
      return null
    }
    return {
      sessionId: session.sessionId,
      logPath: join(
        pane.configDir,
        'projects',
        claudeProjectDirName(session.cwd),
        `${session.sessionId}.jsonl`
      )
    }
  } catch {
    return null
  }
}

/** Sub-agents keep their own logs beside the conversation; their Writes are this window's work too. */
async function withSubagentLogs(source: {
  paneKey: string
  sessionId: string
  logPath: string
}): Promise<(typeof source)[]> {
  const dir = join(source.logPath.replace(/\.jsonl$/, ''), 'subagents')
  const names = await readdir(dir).catch(() => [] as string[])
  return [
    source,
    ...names
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => ({
        paneKey: source.paneKey,
        sessionId: `${source.sessionId}/${name}`,
        logPath: join(dir, name)
      }))
  ]
}

async function readTranscriptAssets(
  readPanes: () => Promise<ClaudePane[]>,
  request: TranscriptAssetRequest
): Promise<TranscriptAssets> {
  const logs = await loadLogs()
  const sources: { paneKey: string; sessionId: string; logPath: string }[] = []
  for (const pane of await readPanes()) {
    const log = await terminalLog(pane)
    if (log) {
      sources.push({ paneKey: pane.paneKey, ...log })
    }
  }
  for (const { paneKey, providerSessionId } of request.chats) {
    const logPath = SESSION_ID.test(providerSessionId) ? await findChatLog(providerSessionId) : null
    if (logPath) {
      sources.push({ paneKey, sessionId: providerSessionId, logPath })
    }
  }
  const result: TranscriptAssets = []
  let changed = false
  // One at a time: two 100MB logs at once would be twice the disk and CPU for no gain.
  for (const source of sources) {
    for (const { paneKey, sessionId, logPath } of await withSubagentLogs(source)) {
      try {
        changed = (await updateLogState(logs, logPath)) || changed
        const refs = logs[logPath]?.refs ?? []
        result.push({
          paneKey,
          sessionId,
          total: refs.length,
          refs: refs.slice(request.seen[sessionId] ?? 0)
        })
      } catch {
        // A log can vanish between listing and reading; the next pass tries again.
      }
    }
  }
  if (changed) {
    await saveLogs(logs).catch(() => undefined)
  }
  return result
}

function sanitizeRequest(value: unknown): TranscriptAssetRequest {
  const request = value as Partial<TranscriptAssetRequest> | null
  return {
    chats: Array.isArray(request?.chats)
      ? request.chats.filter(
          (chat) => typeof chat?.paneKey === 'string' && typeof chat?.providerSessionId === 'string'
        )
      : [],
    seen: request?.seen && typeof request.seen === 'object' ? request.seen : {}
  }
}

export function registerTranscriptAssetHandlers(readPanes: () => Promise<ClaudePane[]>): void {
  let running: Promise<TranscriptAssets> | null = null
  ipcMain.handle('duduAde:transcriptAssets', (_event, request: unknown) => {
    // A first pass over huge logs can outlast the poll; a repeat call waits for it.
    running ??= readTranscriptAssets(readPanes, sanitizeRequest(request)).finally(() => {
      running = null
    })
    return running
  })
}
