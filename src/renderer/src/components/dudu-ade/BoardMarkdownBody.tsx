import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { markdownSyncAction } from './board-markdown-sync'
import { DUDU_ADE_COPY } from './dudu-ade-copy'

const SAVE_DEBOUNCE_MS = 800
const POLL_MS = 3_000

type Trouble = 'missing' | 'denied' | 'conflict' | 'failed' | null

/** A Markdown file on the board: rendered, or edited in place with saves back to the file. */
export function BoardMarkdownBody({ filePath }: { filePath: string }): React.JSX.Element {
  const [content, setContent] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [trouble, setTrouble] = useState<Trouble>(null)
  const mtime = useRef<number | null>(null)
  const dirty = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (): Promise<void> => {
    const read = await window.api.shell.duduAdeReadMarkdown?.(filePath)
    if (!read) {
      return
    }
    const action = markdownSyncAction({
      disk: read.status === 'ok' ? { status: 'ok', mtime: read.mtime } : read,
      knownMtime: mtime.current,
      dirty: dirty.current
    })
    if (action === 'missing' || action === 'denied' || action === 'conflict') {
      setTrouble(action)
      return
    }
    setTrouble((current) => (current === 'failed' ? current : null))
    if (action === 'reload' && read.status === 'ok') {
      mtime.current = read.mtime
      setContent(read.content)
    }
  }, [filePath])

  useEffect(() => {
    void load().catch(() => setTrouble('failed'))
    const interval = setInterval(() => void load().catch(() => undefined), POLL_MS)
    return () => {
      clearInterval(interval)
    }
  }, [load])

  const save = useCallback(
    async (text: string): Promise<void> => {
      if (mtime.current === null) {
        return
      }
      const result = await window.api.shell.duduAdeWriteMarkdown?.({
        path: filePath,
        content: text,
        expectedMtime: mtime.current
      })
      if (result?.status === 'ok') {
        mtime.current = result.mtime
        dirty.current = false
        setTrouble(null)
      } else if (result) {
        setTrouble(result.status)
      }
    },
    [filePath]
  )

  const latest = useRef<string | null>(null)
  const flush = useCallback((): void => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      if (latest.current !== null) {
        void save(latest.current).catch(() => setTrouble('failed'))
      }
    }
  }, [save])
  // Leaving the board or removing the card must not lose the last keystrokes.
  useEffect(() => flush, [flush])

  const onEdit = (text: string): void => {
    setContent(text)
    latest.current = text
    dirty.current = true
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
    }
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      void save(text).catch(() => setTrouble('failed'))
    }, SAVE_DEBOUNCE_MS)
  }

  const reloadFromDisk = (): void => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    dirty.current = false
    mtime.current = null
    setTrouble(null)
    void load().catch(() => setTrouble('failed'))
  }

  if (trouble === 'missing' || trouble === 'denied') {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {trouble === 'missing' ? DUDU_ADE_COPY.markdownMissing : DUDU_ADE_COPY.markdownDenied}
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
        <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground">
          {filePath}
        </span>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            flush()
            setEditing(!editing)
          }}
        >
          {editing ? DUDU_ADE_COPY.markdownView : DUDU_ADE_COPY.markdownEdit}
        </Button>
      </div>
      {trouble === 'conflict' || trouble === 'failed' ? (
        <div className="flex shrink-0 items-center gap-2 bg-[#F1EDFF] px-2 py-1 text-xs text-[#1C1D22]">
          <span className="min-w-0 flex-1">
            {trouble === 'conflict'
              ? DUDU_ADE_COPY.markdownConflict
              : DUDU_ADE_COPY.markdownSaveFailed}
          </span>
          <Button variant="ghost" size="xs" onClick={reloadFromDisk}>
            {DUDU_ADE_COPY.markdownReload}
          </Button>
        </div>
      ) : null}
      {editing ? (
        <textarea
          className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-xs outline-none"
          value={content ?? ''}
          onChange={(event) => onEdit(event.target.value)}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek p-3 select-text">
          <CommentMarkdown content={content ?? ''} variant="document" />
        </div>
      )}
    </div>
  )
}
