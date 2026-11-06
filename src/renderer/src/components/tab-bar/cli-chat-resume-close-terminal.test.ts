// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeTerminalWait } from '../../../../shared/runtime-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  close: vi.fn(),
  toast: vi.fn(),
  state: {
    tabsByWorktree: { workspace: [{ id: 'tab', createdAt: 1 }] },
    terminalLayoutsByTabId: {
      tab: {
        root: { type: 'leaf', leafId: 'a' } as unknown,
        ptyIdsByLeafId: { a: 'pty-a' } as Record<string, string>
      }
    },
    ptyIdsByTabId: { tab: ['pty-a'] },
    terminalPtyIncarnationsByPaneKey: { 'tab:a': 'inc-a', 'tab:b': 'inc-b' }
  }
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: mocks.call }))
vi.mock('@/runtime/structured-agent-session-owner', () => ({
  structuredAgentSessionTargetForHost: (host: string) =>
    host === 'local' ? { kind: 'local' } : { kind: 'environment', environmentId: 'paired' }
}))
vi.mock('../terminal/terminal-tab-actions', () => ({ closeTerminalTab: mocks.close }))
vi.mock('sonner', () => ({ toast: mocks.toast }))
import {
  cliChatResumeClosingPaneKeys,
  cliChatResumeOtherPanes,
  closeCliChatResumeTerminal
} from './cli-chat-resume-close-terminal'
const source = {
  tabId: 'tab',
  workspaceId: 'workspace',
  paneKey: 'tab:a',
  agent: 'claude',
  providerSessionId: 'conversation',
  executionHostId: 'local'
} as const
const hooks = (closing = vi.fn()) => ({ prepared: vi.fn(), closing, refused: vi.fn() })
function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { resolve, promise }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.terminalLayoutsByTabId.tab.root = { type: 'leaf', leafId: 'a' }
  mocks.state.terminalLayoutsByTabId.tab.ptyIdsByLeafId = { a: 'pty-a' }
  mocks.state.ptyIdsByTabId.tab = ['pty-a']
  mocks.state.terminalPtyIncarnationsByPaneKey['tab:a'] = 'inc-a'
  mocks.call.mockImplementation(async (_target, method, params) => {
    if (method === 'terminal.resolvePane') {
      const leaf = params.paneKey.endsWith(':b') ? 'b' : 'a'
      return {
        terminal: { handle: `handle-${leaf}`, ptyId: `pty-${leaf}`, incarnationId: `inc-${leaf}` }
      }
    }
    return { wait: { satisfied: true, status: 'exited', exitCode: 0 } }
  })
  mocks.close.mockImplementation((_tab, options) => {
    options.beforeClose()
  })
})
it.each<ExecutionHostId>(['local', 'runtime:paired'])(
  'closes a one-pane tab the ordinary way on %s and waits for its exit',
  async (executionHostId) => {
    const exit = deferred<{
      wait: Pick<RuntimeTerminalWait, 'satisfied' | 'status' | 'exitCode'>
    }>()
    mocks.call.mockImplementation(async (_target, method) => {
      if (method === 'terminal.resolvePane') {
        return { terminal: { handle: 'handle-a', ptyId: 'pty-a', incarnationId: 'inc-a' } }
      }
      return exit.promise
    })
    const closing = vi.fn(() =>
      expect(mocks.call.mock.calls.filter((call) => call[1] === 'terminal.wait')).toHaveLength(1)
    )
    let finished = false
    const closeHooks = hooks(closing)
    const run = closeCliChatResumeTerminal(
      { ...source, executionHostId },
      () => true,
      closeHooks,
      new AbortController().signal
    ).then((value) => {
      finished = true
      return value
    })
    await vi.waitFor(() => expect(closing).toHaveBeenCalledOnce())
    expect(finished).toBe(false)
    expect(closeHooks.prepared).toHaveBeenCalledOnce()
    expect(mocks.close).toHaveBeenCalledWith(
      'tab',
      expect.objectContaining({
        consentedPtyId: 'pty-a',
        preserveWorktreeSelection: true,
        onCancel: expect.any(Function)
      })
    )
    exit.resolve({ wait: { satisfied: true, status: 'exited', exitCode: 0 } })
    await expect(run).resolves.toBe(true)
  }
)
describe('a tab split into several windows', () => {
  const split = (): void => {
    mocks.state.terminalLayoutsByTabId.tab.root = {
      type: 'split',
      first: { type: 'leaf', leafId: 'a' },
      second: {
        type: 'split',
        first: { type: 'leaf', leafId: 'b' },
        second: { type: 'leaf', leafId: 'c' }
      }
    }
    mocks.state.terminalLayoutsByTabId.tab.ptyIdsByLeafId = { a: 'pty-a', b: 'pty-b', c: 'pty-c' }
    mocks.state.ptyIdsByTabId.tab = ['pty-a', 'pty-b', 'pty-c']
  }
  const closedHandles = (): unknown[] =>
    mocks.call.mock.calls
      .filter((call) => call[1] === 'terminal.close')
      .map((call) => call[2].terminal)
  const touchedPanes = (): unknown[] =>
    mocks.call.mock.calls
      .filter((call) => call[1] === 'terminal.resolvePane')
      .map((call) => call[2].paneKey)

  it('closes only the source pane, never the tab, and proves that exit', async () => {
    split()
    await expect(
      closeCliChatResumeTerminal(source, () => true, hooks(), new AbortController().signal)
    ).resolves.toBe(true)
    expect(mocks.close).not.toHaveBeenCalled()
    expect(closedHandles()).toEqual(['handle-a'])
    expect(touchedPanes()).toHaveLength(1)
    expect(mocks.call.mock.calls.filter((call) => call[1] === 'terminal.wait')).toHaveLength(1)
  })

  it('names only the source pane as stopping, and lists the rest as staying', () => {
    split()
    const state = mocks.state as never
    expect(cliChatResumeClosingPaneKeys(state, source)).toHaveLength(1)
    expect(cliChatResumeOtherPanes(state, source)).toEqual(['b', 'c'])
  })

  it('counts a drawn pane with no PTY yet as another pane', () => {
    split()
    mocks.state.terminalLayoutsByTabId.tab.ptyIdsByLeafId = { a: 'pty-a' }
    mocks.state.ptyIdsByTabId.tab = ['pty-a']
    expect(cliChatResumeOtherPanes(mocks.state as never, source)).toEqual(['b', 'c'])
  })

  it('refuses when the pane runs another job, closing nothing', async () => {
    split()
    await expect(
      closeCliChatResumeTerminal(source, () => true, hooks(), new AbortController().signal, false)
    ).resolves.toBe(false)
    expect(mocks.close).not.toHaveBeenCalled()
    expect(closedHandles()).toEqual([])
    expect(mocks.toast).toHaveBeenCalledOnce()
  })

  it('closes nothing when the terminal changed after the check', async () => {
    split()
    const closeHooks = hooks()
    let checks = 0
    await expect(
      closeCliChatResumeTerminal(
        source,
        () => {
          checks += 1
          return checks < 2
        },
        closeHooks,
        new AbortController().signal
      )
    ).resolves.toBe(false)
    expect(closedHandles()).toEqual([])
    expect(closeHooks.refused).toHaveBeenCalledOnce()
  })

  it('settles when the tab is already gone, so the chat does not wait forever', async () => {
    mocks.close.mockImplementation((_tabId, options) => options.onClosed())
    const closeHooks = hooks()
    await expect(
      closeCliChatResumeTerminal(source, () => true, closeHooks, new AbortController().signal)
    ).resolves.toBe(false)
    expect(closeHooks.refused).toHaveBeenCalledOnce()
    expect(closeHooks.closing).not.toHaveBeenCalled()
  })

  it('reports a pane whose exit cannot be proven', async () => {
    split()
    mocks.call.mockImplementation(async (_target, method) =>
      method === 'terminal.resolvePane'
        ? { terminal: { handle: 'handle-a', ptyId: 'pty-a', incarnationId: 'inc-a' } }
        : method === 'terminal.wait'
          ? { wait: { satisfied: true, status: 'unknown', exitCode: null } }
          : {}
    )
    await expect(
      closeCliChatResumeTerminal(source, () => true, hooks(), new AbortController().signal)
    ).rejects.toThrow('terminal exit unproven')
  })
})
it('leaves the tab and opens nothing when the ordinary close confirmation is cancelled', async () => {
  mocks.close.mockImplementation((_tab, options) => options.onCancel())
  const closing = vi.fn()
  await expect(
    closeCliChatResumeTerminal(source, () => true, hooks(closing), new AbortController().signal)
  ).resolves.toBe(false)
  expect(closing).not.toHaveBeenCalled()
  expect(mocks.call.mock.calls.filter((call) => call[1] === 'terminal.wait')).toHaveLength(0)
})
it.each([
  {
    satisfied: true,
    status: 'exited',
    exitCode: -1,
    exitCause: { kind: 'unknown', reason: 'stop_unverified' }
  },
  { satisfied: true, status: 'unknown', exitCode: null }
])('rejects unproven exit evidence: %j', async (wait) => {
  mocks.call.mockImplementation(async (_target, method, params) => {
    const leaf = params.paneKey?.endsWith(':b') ? 'b' : 'a'
    return method === 'terminal.resolvePane'
      ? {
          terminal: { handle: `handle-${leaf}`, ptyId: `pty-${leaf}`, incarnationId: `inc-${leaf}` }
        }
      : { wait }
  })
  await expect(
    closeCliChatResumeTerminal(source, () => true, hooks(), new AbortController().signal)
  ).rejects.toThrow('terminal exit unproven')
})
it('rechecks the source incarnation after an existing close dialog and says the close was dropped', async () => {
  mocks.close.mockImplementation((_tab, options) => {
    mocks.state.terminalPtyIncarnationsByPaneKey['tab:a'] = 'replacement'
    expect(options.beforeClose()).toBe(false)
    options.onCancel()
  })
  const closeHooks = hooks()
  await expect(
    closeCliChatResumeTerminal(source, () => true, closeHooks, new AbortController().signal)
  ).resolves.toBe(false)
  expect(closeHooks.refused).toHaveBeenCalledOnce()
  expect(closeHooks.closing).not.toHaveBeenCalled()
  expect(mocks.call.mock.calls.filter((call) => call[1] === 'terminal.wait')).toHaveLength(0)
})
it('reports a vetoed confirmed close to its run even after the run was retired', async () => {
  const controller = new AbortController()
  let reenter: (() => boolean) | undefined
  mocks.close.mockImplementation((_tab, options) => {
    reenter = options.beforeClose
  })
  const closeHooks = hooks()
  const run = closeCliChatResumeTerminal(source, () => true, closeHooks, controller.signal)
  await vi.waitFor(() => expect(reenter).toBeDefined())
  controller.abort()
  await expect(run).resolves.toBe(false)
  expect(reenter?.()).toBe(false)
  // The run, not this helper, knows whether a newer continuation owns the confirmation.
  expect(closeHooks.refused).toHaveBeenCalledOnce()
  expect(closeHooks.closing).not.toHaveBeenCalled()
})
