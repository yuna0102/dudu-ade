// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { boardChatKey } from './board-links'
import { useBoardTerminalFocus } from './use-board-terminal-focus'

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))

const press = (board: Element, target: Element): React.PointerEvent =>
  ({ currentTarget: board, target }) as unknown as React.PointerEvent

describe('pressing outside the focused chat card', () => {
  const key = boardChatKey('w', 't')
  const setup = () => {
    const board = document.createElement('div')
    const onBoard = board.appendChild(document.createElement('div'))
    const { result } = renderHook(() =>
      useBoardTerminalFocus({
        rectFor: () => null,
        screen: { width: 100, height: 100 },
        viewportStateRef: { current: { x: 0, y: 0, zoom: 1 } },
        setPanViewport: () => undefined,
        setViewport: () => undefined
      })
    )
    act(() => result.current.activateCard(key))
    return { board, onBoard, result }
  }

  it('keeps it for a menu the chat portaled out of the board', () => {
    const { board, result } = setup()
    act(() =>
      result.current.onBoardPointerDownCapture(press(board, document.createElement('button')))
    )
    expect(result.current.focusedKey).toBe(key)
  })

  it('leaves it for a press on the board itself', () => {
    const { board, onBoard, result } = setup()
    act(() => result.current.onBoardPointerDownCapture(press(board, onBoard)))
    expect(result.current.focusedKey).toBeNull()
  })
})
