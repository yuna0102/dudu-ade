import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { readStructuredAgentSessionConversationOutline } from '@/runtime/structured-agent-session-client'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import { isStructuredTab } from '../../../../shared/agent-session/view/structured-agent-session-tab'
import NativeChatView from '../native-chat/NativeChatView'
import { useBoardChatClaim } from './board-chat-owner'
import { DUDU_ADE_COPY } from './dudu-ade-copy'

const REACHABLE_GIVE_UP_MS = 15_000
/** Narrower than this the message rail crowds the transcript, and a card has the board's own navigation. */
export const CHAT_RAIL_MIN_WIDTH = 900

/** Whether the host answers for this chat; a session that never started answers an error or nothing at all. */
function useChatReachable(sessionId: string): boolean {
  const [reachable, setReachable] = useState(true)
  useEffect(() => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        setReachable(false)
      }
    }, REACHABLE_GIVE_UP_MS)
    void readStructuredAgentSessionConversationOutline({ kind: 'local' }, sessionId)
      .then(() => {
        settled = true
        setReachable(true)
      })
      .catch(() => {
        settled = true
        setReachable(false)
      })
    return () => clearTimeout(timer)
  }, [sessionId])
  return reachable
}

function ChatNote({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
      {text}
    </div>
  )
}

/**
 * The real chat in a card, focused or not: focus only decides whether it takes input, so changing focus never
 * remounts it and its scroll position and history stay. Text input needs no zoom correction: unlike xterm, it
 * lets the browser map the pointer through the board's CSS scale.
 */
export function BoardChatLive({
  worktreeId,
  tabId,
  sessionId,
  focused,
  onScreen,
  wide
}: {
  worktreeId: string
  tabId: string
  sessionId: string
  focused: boolean
  onScreen: boolean
  wide: boolean
}): React.JSX.Element {
  const claimed = useBoardChatClaim(tabId)
  const reachable = useChatReachable(sessionId)
  const tab = useAppStore((state) =>
    state.unifiedTabsByWorktree[worktreeId]?.find((candidate) => candidate.id === tabId)
  )
  const owner = useAppStore((state) =>
    tab ? structuredAgentSessionOwnerForTab(state, tab) : undefined
  )
  const target = useMemo(
    () => (owner === undefined ? null : structuredAgentSessionTargetForHost(owner)),
    [owner]
  )
  if (!reachable) {
    return <ChatNote text={DUDU_ADE_COPY.chatUnavailable} />
  }
  if (!claimed || !target || !tab || !isStructuredTab(tab) || !tab.agentSessionAgent) {
    return <ChatNote text={DUDU_ADE_COPY.chatLoading} />
  }
  return (
    <div className={wide ? 'h-full' : 'h-full [&_[data-native-chat-rail]]:hidden'}>
      <NativeChatView
        mode="structured"
        tabId={tabId}
        groupId={tab.groupId}
        sessionId={sessionId}
        agent={tab.agentSessionAgent}
        isVisible={onScreen}
        isFocusedGroup={focused}
        target={target}
      />
    </div>
  )
}
