import { useAppStore } from '@/store'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import { readStructuredAgentSessionConversationOutline } from '@/runtime/structured-agent-session-client'
import { boardChatKey } from './board-links'
import { chatTabRows } from './use-board-chats'
import { paneKeyOf } from './board-agent-labels'
import { getStructuredAgentSessionStatusFeed } from '@/runtime/structured-agent-session-status-feed'
import { PATH_EXISTENCE_BATCH_MAX } from '../../../../shared/path-existence-batch'
import { readPersistedJson, writePersistedJsonSoon } from './dudu-ade-persistence'
import { useEffect } from 'react'
import { userNamedFileAccess } from '@/lib/local-file-access'
import { extractAssetReferences, homeDirFromPath, joinWrappedRows } from './asset-path-extraction'
import {
  listLocalBoardTerminals,
  readLocalTerminalTail,
  type BoardTerminal
} from './board-terminal-listing'
import { collectedAssetId, useDuduAdeStore, type CollectedAsset } from './dudu-ade-store'
import type { FoundAsset } from './dudu-ade-store-types'

export const ASSET_SCAN_INTERVAL_MS = 20_000
const TAIL_LINES_PER_SCAN = 400

// Output time already scanned, per terminal key; unchanged terminals cost no read.
const scannedOutputAt = new Map<string, number>()
// Paths verified on disk (true) or missing (false), so repeat mentions skip the stat.
const pathExistence = new Map<string, boolean>()
let scanInFlight: Promise<void> | null = null

async function localFileExists(path: string): Promise<boolean> {
  const known = pathExistence.get(path)
  if (known !== undefined) {
    return known
  }
  let exists = false
  try {
    const stat = await window.api.fs.stat({ filePath: path, access: userNamedFileAccess() })
    exists = !stat.isDirectory
  } catch {
    exists = false
  }
  pathExistence.set(path, exists)
  return exists
}

async function scanTerminal(terminal: BoardTerminal): Promise<FoundAsset[]> {
  const read = await readLocalTerminalTail(terminal.handle, TAIL_LINES_PER_SCAN)
  return assetsInLines(joinWrappedRows(read.tail, read.tailRows), terminal)
}

async function assetsInLines(lines: string[], terminal: BoardTerminal): Promise<FoundAsset[]> {
  const references = extractAssetReferences(lines, {
    baseDir: terminal.worktreePath,
    homeDir: homeDirFromPath(terminal.worktreePath)
  })
  const assets: FoundAsset[] = []
  for (const reference of references) {
    if (reference.kind !== 'artifact-link' && !(await localFileExists(reference.location))) {
      continue
    }
    assets.push({
      id: collectedAssetId(reference.kind, reference.location),
      kind: reference.kind,
      location: reference.location,
      source: {
        terminalTitle: terminal.title,
        worktreeId: terminal.worktreeId,
        worktreePath: terminal.worktreePath,
        branch: terminal.branch,
        tabId: terminal.tabId,
        leafId: terminal.leafId
      }
    })
  }
  return assets
}

const scannedChatAt = new Map<string, number>()

function chatTerminal(row: ReturnType<typeof chatTabRows>[number]): BoardTerminal {
  const state = useAppStore.getState()
  return {
    key: boardChatKey(row.worktreeId, row.tabId),
    handle: row.tabId,
    ptyId: null,
    title: row.title,
    paneTitle: null,
    worktreeId: row.worktreeId,
    worktreePath: findWorktreeById(state.worktreesByRepo, row.worktreeId)?.path ?? '',
    branch: '',
    tabId: row.tabId,
    leafId: 'chat',
    connected: true,
    lastOutputAt: null
  }
}

/**
 * Chats have no scrollback to read, so this reads their conversation outline.
 * shortcut: the outline caps each message and reply at 200 characters, so a path later in a long reply is missed; read journal items if that matters.
 */
async function scanChats(): Promise<void> {
  const state = useAppStore.getState()
  for (const row of chatTabRows(state.unifiedTabsByWorktree)) {
    try {
      const outline = await readStructuredAgentSessionConversationOutline(
        { kind: 'local' },
        row.sessionId
      )
      if (!outline || scannedChatAt.get(row.sessionId) === outline.cursor.sequence) {
        continue
      }
      scannedChatAt.set(row.sessionId, outline.cursor.sequence)
      const lines = outline.entries.flatMap((entry) => [entry.preview, entry.reply ?? ''])
      const found = await assetsInLines(lines, chatTerminal(row))
      useDuduAdeStore.getState().recordAssets(found, Date.now())
    } catch {
      // One unreadable chat must not stop the rest of the pass.
    }
  }
}

/** One pass over every local terminal with new output since its last scan. */
export function scanTerminalsForAssets(options: { force?: boolean } = {}): Promise<void> {
  if (scanInFlight) {
    return scanInFlight
  }
  scanInFlight = (async () => {
    try {
      const terminals = await listLocalBoardTerminals()
      await scanChats()
      for (const terminal of terminals) {
        const outputAt = terminal.lastOutputAt ?? 0
        if (!options.force && scannedOutputAt.get(terminal.key) === outputAt) {
          continue
        }
        try {
          const found = await scanTerminal(terminal)
          scannedOutputAt.set(terminal.key, outputAt)
          useDuduAdeStore.getState().recordAssets(found, Date.now())
        } catch {
          // One unreadable terminal must not stop the rest of the pass.
        }
      }
    } catch {
      // Runtime not ready yet; the next interval retries.
    } finally {
      scanInFlight = null
    }
  })()
  return scanInFlight
}

const TRANSCRIPT_SEEN_KEY = 'dudu-ade:transcript-seen:v1'
const EXISTENCE_CHECK_INTERVAL_MS = 5 * 60_000
let transcriptSeen: Record<string, number> | null = null
let lastExistenceCheckAt = 0
let transcriptScanInFlight = false

/** Files on disk can disappear at any time, so every stored file is checked now and then. */
async function refreshAssetExistence(): Promise<void> {
  const pathsExist = window.api.shell.pathsExist
  if (!pathsExist) {
    return
  }
  lastExistenceCheckAt = Date.now()
  const files = useDuduAdeStore.getState().assets.filter((asset) => asset.kind !== 'artifact-link')
  const missing = new Set<string>()
  const checked = new Set<string>()
  for (let index = 0; index < files.length; index += PATH_EXISTENCE_BATCH_MAX) {
    const batch = files.slice(index, index + PATH_EXISTENCE_BATCH_MAX)
    const answers = await pathsExist(batch.map((asset) => asset.location))
    batch.forEach((asset, position) => {
      // A refused path is unknown, not missing.
      if (typeof answers[position] === 'boolean') {
        checked.add(asset.id)
        if (!answers[position]) {
          missing.add(asset.id)
        }
      }
    })
  }
  useDuduAdeStore.getState().setMissingAssets(missing, checked)
}

function foundFromRefs(
  refs: { location: string; kind: CollectedAsset['kind']; at: number }[],
  terminal: BoardTerminal
): FoundAsset[] {
  return refs.map((ref) => ({
    id: collectedAssetId(ref.kind, ref.location),
    kind: ref.kind,
    location: ref.location,
    ...(ref.at ? { seenAt: ref.at } : {}),
    source: {
      terminalTitle: terminal.title,
      worktreeId: terminal.worktreeId,
      worktreePath: terminal.worktreePath,
      branch: terminal.branch,
      tabId: terminal.tabId,
      leafId: terminal.leafId
    }
  }))
}

/**
 * The windows' whole past: main reads each conversation log and hands over what is new since last time.
 * shortcut: only the conversation a window runs now is read, not older ones it switched away from; list a project's other logs if those matter.
 */
export async function scanTranscriptsForAssets(): Promise<void> {
  const read = window.api.shell.duduAdeTranscriptAssets
  if (!read || transcriptScanInFlight) {
    return
  }
  transcriptScanInFlight = true
  try {
    transcriptSeen ??= readPersistedJson<Record<string, number>>(
      TRANSCRIPT_SEEN_KEY,
      {},
      (value) => !!value && typeof value === 'object'
    )
    const terminals = await listLocalBoardTerminals()
    const byPane = new Map(terminals.map((terminal) => [paneKeyOf(terminal), terminal]))
    const feed = getStructuredAgentSessionStatusFeed({ kind: 'local' }).getSnapshot()
    const chats: { paneKey: string; providerSessionId: string }[] = []
    for (const row of chatTabRows(useAppStore.getState().unifiedTabsByWorktree)) {
      const providerSessionId = feed.get(row.sessionId)?.providerSession?.id
      if (providerSessionId) {
        const terminal = chatTerminal(row)
        byPane.set(paneKeyOf(terminal), terminal)
        chats.push({ paneKey: paneKeyOf(terminal), providerSessionId })
      }
    }
    let added = false
    for (const { paneKey, sessionId, total, refs } of await read({ chats, seen: transcriptSeen })) {
      const terminal = byPane.get(paneKey)
      if (!terminal || transcriptSeen[sessionId] === total) {
        continue
      }
      useDuduAdeStore.getState().recordAssets(foundFromRefs(refs, terminal), Date.now())
      transcriptSeen[sessionId] = total
      added ||= refs.length > 0
    }
    writePersistedJsonSoon(TRANSCRIPT_SEEN_KEY, transcriptSeen)
    if (added || Date.now() - lastExistenceCheckAt > EXISTENCE_CHECK_INTERVAL_MS) {
      await refreshAssetExistence()
    }
  } catch {
    // Runtime not ready yet; the next interval retries.
  } finally {
    transcriptScanInFlight = false
  }
}

/** Background collector: runs while the app is open so assets gather even with the gallery closed. */
export function useAssetScanner(): void {
  useEffect(() => {
    const scan = (): void => {
      void scanTerminalsForAssets()
      void scanTranscriptsForAssets()
    }
    // The chats' conversation numbers come from this feed, also while the board is closed.
    const releaseFeed = getStructuredAgentSessionStatusFeed({ kind: 'local' }).activate()
    const first = setTimeout(scan, 5_000)
    const interval = setInterval(scan, ASSET_SCAN_INTERVAL_MS)
    return () => {
      releaseFeed()
      clearTimeout(first)
      clearInterval(interval)
    }
  }, [])
}
