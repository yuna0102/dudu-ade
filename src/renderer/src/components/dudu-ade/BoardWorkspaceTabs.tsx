import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'

/** Saved boards as tabs: switch, add, rename (double-click) and delete. */
export function BoardWorkspaceTabs(): React.JSX.Element {
  const workspaces = useDuduAdeStore((s) => s.workspaces)
  const switchBoard = useDuduAdeStore((s) => s.switchBoard)
  const addBoard = useDuduAdeStore((s) => s.addBoard)
  const renameBoard = useDuduAdeStore((s) => s.renameBoard)
  const deleteBoard = useDuduAdeStore((s) => s.deleteBoard)
  const [editingId, setEditingId] = useState<string | null>(null)
  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-card px-2">
      {workspaces.boards.map((board) => {
        const active = board.id === workspaces.activeId
        return (
          <div
            key={board.id}
            className={cn(
              'group flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-xs',
              active ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-muted/60'
            )}
          >
            {editingId === board.id ? (
              <input
                autoFocus
                className="h-5 w-28 rounded border border-border bg-background px-1 text-xs outline-none"
                defaultValue={board.name}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  } else if (event.key === 'Escape') {
                    setEditingId(null)
                  }
                }}
                onBlur={(event) => {
                  setEditingId(null)
                  const name = event.currentTarget.value.trim()
                  if (name) {
                    renameBoard(board.id, name)
                  }
                }}
              />
            ) : (
              <button
                type="button"
                title={DUDU_ADE_COPY.renameHint}
                onClick={() => switchBoard(board.id)}
                onDoubleClick={() => setEditingId(board.id)}
              >
                {board.name}
              </button>
            )}
            {workspaces.boards.length > 1 ? (
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100"
                aria-label={DUDU_ADE_COPY.deleteBoard}
                title={DUDU_ADE_COPY.deleteBoard}
                onClick={() => {
                  if (window.confirm(`${board.name}: ${DUDU_ADE_COPY.deleteBoardConfirm}`)) {
                    deleteBoard(board.id)
                  }
                }}
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        )
      })}
      <button
        type="button"
        className="flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        onClick={() => addBoard(`${DUDU_ADE_COPY.newBoard} ${workspaces.boards.length + 1}`)}
        title={DUDU_ADE_COPY.newBoardHint}
      >
        <Plus className="size-3" />
        {DUDU_ADE_COPY.newBoard}
      </button>
    </div>
  )
}
