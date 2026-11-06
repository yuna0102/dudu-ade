import { afterEach, describe, expect, it } from 'vitest'
import { claimBoardChat, isHeldByBoard, useBoardChatOwner } from './board-chat-owner'

afterEach(() => useBoardChatOwner.setState({ tabIds: {} }))

describe('board chat owner', () => {
  it('gives the tab back on release', () => {
    const release = claimBoardChat('a')
    expect(isHeldByBoard(useBoardChatOwner.getState(), 'a')).toBe(true)
    release()
    expect(isHeldByBoard(useBoardChatOwner.getState(), 'a')).toBe(false)
  })

  it('does not take a tab from another card when an earlier claim releases', () => {
    const releaseA = claimBoardChat('a')
    claimBoardChat('b')
    releaseA()
    expect(isHeldByBoard(useBoardChatOwner.getState(), 'b')).toBe(true)
  })
})
