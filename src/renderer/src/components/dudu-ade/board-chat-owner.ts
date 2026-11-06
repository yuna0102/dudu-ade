import { useLayoutEffect } from 'react'
import { create } from 'zustand'

/**
 * Which chat tabs' live views the board holds. One session has one composer, draft and visual owner, so while
 * a card holds a tab its workspace pane renders nothing; closing the board hands every one back.
 */
export const useBoardChatOwner = create<{ tabIds: Readonly<Record<string, number>> }>(() => ({
  tabIds: {}
}))

export function claimBoardChat(tabId: string): () => void {
  useBoardChatOwner.setState(({ tabIds }) => ({
    tabIds: { ...tabIds, [tabId]: (tabIds[tabId] ?? 0) + 1 }
  }))
  return () => {
    useBoardChatOwner.setState(({ tabIds }) => {
      const { [tabId]: count = 0, ...rest } = tabIds
      return { tabIds: count > 1 ? { ...rest, [tabId]: count - 1 } : rest }
    })
  }
}

export function isHeldByBoard(
  state: { tabIds: Readonly<Record<string, number>> },
  tabId: string
): boolean {
  return (state.tabIds[tabId] ?? 0) > 0
}

/** True once this tab's workspace pane has let go, so the card can mount its own view. */
export function useBoardChatClaim(tabId: string): boolean {
  useLayoutEffect(() => claimBoardChat(tabId), [tabId])
  return useBoardChatOwner((state) => isHeldByBoard(state, tabId))
}
