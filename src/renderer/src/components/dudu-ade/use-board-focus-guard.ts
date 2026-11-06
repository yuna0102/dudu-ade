import { useEffect } from 'react'

// Inputs of the workspace hidden behind the board. Menus and dialogs portal to the body and stay usable.
const BACKGROUND_INPUTS =
  '.xterm-helper-textarea, .monaco-editor textarea, [data-native-chat-root] textarea, [data-native-chat-root] [contenteditable]'

/** True when focus landed on a hidden workspace input, where keys and Cmd+V would go unseen. */
export function isBackgroundInput(target: EventTarget | null, board: Element): boolean {
  return target instanceof Element && target.matches(BACKGROUND_INPUTS) && !board.contains(target)
}

/**
 * The board covers the workspace but does not unmount it, so a pane keeps DOM focus and owns typing and
 * paste (each pane claims a paste when focus is inside it). While the board is open that focus is dropped.
 */
export function useBoardFocusGuard(
  rootRef: React.RefObject<HTMLElement | null>,
  open: boolean
): void {
  useEffect(() => {
    const board = rootRef.current
    if (!open || !board) {
      return
    }
    if (isBackgroundInput(document.activeElement, board)) {
      ;(document.activeElement as HTMLElement).blur()
    }
    const onFocusIn = (event: FocusEvent): void => {
      if (isBackgroundInput(event.target, board)) {
        ;(event.target as HTMLElement).blur()
      }
    }
    document.addEventListener('focusin', onFocusIn, true)
    return () => document.removeEventListener('focusin', onFocusIn, true)
  }, [rootRef, open])
}
