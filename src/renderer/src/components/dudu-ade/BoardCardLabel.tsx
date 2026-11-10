import { MessageSquare, SquareTerminal } from 'lucide-react'
import { useRef, useState } from 'react'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import type { WorktreeStatus } from '@/lib/worktree-status'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { renameStructuredChatTab } from '@/runtime/structured-chat-rename'
import { useAppStore } from '@/store'
import type { TerminalAgentModel } from '../../../../shared/dudu-ade-terminal-models'
import { CARD_LABEL_HEIGHT } from './board-card-label'
import type { BoardTerminal } from './board-terminal-listing'
import { AgentStatusChip, ModelBadge } from './BoardAgentBadges'

const DOUBLE_CLICK_MS = 220

function renameCard(terminal: BoardTerminal, title: string): void {
  if (terminal.chat) {
    const tab = useAppStore
      .getState()
      .unifiedTabsByWorktree[terminal.worktreeId]?.find((entry) => entry.id === terminal.tabId)
    if (tab) {
      void renameStructuredChatTab(useAppStore.getState, tab, title, undefined, () => undefined)
    }
    return
  }
  void callRuntimeRpc({ kind: 'local' }, 'terminal.setPaneTitle', {
    terminal: terminal.handle,
    title
  }).catch(() => undefined)
}

/** Chip above a card that stays readable when zoomed out: click goes to the card, double click renames. */
export function BoardCardLabel({
  terminal,
  title,
  status,
  unread,
  model,
  onActivate
}: {
  terminal: BoardTerminal
  title: string
  status: WorktreeStatus | undefined
  unread?: boolean
  model: TerminalAgentModel | undefined
  onActivate: () => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const Icon = terminal.chat ? MessageSquare : SquareTerminal
  return (
    <div
      data-board-label-key={terminal.key}
      className="flex items-center gap-1 rounded-full border border-border bg-card px-2 text-sm font-medium shadow-sm"
      style={{ height: CARD_LABEL_HEIGHT }}
      onClick={() => {
        // Wait out a possible double click, or renaming would also fly to the card.
        clickTimer.current = setTimeout(onActivate, DOUBLE_CLICK_MS)
      }}
      onDoubleClick={() => {
        if (clickTimer.current) {
          clearTimeout(clickTimer.current)
        }
        setEditing(true)
      }}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      {editing ? (
        <input
          autoFocus
          defaultValue={title}
          className="h-5 w-32 min-w-0 rounded border border-border bg-background px-1 text-sm outline-none"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !isImeOwnedKeyboardEvent(event)) {
              event.currentTarget.blur()
            } else if (event.key === 'Escape') {
              event.currentTarget.value = title
              event.currentTarget.blur()
            }
          }}
          onBlur={(event) => {
            const next = event.currentTarget.value.trim()
            setEditing(false)
            if (next && next !== title) {
              renameCard(terminal, next)
            }
          }}
        />
      ) : (
        <span className="min-w-0 truncate">{title}</span>
      )}
      <ModelBadge model={model} />
      <AgentStatusChip status={status} unread={unread} />
    </div>
  )
}
