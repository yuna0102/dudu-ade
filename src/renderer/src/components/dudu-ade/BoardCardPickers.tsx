import { FolderOpen } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { parseOutIndex } from '../../../../shared/dudu-ade-out-index'
import type { RecentMarkdown } from '../../../../shared/dudu-ade-terminal-models'
import { assetDisplayName } from './AssetPreview'
import { artifactChoices, type ArtifactChoice } from './board-artifact-choices'
import type { BoardNote, BoardNoteKind } from './board-layout-state'
import { newBoardId } from './board-layout-state'
import { boardTerminalKey } from './board-terminal-listing'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'

export type BoardCardPicker = 'artifact' | 'markdown'

type AddNote = (kind: BoardNoteKind, note?: Partial<BoardNote>) => string

function ArtifactPicker({
  onAdd,
  onDone
}: {
  onAdd: AddNote
  onDone: () => void
}): React.JSX.Element {
  const assets = useDuduAdeStore((s) => s.assets)
  const [index, setIndex] = useState<{ outRoot: string; text: string } | null>(null)
  const [query, setQuery] = useState('')
  useEffect(() => {
    void window.api.shell.duduAdeReadOutIndex?.().then(setIndex)
  }, [])
  const choices = useMemo(
    () =>
      artifactChoices(
        assets.map((asset) => ({ ...asset, name: assetDisplayName(asset) })),
        index ? parseOutIndex(index.text) : [],
        index?.outRoot ?? '',
        query
      ),
    [assets, index, query]
  )
  const pick = (choice: ArtifactChoice): void => {
    if (choice.localMarkdown) {
      onAdd('markdown', { filePath: choice.localMarkdown })
      onDone()
      return
    }
    const key = onAdd('artifact', {
      title: choice.title,
      url: choice.url ?? undefined,
      localHtml: choice.localHtml ?? undefined
    })
    const store = useDuduAdeStore.getState()
    const source = choice.source ? boardTerminalKey(choice.source) : null
    // Shows which window made it, when that window is on this board.
    if (source && store.board.cards[source]) {
      store.updateBoard((board) => ({
        links: [
          ...board.links,
          { id: newBoardId(), from: source, to: key, label: DUDU_ADE_COPY.artifactMadeBy }
        ]
      }))
    }
    onDone()
  }
  return (
    <>
      <input
        autoFocus
        className="h-8 rounded-md border border-border bg-transparent px-2 text-sm outline-none"
        placeholder={DUDU_ADE_COPY.artifactSearch}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="max-h-96 overflow-y-auto scrollbar-sleek">
        {choices.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {DUDU_ADE_COPY.artifactEmpty}
          </div>
        ) : null}
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
            onClick={() => pick(choice)}
          >
            <span className="truncate text-sm">{choice.title}</span>
            <span className="truncate text-2xs text-muted-foreground">{choice.detail}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function MarkdownPicker({
  onAdd,
  onDone
}: {
  onAdd: AddNote
  onDone: () => void
}): React.JSX.Element {
  const [recent, setRecent] = useState<RecentMarkdown[]>([])
  const [name, setName] = useState('')
  useEffect(() => {
    void window.api.shell.duduAdeRecentMarkdown?.().then(setRecent)
  }, [])
  const open = (filePath: string): void => {
    onAdd('markdown', { filePath })
    onDone()
  }
  const create = async (): Promise<void> => {
    const path = await window.api.shell.duduAdeCreateMarkdown?.(name).catch(() => null)
    if (path) {
      open(path)
    } else {
      toast(DUDU_ADE_COPY.markdownCreateFailed)
    }
  }
  return (
    <>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        <input
          autoFocus
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 text-sm outline-none"
          placeholder={DUDU_ADE_COPY.markdownNameHint}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={!name.trim()}>
          {DUDU_ADE_COPY.markdownCreate}
        </Button>
      </form>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void window.api.shell.duduAdePickMarkdown?.().then((path) => {
            if (path) {
              open(path)
            }
          })
        }}
      >
        <FolderOpen />
        {DUDU_ADE_COPY.markdownOpenFile}
      </Button>
      <div className="text-2xs text-muted-foreground">{DUDU_ADE_COPY.markdownRecent}</div>
      <div className="max-h-72 overflow-y-auto scrollbar-sleek">
        {recent.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {DUDU_ADE_COPY.markdownRecentEmpty}
          </div>
        ) : null}
        {recent.map((item) => (
          <button
            key={item.path}
            type="button"
            className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
            onClick={() => {
              void window.api.shell.duduAdeAdoptMarkdown?.(item.path).then((adopted) => {
                if (adopted) {
                  open(item.path)
                }
              })
            }}
          >
            <span className="truncate text-sm">{item.name}</span>
            <span className="truncate font-mono text-2xs text-muted-foreground">{item.path}</span>
          </button>
        ))}
      </div>
    </>
  )
}

/** The two add-menu entries that need a choice before a card exists. */
export function BoardCardPickers({
  picker,
  onClose,
  onAddNote
}: {
  picker: BoardCardPicker | null
  onClose: () => void
  onAddNote: AddNote
}): React.JSX.Element {
  return (
    <Dialog open={picker !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-w-xl flex-col gap-2">
        <DialogHeader>
          <DialogTitle>
            {picker === 'markdown' ? DUDU_ADE_COPY.markdownPick : DUDU_ADE_COPY.artifactPick}
          </DialogTitle>
        </DialogHeader>
        {picker === 'artifact' ? <ArtifactPicker onAdd={onAddNote} onDone={onClose} /> : null}
        {picker === 'markdown' ? <MarkdownPicker onAdd={onAddNote} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}
