import type { BoardLayout } from './board-layout-state'

export const CONTENT_SAVE_DELAY_MS = 1_500
export const VIEW_SAVE_DELAY_MS = 3_000

export type LayoutAutoSaver = {
  /** The board changed: a real change saves soon; panning and zooming alone wait longer. */
  notify: (change: 'content' | 'view') => void
  /** Saves at once, for the menu and when the board closes. */
  saveNow: () => Promise<boolean>
  dispose: () => void
}

/**
 * Debounced saving. `build` answers null while there is nothing safe to save (restoring not finished, or no
 * named window alive), so an empty board can never replace a good file. An identical layout writes nothing.
 */
export function createLayoutAutoSaver(args: {
  build: () => string | null
  contentOf: (text: string) => string
  write: (text: string) => Promise<boolean>
  initialContent?: string | null
}): LayoutAutoSaver {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: 'content' | 'view' | null = null
  let last = args.initialContent ?? null
  const clear = (): void => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = null
    pending = null
  }
  const save = async (): Promise<boolean> => {
    clear()
    const text = args.build()
    if (text === null) {
      return false
    }
    const content = args.contentOf(text)
    if (content === last) {
      return true
    }
    const saved = await args.write(text).catch(() => false)
    if (saved) {
      last = content
    }
    return saved
  }
  return {
    notify: (change) => {
      // A view change never postpones a real change that is already waiting.
      if (pending === 'content' && change === 'view') {
        return
      }
      clear()
      pending = change
      timer = setTimeout(
        () => void save(),
        change === 'content' ? CONTENT_SAVE_DELAY_MS : VIEW_SAVE_DELAY_MS
      )
    },
    saveNow: save,
    dispose: () => {
      if (pending) {
        void save()
      }
    }
  }
}

/** Which part of the board changed: panning and zooming alone are saved less eagerly. */
export function boardChangeKind(
  before: BoardLayout,
  after: BoardLayout
): 'content' | 'view' | null {
  if (before === after) {
    return null
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof BoardLayout>
  keys.delete('viewport')
  // Sightings change with time, not with anything the user arranged.
  keys.delete('seenAt')
  for (const key of keys) {
    if (before[key] !== after[key]) {
      return 'content'
    }
  }
  return before.viewport === after.viewport ? null : 'view'
}
