import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BoardArtifactWebview } from './BoardArtifactWebview'
import { Button } from '@/components/ui/button'
import type { BoardNote } from './board-layout-state'
import { DUDU_ADE_COPY } from './dudu-ade-copy'

/**
 * A local page served from its own folder, so split files load; the iframe sandbox has no same-origin, so its scripts run but cannot reach the app.
 * Undefined while asking, null when the page cannot be served.
 */
export function useArtifactPageUrl(path: string | undefined): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!path) {
      setUrl(null)
      return
    }
    let cancelled = false
    setUrl(undefined)
    void (window.api.shell.duduAdeArtifactPageUrl?.(path) ?? Promise.resolve(null))
      .then((next) => {
        if (!cancelled) {
          setUrl(next)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUrl(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [path])
  return url
}

/** A local page, or else the claude.ai page itself in a guest of the built-in browser, which keeps its own login. */
export function BoardArtifactBody({ note }: { note: BoardNote }): React.JSX.Element {
  const path = note.localHtml
  const pageUrl = useArtifactPageUrl(path)
  return (
    <div className="flex h-full flex-col">
      {pageUrl ? (
        <iframe
          title={note.title ?? path ?? ''}
          sandbox="allow-scripts"
          src={pageUrl}
          className="min-h-0 flex-1 border-0 bg-white"
        />
      ) : note.url && (!path || pageUrl === null) ? (
        <div className="relative flex min-h-0 flex-1">
          <BoardArtifactWebview url={note.url} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
          <div className="text-sm font-medium">{note.title}</div>
          <div className="text-xs text-muted-foreground">
            {path ? DUDU_ADE_COPY.previewUnavailable : DUDU_ADE_COPY.artifactNoLocal}
          </div>
        </div>
      )}
      {note.url ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-border px-2 py-1">
          <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground">
            {note.url}
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void window.api.shell.openUrl(note.url ?? '')}
          >
            <ExternalLink />
            {DUDU_ADE_COPY.artifactOpen}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
