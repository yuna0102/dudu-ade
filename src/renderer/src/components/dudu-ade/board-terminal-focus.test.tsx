// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dispatchAppMenuPasteEvent } from '@/lib/app-menu-paste'
import { installPreviewTerminalAppMenuClipboard } from '../dashboard-popout/preview-terminal-app-menu-clipboard'
import { createPreviewClipboardPaster } from '../dashboard-popout/preview-terminal-paste'
import {
  boardWheelRoute,
  focusViewportFor,
  hasScrollRoom,
  interpolateViewport,
  isStationaryClick,
  nextTerminalFontSize,
  wheelPanDelta
} from './board-terminal-focus'
import { newTerminalKey } from './board-chat-carry'
import { useBoardCardInputFocus } from './use-unscaled-terminal-mouse'
import { useBoardFocusGuard } from './use-board-focus-guard'

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))

const pasted = vi.hoisted(() => [] as { text: string; force?: boolean }[])
vi.mock('@/components/terminal-pane/terminal-bracketed-paste', async (original) => ({
  ...(await original<object>()),
  pasteTerminalText: (
    _terminal: unknown,
    text: string,
    options?: { forceBracketedPaste?: boolean }
  ) => {
    pasted.push({ text, force: options?.forceBracketedPaste })
  }
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  pasted.length = 0
})

function Body({ focused }: { focused: boolean }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useBoardCardInputFocus(ref, focused)
  return (
    <div ref={ref} data-testid="body">
      <textarea className="xterm-helper-textarea" />
      <div className="xterm-screen" />
      <div data-testid="blank" />
    </div>
  )
}

describe('card body states', () => {
  it('sends wheel to the board unless a focused terminal or a scrollable body wants it', () => {
    const base = {
      modified: false,
      insideCardBody: true,
      insideLockedBody: false,
      insideFocusedCard: false,
      canScrollHere: false
    }
    expect(boardWheelRoute({ ...base, insideLockedBody: true })).toBe('pan')
    expect(boardWheelRoute({ ...base, insideLockedBody: true, canScrollHere: true })).toBe('pan')
    expect(boardWheelRoute({ ...base, insideFocusedCard: true })).toBe('card')
    expect(boardWheelRoute({ ...base, canScrollHere: true })).toBe('card')
    expect(boardWheelRoute(base)).toBe('pan')
    expect(boardWheelRoute({ ...base, modified: true, insideFocusedCard: true })).toBe('zoom')
    expect(boardWheelRoute({ ...base, insideCardBody: false })).toBe('pan')
  })

  it('converts mouse wheel lines and pages to pixels, and Shift to sideways', () => {
    const wheel = { deltaX: 0, deltaY: 3, deltaMode: 0, shiftKey: false }
    expect(wheelPanDelta(wheel, 800)).toEqual({ x: 0, y: 3 })
    expect(wheelPanDelta({ ...wheel, deltaMode: 1 }, 800)).toEqual({ x: 0, y: 120 })
    expect(wheelPanDelta({ ...wheel, deltaY: 1, deltaMode: 2 }, 800)).toEqual({ x: 0, y: 800 })
    expect(wheelPanDelta({ ...wheel, shiftKey: true }, 800)).toEqual({ x: 3, y: 0 })
    expect(wheelPanDelta({ ...wheel, deltaX: 5, shiftKey: true }, 800)).toEqual({ x: 5, y: 3 })
  })

  it('counts scroll room only where the box scrolls and has somewhere to go', () => {
    const box = {
      scrollTop: 0,
      scrollHeight: 500,
      clientHeight: 100,
      scrollLeft: 0,
      scrollWidth: 100,
      clientWidth: 100,
      overflowX: 'visible',
      overflowY: 'auto'
    }
    expect(hasScrollRoom(box, 0, 10)).toBe(true)
    expect(hasScrollRoom(box, 0, -10)).toBe(false)
    expect(hasScrollRoom({ ...box, scrollTop: 400 }, 0, 10)).toBe(false)
    expect(hasScrollRoom({ ...box, overflowY: 'hidden' }, 0, 10)).toBe(false)
    expect(hasScrollRoom(box, 10, 0)).toBe(false)
  })

  it('treats only a press that did not travel as a click', () => {
    expect(isStationaryClick({ x: 10, y: 10 }, { x: 12, y: 12 })).toBe(true)
    expect(isStationaryClick({ x: 10, y: 10 }, { x: 30, y: 10 })).toBe(false)
  })

  it('takes keyboard focus when focused, gives it back when not', () => {
    const view = render(<Body focused />)
    const input = view.container.querySelector('textarea')!
    expect(document.activeElement).toBe(input)
    view.rerender(<Body focused={false} />)
    expect(document.activeElement).not.toBe(input)
  })

  it('keeps focus on the terminal when the blank area below the grid is pressed', () => {
    const view = render(<Body focused />)
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    view.getByTestId('blank').dispatchEvent(press)
    expect(press.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(view.container.querySelector('textarea'))
  })

  it('routes the Cmd+V menu paste to the focused card only', () => {
    const paste = vi.fn()
    const view = render(<Body focused />)
    const dispose = installPreviewTerminalAppMenuClipboard({
      container: view.getByTestId('body'),
      getTerminal: () => null,
      pasteClipboardText: paste
    })
    expect(dispatchAppMenuPasteEvent()).toBe(true)
    expect(paste).toHaveBeenCalledWith(view.container.querySelector('textarea'), 'app-menu')
    view.rerender(<Body focused={false} />)
    paste.mockClear()
    expect(dispatchAppMenuPasteEvent()).toBe(false)
    expect(paste).not.toHaveBeenCalled()
    dispose()
  })
})

describe('clipboard image paste', () => {
  it('pastes the saved image path when the clipboard has no text', async () => {
    vi.stubGlobal('api', undefined)
    const ui = {
      readClipboardText: vi.fn().mockResolvedValue(''),
      saveClipboardImageAsTempFile: vi.fn().mockResolvedValue('/tmp/shot.png')
    }
    Object.assign(window, { api: { ui } })
    const container = document.createElement('div')
    const input = document.createElement('textarea')
    container.append(input)
    document.body.append(container)
    input.focus()
    const terminal = { modes: { bracketedPasteMode: true } }
    const paste = createPreviewClipboardPaster({
      ptyId: 'pty-1',
      writeInput: () => true,
      container,
      getTerminal: () => terminal as never,
      getTerminalInput: () => null,
      isDisposed: () => false
    })
    await paste(input, 'app-menu')
    expect(pasted).toEqual([{ text: '/tmp/shot.png', force: true }])
    container.remove()
  })
})

describe('click to zoom', () => {
  const screen = { width: 1000, height: 800 }
  const rect = { x: 100, y: 100, w: 500, h: 400 }

  it('centers and enlarges a small card', () => {
    const next = focusViewportFor(rect, { x: 0, y: 0, zoom: 0.3 }, screen)!
    expect(next.zoom).toBeCloseTo(1.6)
    expect(next.x + (rect.x + rect.w / 2) * next.zoom).toBeCloseTo(500)
    expect(next.y + (rect.y + rect.h / 2) * next.zoom).toBeCloseTo(400)
  })

  it('leaves the view alone when the card is already large', () => {
    expect(focusViewportFor(rect, { x: 0, y: 0, zoom: 1.5 }, screen)).toBeNull()
  })

  it('stays inside the board zoom limit', () => {
    expect(
      focusViewportFor({ ...rect, w: 100, h: 80 }, { x: 0, y: 0, zoom: 0.2 }, screen)?.zoom
    ).toBe(2)
  })

  it('interpolates from start to end', () => {
    const from = { x: 0, y: 0, zoom: 0.5 }
    const to = { x: 100, y: 100, zoom: 1 }
    expect(interpolateViewport(from, to, 0)).toEqual(from)
    expect(interpolateViewport(from, to, 1)).toEqual(to)
  })
})

describe('terminal font keys', () => {
  it('steps inside the same limits as a real pane, and 0 returns to default', () => {
    expect(nextTerminalFontSize(14, 'in')).toBe(15)
    expect(nextTerminalFontSize(8, 'out')).toBe(8)
    expect(nextTerminalFontSize(32, 'in')).toBe(32)
    expect(nextTerminalFontSize(20, 'reset')).toBe(14)
  })
})

describe('chat to terminal', () => {
  it('finds the terminal that appeared in the chat workspace', () => {
    const terminals = [
      { key: 'old', tabId: 't1', worktreeId: 'wt' },
      { key: 'elsewhere', tabId: 't9', worktreeId: 'other' },
      { key: 'new', tabId: 't2', worktreeId: 'wt' }
    ]
    expect(newTerminalKey(terminals, 'wt', new Set(['t1']))).toBe('new')
    expect(newTerminalKey(terminals.slice(0, 1), 'wt', new Set(['t1']))).toBeNull()
  })
})

describe('board open over a workspace', () => {
  function Screen({ open }: { open: boolean }): React.JSX.Element {
    const ref = useRef<HTMLDivElement>(null)
    useBoardFocusGuard(ref, open)
    return (
      <>
        <div data-testid="back">
          <textarea className="xterm-helper-textarea" data-testid="back-input" />
        </div>
        <div ref={ref}>
          <textarea className="xterm-helper-textarea" data-testid="card-input" />
        </div>
      </>
    )
  }

  it('takes focus off the hidden terminal so its paste listener cannot claim Cmd+V', () => {
    const view = render(<Screen open={false} />)
    const back = view.getByTestId('back-input')
    back.focus()
    expect(document.activeElement).toBe(back)
    view.rerender(<Screen open />)
    expect(document.activeElement).not.toBe(back)

    const backPaste = vi.fn()
    const dispose = installPreviewTerminalAppMenuClipboard({
      container: view.getByTestId('back'),
      getTerminal: () => null,
      pasteClipboardText: backPaste
    })
    dispatchAppMenuPasteEvent()
    expect(backPaste).not.toHaveBeenCalled()
    dispose()
  })

  it('stops the hidden terminal taking focus back, but leaves the card alone', () => {
    const view = render(<Screen open />)
    view.getByTestId('back-input').focus()
    expect(document.activeElement).not.toBe(view.getByTestId('back-input'))
    view.getByTestId('card-input').focus()
    expect(document.activeElement).toBe(view.getByTestId('card-input'))
  })

  it('leaves the workspace alone once the board closes', () => {
    const view = render(<Screen open={false} />)
    view.getByTestId('back-input').focus()
    expect(document.activeElement).toBe(view.getByTestId('back-input'))
  })
})
