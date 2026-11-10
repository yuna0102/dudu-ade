import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { structuredAgentSessionTargetForHost } from '@/runtime/structured-agent-session-owner'
import { collectTabPtyIds } from '../terminal/running-terminal-close-guard'
import { closeTerminalTab } from '../terminal/terminal-tab-actions'
import { toHostSessionPaneKey } from '../../../../shared/terminal-surface-id'
import {
  captureTerminalSurfaceIdentity,
  isRetainedTerminalSurfaceIdentity
} from '../../../../shared/terminal-tab-close'
import type {
  RuntimeTerminalResolvePane,
  RuntimeTerminalWait
} from '../../../../shared/runtime-types'
import type { TerminalPaneLayoutNode } from '../../../../shared/terminal-tab-types'
import { DUDU_ADE_COPY } from '../dudu-ade/dudu-ade-copy'
import type { CliChatResumeSource } from './cli-chat-resume-source'

export type CliChatResumeCloseHooks = {
  /** The host answered for every pane; what follows waits on the user or on the exits. */
  prepared: () => void
  closing: () => void
  /** The user agreed to close, but the terminal changed first, so it stays open; the run
   *  decides whether it, or a newer continuation of the tab, answers. */
  refused: () => void
}

/** The panes the close takes, as the host names them: only the source's. Other panes of its tab stay. */
export function cliChatResumeClosingPaneKeys(
  state: AppState,
  source: CliChatResumeSource
): string[] {
  return closingLeaves(state, source).map((leaf) => toHostSessionPaneKey(`${source.tabId}:${leaf}`))
}

function closingLeaves(_state: AppState, source: CliChatResumeSource): string[] {
  return [source.paneKey.slice(source.tabId.length + 1)]
}

function layoutLeaves(node: TerminalPaneLayoutNode | null | undefined): string[] {
  if (!node) {
    return []
  }
  return node.type === 'leaf'
    ? [node.leafId]
    : [...layoutLeaves(node.first), ...layoutLeaves(node.second)]
}

/**
 * Every other pane of the source's tab, drawn or bound. Closing the tab would stop them all, so with
 * any here only the source pane may go: one tab can hold several separate agents.
 */
export function cliChatResumeOtherPanes(state: AppState, source: CliChatResumeSource): string[] {
  const leafId = source.paneKey.slice(source.tabId.length + 1)
  const layout = state.terminalLayoutsByTabId[source.tabId]
  const bindings = layout?.ptyIdsByLeafId ?? {}
  return [
    ...new Set([
      ...layoutLeaves(layout?.root),
      ...Object.keys(bindings).filter((leaf) => bindings[leaf])
    ])
  ].filter((leaf) => leaf !== leafId)
}

export async function closeCliChatResumeTerminal(
  source: CliChatResumeSource,
  isCurrent: () => boolean,
  hooks: CliChatResumeCloseHooks,
  signal: AbortSignal,
  /** False when the pane runs a job other than the agent, so the running-process prompt asks. */
  consents = true
): Promise<boolean> {
  const target = structuredAgentSessionTargetForHost(source.executionHostId)
  const leafId = source.paneKey.slice(source.tabId.length + 1)
  const state = useAppStore.getState()
  const ptyIds = collectTabPtyIds(state, source.tabId)
  const bindings = state.terminalLayoutsByTabId[source.tabId]?.ptyIdsByLeafId ?? {}
  const leaves = closingLeaves(state, source)
  const originals = leaves.map((leaf) =>
    captureTerminalSurfaceIdentity(state, source.workspaceId, source.tabId, leaf)
  )
  if (
    !target ||
    originals.some((original) => !original) ||
    ptyIds.some((id) => !Object.values(bindings).includes(id))
  ) {
    throw new Error('terminal unavailable')
  }
  const terminals = await Promise.all(
    leaves.map(async (leaf) => {
      const { terminal } = await callRuntimeRpc<{ terminal: RuntimeTerminalResolvePane }>(
        target,
        'terminal.resolvePane',
        {
          paneKey: toHostSessionPaneKey(`${source.tabId}:${leaf}`),
          worktreeId: source.workspaceId
        },
        { signal }
      )
      const original = originals.find((entry) => entry?.leafId === leaf)
      if (
        !terminal.ptyId ||
        !terminal.incarnationId ||
        !isCurrent() ||
        (original?.incarnationId && original.incarnationId !== terminal.incarnationId)
      ) {
        throw new Error('terminal unavailable')
      }
      return terminal
    })
  )
  hooks.prepared()
  /** Sent before the close so no exit can be missed; skips the compatibility await already passed. */
  const waitForExits = (): Promise<void> =>
    Promise.all(
      terminals.map((terminal) =>
        callRuntimeRpc<{ wait: RuntimeTerminalWait }>(
          target,
          'terminal.wait',
          {
            terminal: terminal.handle,
            for: 'exit',
            timeoutMs: 15_000
          },
          { signal, timeoutMs: 16_000, skipCompatibilityCheck: true }
        )
      )
    ).then((results) => {
      if (
        results.some(
          ({ wait }) =>
            !wait.satisfied ||
            wait.status !== 'exited' ||
            ((wait.exitCode === null || wait.exitCode < 0) &&
              wait.exitCause?.kind !== 'operator_close' &&
              wait.exitCause?.kind !== 'signaled')
        )
      ) {
        throw new Error('terminal exit unproven')
      }
    })
  const changedSinceCheck = (): boolean => {
    const current = useAppStore.getState()
    const currentPtyIds = collectTabPtyIds(current, source.tabId)
    return (
      signal.aborted ||
      !isCurrent() ||
      currentPtyIds.length !== ptyIds.length ||
      currentPtyIds.some((id) => !ptyIds.includes(id)) ||
      originals.some((original) => {
        if (!original) {
          return true
        }
        const next = captureTerminalSurfaceIdentity(
          current,
          source.workspaceId,
          source.tabId,
          original.leafId
        )
        return !next || !isRetainedTerminalSurfaceIdentity(original, next)
      })
    )
  }
  if (cliChatResumeOtherPanes(state, source).length > 0) {
    // The tab's running-process prompt speaks for the whole tab, so a pane with another job stays.
    if (!consents) {
      toast(DUDU_ADE_COPY.paneBusyKeepsOpen)
      return false
    }
    if (changedSinceCheck()) {
      hooks.refused()
      return false
    }
    const exited = waitForExits()
    hooks.closing()
    await callRuntimeRpc(
      target,
      'terminal.close',
      { terminal: terminals[0].handle },
      { signal, skipCompatibilityCheck: true }
    )
    await exited
    return true
  }
  return await new Promise<boolean>((resolve, reject) => {
    let started = false
    const cancel = () => {
      if (started) {
        return
      }
      signal.removeEventListener('abort', cancel)
      resolve(false)
    }
    signal.addEventListener('abort', cancel, { once: true })
    closeTerminalTab(source.tabId, {
      // Continuing is the user's consent to stop this pane's agent, so only other panes' work asks.
      ...(consents && bindings[leafId] ? { consentedPtyId: bindings[leafId] } : {}),
      // The chat opens in this worktree, so emptying it must not leave it.
      preserveWorktreeSelection: true,
      onCancel: cancel,
      // A tab already gone is reported closed without asking beforeClose or onCancel; nothing else settles this.
      onClosed: () => {
        if (!started) {
          hooks.refused()
          cancel()
        }
      },
      beforeClose: () => {
        if (started || changedSinceCheck()) {
          if (!started) {
            hooks.refused()
          }
          return false
        }
        started = true
        signal.removeEventListener('abort', cancel)
        const exited = waitForExits()
        hooks.closing()
        void exited.then(() => resolve(true)).catch(reject)
        return true
      }
    })
  })
}
