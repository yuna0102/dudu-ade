import { afterEach, describe, expect, it } from 'vitest'
import { claimBoardChat, useBoardChatOwner } from './board-chat-owner'

afterEach(() => useBoardChatOwner.setState({ tabId: null }))

describe('board chat owner', () => {
  it('gives the tab back on release', () => {
    const release = claimBoardChat('a')
    expect(useBoardChatOwner.getState().tabId).toBe('a')
    release()
    expect(useBoardChatOwner.getState().tabId).toBeNull()
  })

  it('does not take the tab from the next card when an earlier claim releases late', () => {
    const releaseA = claimBoardChat('a')
    claimBoardChat('b')
    releaseA()
    expect(useBoardChatOwner.getState().tabId).toBe('b')
  })
})
