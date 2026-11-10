import { memo, useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckSquare,
  Columns3,
  ExternalLink,
  FileBox,
  FileText,
  GitBranch,
  Globe,
  Plus,
  RotateCw,
  StickyNote,
  Trash2,
  Type
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { cn } from '@/lib/utils'
import type { GitStatusResult } from '../../../../shared/git-status-types'
import {
  newBoardId,
  type BoardCardGeometry,
  type BoardNote,
  type BoardNoteItem
} from './board-layout-state'
import { BoardCardFrame } from './BoardCardFrame'
import { BoardArtifactBody } from './BoardArtifactBody'
import { BoardMarkdownBody } from './BoardMarkdownBody'
import type { BoardCardChange } from './use-board-card-drag'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'

const STICKY_COLORS = ['#FFF4B8', '#FFD9E1', '#D7F5E3', '#DCE8FF', '#EDE3FF']
const KANBAN_COLUMNS = ['할 일', '진행 중', '완료']
const GIT_REFRESH_MS = 15_000

const KIND_META: Record<BoardNote['kind'], { label: string; icon: typeof StickyNote }> = {
  sticky: { label: '스티커 메모', icon: StickyNote },
  text: { label: '텍스트', icon: Type },
  checklist: { label: '체크리스트', icon: CheckSquare },
  kanban: { label: '칸반', icon: Columns3 },
  web: { label: '웹 타일', icon: Globe },
  git: { label: 'Git', icon: GitBranch },
  artifact: { label: '아티팩트', icon: FileBox },
  markdown: { label: 'MD 문서', icon: FileText }
}

export function noteKindLabel(kind: BoardNote['kind']): string {
  return KIND_META[kind].label
}

/** Text that saves on blur, so typing does not write storage on every key. */
function DraftTextarea({
  value,
  onSave,
  className,
  placeholder,
  style
}: {
  value: string
  onSave: (value: string) => void
  className?: string
  placeholder?: string
  style?: React.CSSProperties
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <textarea
      className={cn('h-full w-full resize-none bg-transparent p-3 outline-none', className)}
      style={style}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
    />
  )
}

function ItemInput({
  onAdd,
  placeholder
}: {
  onAdd: (text: string) => void
  placeholder: string
}): React.JSX.Element {
  const [text, setText] = useState('')
  const submit = (): void => {
    if (text.trim()) {
      onAdd(text.trim())
      setText('')
    }
  }
  return (
    <div className="flex items-center gap-1">
      <input
        className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-xs outline-none"
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && !isImeOwnedKeyboardEvent(event) && submit()}
      />
      <Button variant="ghost" size="icon-xs" aria-label="추가" onClick={submit}>
        <Plus />
      </Button>
    </div>
  )
}

function Checklist({
  items,
  onChange
}: {
  items: BoardNoteItem[]
  onChange: (items: BoardNoteItem[]) => void
}): React.JSX.Element {
  const done = items.filter((item) => item.done).length
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-auto scrollbar-sleek p-2.5 text-xs">
      <div className="text-3xs text-muted-foreground">{`완료 ${done} / ${items.length}`}</div>
      {items.map((item) => (
        <label key={item.id} className="group flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.done === true}
            onChange={() =>
              onChange(
                items.map((entry) =>
                  entry.id === item.id ? { ...entry, done: !entry.done } : entry
                )
              )
            }
          />
          <span className={cn('flex-1', item.done && 'text-muted-foreground line-through')}>
            {item.text}
          </span>
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100"
            aria-label="삭제"
            onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}
          >
            <Trash2 className="size-3 text-muted-foreground" />
          </button>
        </label>
      ))}
      <ItemInput
        placeholder="항목 추가"
        onAdd={(text) => onChange([...items, { id: newBoardId(), text }])}
      />
    </div>
  )
}

function Kanban({
  items,
  onChange
}: {
  items: BoardNoteItem[]
  onChange: (items: BoardNoteItem[]) => void
}): React.JSX.Element {
  const move = (id: string, delta: number): void =>
    onChange(
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              column: Math.min(KANBAN_COLUMNS.length - 1, Math.max(0, (item.column ?? 0) + delta))
            }
          : item
      )
    )
  return (
    <div className="grid h-full grid-cols-3 gap-2 overflow-auto scrollbar-sleek p-2 text-xs">
      {KANBAN_COLUMNS.map((title, column) => (
        <div key={title} className="flex min-w-0 flex-col gap-1.5 rounded-md bg-muted/50 p-1.5">
          <div className="text-2xs font-medium text-muted-foreground">
            {`${title} ${items.filter((item) => (item.column ?? 0) === column).length}`}
          </div>
          {items
            .filter((item) => (item.column ?? 0) === column)
            .map((item) => (
              <div key={item.id} className="group rounded border border-border bg-card p-1.5">
                <div className="break-words">{item.text}</div>
                <div className="mt-1 flex justify-end opacity-0 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="왼쪽으로"
                    disabled={column === 0}
                    onClick={() => move(item.id, -1)}
                  >
                    <ArrowLeft />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="오른쪽으로"
                    disabled={column === KANBAN_COLUMNS.length - 1}
                    onClick={() => move(item.id, 1)}
                  >
                    <ArrowRight />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="삭제"
                    onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          {column === 0 ? (
            <ItemInput
              placeholder="카드 추가"
              onAdd={(text) => onChange([...items, { id: newBoardId(), text, column: 0 }])}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}

/** Local page preview (localhost dev servers). Sandboxed: no top-level navigation or popups. */
function WebTile({
  url,
  onUrl,
  reloadKey
}: {
  url: string
  onUrl: (url: string) => void
  reloadKey: number
}): React.JSX.Element {
  const [draft, setDraft] = useState(url)
  useEffect(() => setDraft(url), [url])
  const normalized = (value: string): string =>
    /^https?:\/\//.test(value) ? value : `http://${value}`
  return (
    <div className="flex h-full flex-col">
      <input
        className="h-7 shrink-0 border-b border-border bg-background px-2 font-mono text-2xs outline-none"
        value={draft}
        placeholder="localhost:3000"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) =>
          event.key === 'Enter' &&
          !isImeOwnedKeyboardEvent(event) &&
          draft.trim() &&
          onUrl(normalized(draft.trim()))
        }
      />
      {url ? (
        <iframe
          key={`${url}#${reloadKey}`}
          title={url}
          src={url}
          sandbox="allow-scripts allow-forms allow-same-origin"
          className="min-h-0 flex-1 border-0 bg-white"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          주소를 입력하고 Enter 를 누르면 페이지가 표시됩니다.
        </div>
      )}
    </div>
  )
}

function GitStatusBody({
  worktreeId,
  onWorktree
}: {
  worktreeId: string | undefined
  onWorktree: (worktreeId: string) => void
}): React.JSX.Element {
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const worktreeList = Object.values(worktreesByRepo).flat()
  const worktree = worktreeId ? findWorktreeById(worktreesByRepo, worktreeId) : undefined
  const [status, setStatus] = useState<GitStatusResult | null>(null)
  const [failed, setFailed] = useState(false)
  const path = worktree?.path
  useEffect(() => {
    if (!path) {
      return
    }
    let cancelled = false
    const load = (): void => {
      void (window.api.git.status({ worktreePath: path }) as Promise<GitStatusResult>)
        .then((result) => {
          if (!cancelled) {
            setStatus(result)
            setFailed(false)
          }
        })
        .catch(() => !cancelled && setFailed(true))
    }
    load()
    const interval = setInterval(load, GIT_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [path])
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto scrollbar-sleek p-2.5 text-xs">
      <select
        className="h-6 rounded border border-border bg-background px-1 text-xs"
        value={worktreeId ?? ''}
        onChange={(event) => onWorktree(event.target.value)}
      >
        <option value="">워크스페이스 선택</option>
        {worktreeList.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.displayName || entry.path.split('/').pop()}
          </option>
        ))}
      </select>
      {!worktree ? null : failed ? (
        <div className="text-muted-foreground">Git 상태를 불러오지 못했습니다</div>
      ) : !status ? (
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <>
          <div className="flex items-center gap-1.5 font-mono">
            <GitBranch className="size-3.5" />
            <span className="truncate font-medium">{status.branch ?? status.head ?? '-'}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-2xs text-muted-foreground">
            <span>{`변경 파일 ${status.statusLength ?? status.entries.length}개`}</span>
            {status.upstreamStatus?.hasUpstream ? (
              <span>{`올릴 커밋 ${status.upstreamStatus.ahead}, 받을 커밋 ${status.upstreamStatus.behind}`}</span>
            ) : (
              <span>원격 브랜치 없음</span>
            )}
          </div>
          <div className="flex flex-col gap-0.5 font-mono text-2xs">
            {status.entries.slice(0, 30).map((entry) => (
              <div key={`${entry.path}:${entry.status}`} className="truncate" title={entry.path}>
                <span className="text-muted-foreground">
                  {entry.status.slice(0, 1).toUpperCase()}{' '}
                </span>
                {entry.path}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export const BoardNoteCard = memo(function BoardNoteCard({
  noteKey,
  note,
  geometry,
  zoom,
  highlighted,
  onCommitCard,
  onStartLink
}: {
  noteKey: string
  note: BoardNote
  geometry: BoardCardGeometry
  zoom: number
  highlighted: boolean
  onCommitCard: (key: string, geometry: BoardCardGeometry, change: BoardCardChange) => void
  onStartLink?: (key: string, event: React.PointerEvent) => void
}): React.JSX.Element {
  const updateNote = useDuduAdeStore((s) => s.updateNote)
  const removeCard = useDuduAdeStore((s) => s.removeCard)
  const [reloadKey, setReloadKey] = useState(0)
  const { label, icon: Icon } = KIND_META[note.kind]
  const update = (patch: Partial<BoardNote>): void => updateNote(noteKey, patch)
  const stickyColor = note.color ?? STICKY_COLORS[0]

  let body: React.JSX.Element
  if (note.kind === 'sticky') {
    body = (
      <DraftTextarea
        value={note.text ?? ''}
        onSave={(text) => update({ text })}
        placeholder="메모를 입력하세요"
        className="text-sm text-neutral-900"
        style={{ background: stickyColor }}
      />
    )
  } else if (note.kind === 'text') {
    body = (
      <DraftTextarea
        value={note.text ?? ''}
        onSave={(text) => update({ text })}
        placeholder="텍스트"
        className="text-lg font-medium"
      />
    )
  } else if (note.kind === 'checklist') {
    body = <Checklist items={note.items ?? []} onChange={(items) => update({ items })} />
  } else if (note.kind === 'kanban') {
    body = <Kanban items={note.items ?? []} onChange={(items) => update({ items })} />
  } else if (note.kind === 'web') {
    body = <WebTile url={note.url ?? ''} onUrl={(url) => update({ url })} reloadKey={reloadKey} />
  } else if (note.kind === 'artifact') {
    body = <BoardArtifactBody note={note} />
  } else if (note.kind === 'markdown') {
    body = <BoardMarkdownBody filePath={note.filePath ?? ''} />
  } else {
    body = (
      <GitStatusBody
        worktreeId={note.worktreeId}
        onWorktree={(worktreeId) => update({ worktreeId })}
      />
    )
  }

  return (
    <BoardCardFrame
      overlay
      geometry={geometry}
      zoom={zoom}
      highlighted={highlighted}
      onCommit={(next, change) => onCommitCard(noteKey, next, change)}
      onRemove={() => removeCard(noteKey)}
      onStartLink={onStartLink ? (event) => onStartLink(noteKey, event) : undefined}
      icon={<Icon className="size-3.5 shrink-0 text-muted-foreground" />}
      title={
        note.kind === 'web' && note.url
          ? note.url.replace(/^https?:\/\//, '')
          : note.kind === 'markdown'
            ? (note.filePath?.split('/').pop() ?? label)
            : (note.title ?? label)
      }
      actions={
        note.kind === 'sticky' ? (
          <div className="mr-1 flex items-center gap-0.5">
            {STICKY_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label="메모 색"
                className={cn(
                  'size-3 rounded-full border border-black/10',
                  color === stickyColor && 'ring-1 ring-foreground'
                )}
                style={{ background: color }}
                onClick={() => update({ color })}
              />
            ))}
          </div>
        ) : note.kind === 'web' && note.url ? (
          <>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="새로 고침"
              title="새로 고침"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <RotateCw />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={DUDU_ADE_COPY.open}
              title={DUDU_ADE_COPY.open}
              onClick={() => void window.api.shell.openUrl(note.url ?? '')}
            >
              <ExternalLink />
            </Button>
          </>
        ) : null
      }
    >
      {body}
    </BoardCardFrame>
  )
})
