import type { Terminal } from '@xterm/xterm'
import { PaneReparentFrameTracker } from '@/lib/pane-manager/pane-reparent-frame-tracker'

type PreviewBoxFitTerminal = Pick<Terminal, 'rows' | 'buffer' | 'modes'>

/** Replay at real PTY dimensions to avoid ANSI rewrap corruption; scale oversized frames and anchor the end containing the cursor. */
export function createPreviewBoxFit(args: {
  container: HTMLElement
  getTerminal: () => PreviewBoxFitTerminal | null
}): { fit: () => void; schedule: () => void; dispose: () => void } {
  let disposed = false
  let lastAnchorTop: boolean | null = null
  const frames = new PaneReparentFrameTracker(() => disposed)
  const fit = (): void => {
    const terminal = args.getTerminal()
    const screen = args.container.querySelector<HTMLElement>('.xterm-screen')
    const box = args.container.parentElement
    if (!screen || !box || !terminal) {
      return
    }
    const scale = Math.min(1, box.clientWidth / Math.max(1, screen.offsetWidth))
    args.container.style.transform = scale < 1 ? `scale(${scale})` : ''
    const cellHeight = screen.offsetHeight / Math.max(1, terminal.rows)
    const cursorBottom = (terminal.buffer.active.cursorY + 1) * cellHeight * scale
    // Hysteresis of one row: a prompt on the last row sits at the box edge, and rounding there flipped the anchor on every keystroke.
    const slack = cellHeight * scale
    // Mid synchronized redraw the cursor is wherever the TUI is painting, not where it will rest.
    const settled = !terminal.modes.synchronizedOutputMode
    const anchorTop =
      lastAnchorTop === null || (settled && Math.abs(cursorBottom - box.clientHeight) > slack)
        ? cursorBottom <= box.clientHeight
        : lastAnchorTop
    lastAnchorTop = anchorTop
    box.style.alignItems = anchorTop ? 'flex-start' : 'flex-end'
    args.container.style.transformOrigin = anchorTop ? 'top left' : 'bottom left'
  }

  // Re-fit after every parsed write (cursor may move ends); rAF coalesces.
  let scheduled = false
  const schedule = (): void => {
    if (disposed || scheduled) {
      return
    }
    scheduled = true
    frames.request(() => {
      scheduled = false
      fit()
    })
  }

  return {
    fit,
    schedule,
    dispose: (): void => {
      if (disposed) {
        return
      }
      disposed = true
      frames.cancelPending()
    }
  }
}
