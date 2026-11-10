import { toast } from 'sonner'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { recognizeAgentProcess } from '../../../../shared/agent-process-recognition'
import { getStructuredAgentSessionStatusFeed } from '@/runtime/structured-agent-session-status-feed'
import { probePtyRunningWork, type PtyRunningWorkProbe } from '../terminal/pty-running-work-probe'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { boardChatKey } from './board-links'
import { useDuduAdeStore } from './dudu-ade-store'
import { useAppStore } from '@/store'
import type { AiVaultAgent } from '../../../../shared/ai-vault-types'
import { runNativeChatCliFork } from '../tab-bar/native-chat-cli-fork-run'
import { resolveTabSessionHistorySubject } from '../tab-bar/tab-session-history-switch'
import { listLocalBoardTerminals, type BoardTerminal } from './board-terminal-listing'

/** A terminal continued as a chat keeps its board place, category and links under the chat's card key. */
export function carryBoardCardToChat(
  source: { workspaceId: string; tabId: string; paneKey: string },
  chatTabId: string
): void {
  const leafId = parsePaneKey(source.paneKey)?.leafId
  if (leafId) {
    useDuduAdeStore
      .getState()
      .carryCard(
        `${source.workspaceId}::${source.tabId}::${leafId}`,
        boardChatKey(source.workspaceId, chatTabId)
      )
  }
}

const NEW_TERMINAL_TRIES = 10
const NEW_TERMINAL_WAIT_MS = 500
const AGENT_UP_TRIES = 20
const AGENT_UP_WAIT_MS = 1_000
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Only the agent itself in the foreground proves the fork came up; a bare shell means it never started or quit. */
export function forkedAgentIsUp(probe: PtyRunningWorkProbe | undefined): boolean {
  const running = probe?.verdict === 'live' ? probe.foregroundProcess : undefined
  return !!running && recognizeAgentProcess(running) !== null
}

async function agentCameUp(terminalKey: string): Promise<boolean> {
  for (let attempt = 0; attempt < AGENT_UP_TRIES; attempt += 1) {
    const terminal = (await listLocalBoardTerminals()).find((entry) => entry.key === terminalKey)
    if (terminal?.ptyId && terminal.connected) {
      const [probe] = await probePtyRunningWork([terminal.ptyId], { timeoutMs: 5_000 })
      if (forkedAgentIsUp(probe)) {
        return true
      }
    }
    await wait(AGENT_UP_WAIT_MS)
  }
  return false
}

/** The chat tab goes only once its terminal proves up; a chat still working is the user's to stop. */
async function closeChatOnceTerminalIsUp(chat: BoardTerminal, terminalKey: string): Promise<void> {
  if (!(await agentCameUp(terminalKey))) {
    toast(DUDU_ADE_COPY.chatKeptTerminalUnproven)
    return
  }
  const sessionId = chat.chat?.sessionId
  const status = sessionId
    ? getStructuredAgentSessionStatusFeed({ kind: 'local' }).getSnapshot().get(sessionId)?.status
    : undefined
  if (status === 'working') {
    toast(DUDU_ADE_COPY.chatKeptWhileWorking)
    return
  }
  useAppStore.getState().closeUnifiedTab(chat.tabId)
}

/** Which terminal appeared since the snapshot, in the chat's workspace. */
export function newTerminalKey(
  terminals: readonly Pick<BoardTerminal, 'key' | 'tabId' | 'worktreeId'>[],
  worktreeId: string,
  knownTabIds: ReadonlySet<string>
): string | null {
  return (
    terminals.find(
      (terminal) => terminal.worktreeId === worktreeId && !knownTabIds.has(terminal.tabId)
    )?.key ?? null
  )
}

/**
 * Continues a chat as a terminal agent with the app's own fork, then gives the new terminal the card's
 * place, category and links, and closes the chat tab once the terminal is proven up.
 */
export async function runBoardChatToTerminal(args: {
  chat: BoardTerminal
  sessionId: string
  agent: AiVaultAgent
}): Promise<void> {
  const { chat, sessionId, agent } = args
  const tab = { id: chat.tabId, worktreeId: chat.worktreeId }
  const state = useAppStore.getState()
  const subject = resolveTabSessionHistorySubject(state, { tab, nativeChat: { sessionId, agent } })
  if (subject?.kind !== 'chat') {
    return
  }
  const panel = useDuduAdeStore.getState().panel
  const known = new Set(
    (await listLocalBoardTerminals())
      .filter((terminal) => terminal.worktreeId === chat.worktreeId)
      .map((terminal) => terminal.tabId)
  )
  await runNativeChatCliFork({
    subject,
    tab,
    agent,
    commandOverrides: state.settings?.agentCmdOverrides
  })
  let forkedKey: string | null = null
  for (let attempt = 0; attempt < NEW_TERMINAL_TRIES && !forkedKey; attempt += 1) {
    forkedKey = newTerminalKey(await listLocalBoardTerminals(), chat.worktreeId, known)
    if (forkedKey) {
      const store = useDuduAdeStore.getState()
      store.carryCard(chat.key, forkedKey)
      store.removeCard(chat.key)
    } else {
      await wait(NEW_TERMINAL_WAIT_MS)
    }
  }
  // Revealing the new terminal can navigate, which closes the board.
  if (panel && useDuduAdeStore.getState().panel !== panel) {
    useDuduAdeStore.getState().openPanel(panel)
  }
  if (forkedKey) {
    await closeChatOnceTerminalIsUp(chat, forkedKey)
  }
}
