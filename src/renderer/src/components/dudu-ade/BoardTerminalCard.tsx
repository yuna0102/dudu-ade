import { memo, useRef } from 'react'
import { MessageSquare, SquareArrowOutUpRight, SquareTerminal, Minimize2 } from 'lucide-react'
import { AgentTerminalPreview } from '@/components/dashboard-popout/AgentTerminalPreview'
import { revealDashboardAgent } from '@/components/dashboard/reveal-dashboard-agent'
import { Button } from '@/components/ui/button'
import type { WorktreeStatus } from '@/lib/worktree-status'
import type { TerminalAgentModel } from '../../../../shared/dudu-ade-terminal-models'
import type { BoardCardGeometry } from './board-layout-state'
import type { BoardTerminal } from './board-terminal-listing'
import { AgentStatusChip, ModelBadge } from './BoardAgentBadges'
import { BoardCardFrame } from './BoardCardFrame'
import { BoardCardLabel } from './BoardCardLabel'
import { BoardChatLive, CHAT_RAIL_MIN_WIDTH } from './BoardChatLive'
import type { BoardCardChange } from './use-board-card-drag'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'
import { isStationaryClick } from './board-terminal-focus'
import { BoardSurfaceToggle } from './BoardSurfaceToggle'
import { useBoardCardInputFocus, useUnscaledTerminalMouse } from './use-unscaled-terminal-mouse'
import { useAppStore } from '@/store'
import { normalizeDesktopTerminalScrollbackRows } from '../../../../shared/terminal-scrollback-policy'

/** A window's title without the status mark an agent puts in front of it. */
export function boardTerminalTitle(terminal: BoardTerminal): string {
  const title = terminal.title?.replace(/^[^\p{L}\p{N}]+/u, '')
  return title || terminal.branch || terminal.handle
}

/** The role name when the window has one; an agent can rewrite its title at any time. */
export function cardDisplayTitle(
  terminal: BoardTerminal,
  names: Readonly<Record<string, string>> | undefined
): string {
  return names?.[terminal.key] ?? boardTerminalTitle(terminal)
}

export const BoardTerminalCard = memo(function BoardTerminalCard({
  terminal,
  workspaceName,
  geometry,
  zoom,
  status,
  model,
  highlighted,
  onCommitCard,
  onStartLink,
  focused,
  onActivate,
  displayTitle,
  onScreen
}: {
  terminal: BoardTerminal
  workspaceName: string
  geometry: BoardCardGeometry
  zoom: number
  status: WorktreeStatus | undefined
  model: TerminalAgentModel | undefined
  highlighted: boolean
  onCommitCard: (key: string, geometry: BoardCardGeometry, change: BoardCardChange) => void
  onStartLink?: (key: string, event: React.PointerEvent) => void
  focused: boolean
  onActivate: (key: string) => void
  displayTitle: string
  /** Near enough to read: a chat off screen or too small keeps its view but stops its heavier updates. */
  onScreen: boolean
}): React.JSX.Element {
  const removeCard = useDuduAdeStore((s) => s.removeCard)
  const setCards = useDuduAdeStore((s) => s.setCards)
  const closePanel = useDuduAdeStore((s) => s.closePanel)
  const live = terminal.ptyId !== null && terminal.connected
  const bodyRef = useRef<HTMLDivElement>(null)
  useUnscaledTerminalMouse(bodyRef)
  useBoardCardInputFocus(bodyRef, focused)
  const pressAt = useRef<{ x: number; y: number } | null>(null)
  const fontSize = useAppStore((s) => s.settings?.terminalFontSize)
  const fitPty = geometry.fitPty === true
  // History a card replays and keeps follows the same setting as real panes; main caps it again.
  const scrollbackRows = useAppStore((s) =>
    normalizeDesktopTerminalScrollbackRows(s.settings?.terminalScrollbackRows)
  )
  const reveal = (): void => {
    closePanel()
    revealDashboardAgent({
      repoId: '',
      worktreeId: terminal.worktreeId,
      tabId: terminal.tabId,
      leafId: terminal.leafId
    })
  }
  return (
    <BoardCardFrame
      geometry={geometry}
      zoom={zoom}
      highlighted={highlighted}
      focused={focused}
      floatingLabel={
        <BoardCardLabel
          terminal={terminal}
          title={displayTitle}
          status={status}
          model={model}
          onActivate={() => onActivate(terminal.key)}
        />
      }
      onCommit={(next, change) =>
        onCommitCard(terminal.key, change === 'resize' ? { ...next, fitPty: true } : next, change)
      }
      onRemove={() => removeCard(terminal.key)}
      onStartLink={onStartLink ? (event) => onStartLink(terminal.key, event) : undefined}
      icon={
        terminal.chat ? (
          <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <SquareTerminal className="size-3.5 shrink-0 text-muted-foreground" />
        )
      }
      title={displayTitle}
      subtitle={workspaceName}
      badges={
        <div className="flex shrink-0 items-center gap-1">
          <ModelBadge model={model} />
          <AgentStatusChip status={status} />
        </div>
      }
      actions={
        <>
          <BoardSurfaceToggle terminal={terminal} />
          {fitPty ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={DUDU_ADE_COPY.restorePreview}
              title={DUDU_ADE_COPY.restorePreview}
              onClick={() => setCards({ [terminal.key]: { ...geometry, fitPty: false } })}
            >
              <Minimize2 />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={DUDU_ADE_COPY.openInWorkspace}
            title={DUDU_ADE_COPY.openInWorkspace}
            onClick={reveal}
          >
            <SquareArrowOutUpRight />
          </Button>
        </>
      }
    >
      {/* Always mounted, so the mouse fix attaches even when the pane connects later. */}
      <div ref={bodyRef} className="relative h-full">
        {terminal.chat ? (
          <BoardChatLive
            worktreeId={terminal.worktreeId}
            tabId={terminal.tabId}
            sessionId={terminal.chat.sessionId}
            focused={focused}
            onScreen={onScreen}
            wide={geometry.w >= CHAT_RAIL_MIN_WIDTH}
          />
        ) : live && terminal.ptyId ? (
          // Scaled until the user resizes the card; then the PTY follows the card on release.
          // Remounting on a switch back drops the size claim, which hands the PTY back to the real pane.
          <AgentTerminalPreview
            key={fitPty ? 'fit' : 'scaled'}
            ptyId={terminal.ptyId}
            className="h-full"
            claimPtyGrid={fitPty}
            replayRows={scrollbackRows}
            scrollbackBufferRows={scrollbackRows}
            gridClaimToken={fitPty ? `${geometry.w}x${geometry.h}@${fontSize}` : undefined}
            focusOnConnect={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {DUDU_ADE_COPY.terminalOffline}
          </div>
        )}
        {focused ? null : (
          // Locked: wheel and pinch reach the board, nothing reaches the terminal until a click.
          <div
            data-board-terminal-locked
            className="absolute inset-0 z-10 cursor-pointer"
            title={DUDU_ADE_COPY.focusTerminal}
            onPointerDown={(event) => {
              pressAt.current = event.button === 0 ? { x: event.clientX, y: event.clientY } : null
            }}
            onPointerUp={(event) => {
              const press = pressAt.current
              pressAt.current = null
              if (press && isStationaryClick(press, { x: event.clientX, y: event.clientY })) {
                onActivate(terminal.key)
              }
            }}
          />
        )}
      </div>
    </BoardCardFrame>
  )
})
