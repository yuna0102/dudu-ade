import { useMemo } from 'react'
import { useAppStore } from '@/store'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import { isStructuredTab } from '../../../../shared/agent-session/view/structured-agent-session-tab'
import NativeChatView from '../native-chat/NativeChatView'
import { useBoardChatClaim } from './board-chat-owner'
import { BoardChatPreview } from './BoardChatPreview'

/**
 * The real chat inside a focused card. Text input needs no zoom correction: unlike xterm, it lets the
 * browser map the pointer through the board's CSS scale.
 */
export function BoardChatLive({
  worktreeId,
  tabId,
  sessionId
}: {
  worktreeId: string
  tabId: string
  sessionId: string
}): React.JSX.Element {
  const claimed = useBoardChatClaim(tabId)
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
  if (!claimed || !target || !tab || !isStructuredTab(tab) || !tab.agentSessionAgent) {
    return <BoardChatPreview sessionId={sessionId} />
  }
  return (
    <NativeChatView
      mode="structured"
      tabId={tabId}
      groupId={tab.groupId}
      sessionId={sessionId}
      agent={tab.agentSessionAgent}
      isVisible
      isFocusedGroup
      target={target}
    />
  )
}
