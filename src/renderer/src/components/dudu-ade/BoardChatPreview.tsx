import { useEffect, useState } from 'react'
import { readStructuredAgentSessionConversationOutline } from '@/runtime/structured-agent-session-client'
import type { AgentSessionConversationOutlineEntry } from '../../../../shared/agent-session/agent-session-conversation-outline'
import { DUDU_ADE_COPY } from './dudu-ade-copy'

const OUTLINE_POLL_MS = 5_000
const OUTLINE_GIVE_UP_MS = 15_000
const SHOWN_TURNS = 4

/** Read-only text of a chat's latest turns; the live chat stays in its own tab. */
export function BoardChatPreview({ sessionId }: { sessionId: string }): React.JSX.Element {
  const [entries, setEntries] = useState<AgentSessionConversationOutlineEntry[] | 'failed' | null>(
    null
  )
  useEffect(() => {
    let stopped = false
    const read = (): void => {
      void readStructuredAgentSessionConversationOutline({ kind: 'local' }, sessionId)
        .then((outline) => {
          if (!stopped) {
            // A late answer replaces the failure note.
            setEntries(outline ? outline.entries.slice(-SHOWN_TURNS) : [])
          }
        })
        // A chat whose session never started answers with an error on every read; say so instead of loading forever.
        .catch(() => {
          if (!stopped) {
            setEntries((current) => current ?? 'failed')
          }
        })
    }
    read()
    const interval = setInterval(read, OUTLINE_POLL_MS)
    // A chat whose host never answers neither resolves nor rejects.
    const giveUp = setTimeout(
      () => setEntries((current) => current ?? 'failed'),
      OUTLINE_GIVE_UP_MS
    )
    return () => {
      stopped = true
      clearInterval(interval)
      clearTimeout(giveUp)
    }
  }, [sessionId])
  if (entries === 'failed') {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {DUDU_ADE_COPY.chatUnavailable}
      </div>
    )
  }
  if (!entries || entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        {entries ? DUDU_ADE_COPY.chatEmpty : DUDU_ADE_COPY.chatLoading}
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col justify-end gap-2 overflow-y-auto scrollbar-sleek p-3 text-xs">
      {entries.map((entry) => (
        <div key={entry.itemId} className="flex flex-col gap-1">
          <div className="self-end max-w-[85%] rounded-lg bg-[#F1EDFF] px-2.5 py-1.5 text-[#1C1D22] dark:bg-[#6E48E5]/30 dark:text-foreground">
            {entry.preview || DUDU_ADE_COPY.chatImageOnly}
          </div>
          {entry.reply ? (
            <div className="max-w-[90%] rounded-lg bg-muted px-2.5 py-1.5 line-clamp-4">
              {entry.reply}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
