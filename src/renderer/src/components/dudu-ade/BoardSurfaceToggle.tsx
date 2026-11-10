import { Loader2, MessagesSquare, SquareTerminal } from 'lucide-react'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { AI_VAULT_AGENTS } from '../../../../shared/ai-vault-types'
import type { AgentType } from '../../../../shared/agent-status-types'
import { createExecutionHostSelector } from '../native-chat/NativeChatResumeInCliButton'
import { resolveCliChatResumeSource } from '../tab-bar/cli-chat-resume-source'
import { runCliChatResume, useCliChatResumePending } from '../tab-bar/cli-chat-resume-run'
import { useNativeChatCliForkPending } from '../tab-bar/native-chat-cli-fork-run'
import { paneKeyOf } from './board-agent-labels'
import { runBoardChatToTerminal } from './board-chat-carry'
import type { BoardTerminal } from './board-terminal-listing'
import { DUDU_ADE_COPY } from './dudu-ade-copy'

function ToggleButton({
  label,
  reason,
  pending,
  icon,
  onClick
}: {
  label: string
  /** Why it cannot run; a disabled button gets no pointer events, so the span carries the tooltip. */
  reason: string | null
  pending: boolean
  icon: React.ReactNode
  onClick: () => void
}): React.JSX.Element {
  return (
    <span className="inline-flex" title={reason ?? label}>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={reason ? `${label}. ${reason}` : label}
        aria-busy={pending || undefined}
        disabled={pending || reason !== null}
        onClick={onClick}
      >
        {pending ? <Loader2 className="animate-spin" /> : icon}
      </Button>
    </span>
  )
}

function TerminalToChat({ terminal }: { terminal: BoardTerminal }): React.JSX.Element {
  const source = useAppStore(
    useShallow((state) =>
      resolveCliChatResumeSource(state, {
        tab: { id: terminal.tabId, worktreeId: terminal.worktreeId },
        paneKey: paneKeyOf(terminal)
      })
    )
  )
  const pending = useCliChatResumePending(source)
  const reason = !source
    ? DUDU_ADE_COPY.surfaceNoConversation
    : source.hostUpdateRequired
      ? DUDU_ADE_COPY.surfaceHostUpdate
      : null
  return (
    <ToggleButton
      label={DUDU_ADE_COPY.continueInChat}
      reason={reason}
      pending={pending}
      icon={<MessagesSquare />}
      onClick={() => {
        if (source) {
          void runCliChatResume(source)
        }
      }}
    />
  )
}

function ChatToTerminal({
  terminal,
  sessionId,
  agent
}: {
  terminal: BoardTerminal
  sessionId: string
  agent: AgentType | undefined
}): React.JSX.Element {
  const { tabId, worktreeId } = terminal
  const selectHost = useMemo(
    () => createExecutionHostSelector(tabId, worktreeId, sessionId, agent),
    [tabId, worktreeId, sessionId, agent]
  )
  const executionHostScope = useAppStore(selectHost)
  const pending = useNativeChatCliForkPending(
    executionHostScope ? { executionHostScope, sessionId } : null
  )
  const vaultAgent = AI_VAULT_AGENTS.find((candidate) => candidate === agent)
  return (
    <ToggleButton
      label={DUDU_ADE_COPY.continueInTerminal}
      reason={executionHostScope && vaultAgent ? null : DUDU_ADE_COPY.surfaceNoConversation}
      pending={pending}
      icon={<SquareTerminal />}
      onClick={() => {
        if (vaultAgent) {
          void runBoardChatToTerminal({ chat: terminal, sessionId, agent: vaultAgent })
        }
      }}
    />
  )
}

/** Moves the same conversation between its terminal and chat surfaces, from the card's title bar. */
export function BoardSurfaceToggle({ terminal }: { terminal: BoardTerminal }): React.JSX.Element {
  return terminal.chat ? (
    <ChatToTerminal
      terminal={terminal}
      sessionId={terminal.chat.sessionId}
      agent={terminal.chat.agent}
    />
  ) : (
    <TerminalToChat terminal={terminal} />
  )
}
