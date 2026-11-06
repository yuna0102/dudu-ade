import { useLayoutEffect } from 'react'
import { create } from 'zustand'

/**
 * Which chat tab's live view the board holds. One session has one composer, draft and visual owner, so
 * while a card holds a tab its workspace pane renders nothing; releasing it brings that pane back.
 */
export const useBoardChatOwner = create<{ tabId: string | null }>(() => ({ tabId: null }))

export function claimBoardChat(tabId: string): () => void {
  useBoardChatOwner.setState({ tabId })
  return () => {
    // The next card's claim may have landed first.
    if (useBoardChatOwner.getState().tabId === tabId) {
      useBoardChatOwner.setState({ tabId: null })
    }
  }
}

/** True once this tab's workspace pane has let go, so the card can mount its own view. */
export function useBoardChatClaim(tabId: string): boolean {
  useLayoutEffect(() => claimBoardChat(tabId), [tabId])
  return useBoardChatOwner((state) => state.tabId === tabId)
}
