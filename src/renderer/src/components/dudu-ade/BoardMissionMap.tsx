import { useState } from 'react'
import { Bell, ChevronDown, ChevronUp, Radar } from 'lucide-react'
import type { WorktreeStatus } from '@/lib/worktree-status'
import { cn } from '@/lib/utils'
import type { TerminalAgentModel } from '../../../../shared/dudu-ade-terminal-models'
import {
  BUCKET_LABELS,
  agentBucket,
  boardAttention,
  type BoardAgentBucket
} from './board-agent-labels'
import { boundsOf, type BoardRect } from './board-layout-state'
import { AgentStatusChip, ModelBadge } from './BoardAgentBadges'
import { DUDU_ADE_COPY } from './dudu-ade-copy'

export type MissionMapItem = {
  key: string
  title: string
  status: WorktreeStatus | undefined
  unread?: boolean
  model: TerminalAgentModel | undefined
}

export type MissionMapGroup = { id: string; name: string; color: string; items: MissionMapItem[] }

const MAP_W = 220
const MAP_H = 120
const BUCKET_ORDER: BoardAgentBucket[] = ['attention', 'working', 'waiting']

/** Corner overview: every console's state by category, plus a minimap that jumps the board. */
export function BoardMissionMap({
  groups,
  rects,
  viewportRect,
  onFocus,
  onJump
}: {
  groups: MissionMapGroup[]
  rects: { rect: BoardRect; color: string }[]
  viewportRect: BoardRect
  onFocus: (key: string) => void
  onJump: (point: { x: number; y: number }) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const [onlyNotices, setOnlyNotices] = useState(false)
  const totals: Record<BoardAgentBucket, number> = { working: 0, attention: 0, waiting: 0 }
  let notices = 0
  for (const group of groups) {
    for (const item of group.items) {
      totals[agentBucket(item.status)] += 1
      if (boardAttention(item.status, item.unread)) {
        notices += 1
      }
    }
  }
  const world = boundsOf([...rects.map((entry) => entry.rect), viewportRect]) ?? viewportRect
  const scale = Math.min(MAP_W / Math.max(1, world.w), MAP_H / Math.max(1, world.h))
  const toMap = (rect: BoardRect): BoardRect => ({
    x: (rect.x - world.x) * scale,
    y: (rect.y - world.y) * scale,
    w: Math.max(1, rect.w * scale),
    h: Math.max(1, rect.h * scale)
  })
  const viewportOnMap = toMap(viewportRect)

  return (
    <div
      data-board-ui
      className="absolute right-3 bottom-3 z-10 flex w-[244px] flex-col overflow-hidden rounded-lg border border-border bg-card/95 shadow-xs"
      onPointerDown={(event) => event.stopPropagation()}
      data-board-card-body
    >
      <button
        type="button"
        className="flex h-8 shrink-0 items-center gap-1.5 px-2 text-xs"
        onClick={() => setOpen((value) => !value)}
      >
        <Radar className="size-3.5 text-muted-foreground" />
        <span className="font-medium">{DUDU_ADE_COPY.missionMap}</span>
        {notices > 0 ? (
          <span
            role="button"
            tabIndex={0}
            aria-pressed={onlyNotices}
            aria-label={`${DUDU_ADE_COPY.noticeOnly} ${notices}`}
            title={DUDU_ADE_COPY.noticeOnly}
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-3xs font-medium',
              onlyNotices
                ? 'bg-orange-500 text-white'
                : 'bg-orange-500/20 text-orange-600 dark:text-orange-300'
            )}
            onClick={(event) => {
              event.stopPropagation()
              setOnlyNotices(!onlyNotices)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                setOnlyNotices(!onlyNotices)
              }
            }}
          >
            <Bell className="size-3" />
            {notices}
          </span>
        ) : null}
        <div className="flex flex-1 items-center justify-end gap-1.5 text-3xs text-muted-foreground">
          {BUCKET_ORDER.map((bucket) => (
            <span
              key={bucket}
              className={cn(
                bucket === 'attention' &&
                  totals.attention > 0 &&
                  'font-medium text-amber-700 dark:text-amber-300'
              )}
            >
              {`${BUCKET_LABELS[bucket]} ${totals[bucket]}`}
            </span>
          ))}
        </div>
        {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
      </button>
      {open ? (
        <>
          <svg
            width={MAP_W}
            height={MAP_H}
            className="mx-3 mb-2 cursor-pointer rounded border border-border bg-muted/30"
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect()
              onJump({
                x: world.x + (event.clientX - box.left) / scale,
                y: world.y + (event.clientY - box.top) / scale
              })
            }}
            role="img"
            aria-label={DUDU_ADE_COPY.minimap}
          >
            {rects.map(({ rect, color }, index) => {
              const mapped = toMap(rect)
              return (
                <rect
                  key={index}
                  {...{ x: mapped.x, y: mapped.y, width: mapped.w, height: mapped.h }}
                  fill={color}
                  fillOpacity={0.35}
                  rx={1}
                />
              )
            })}
            <rect
              x={viewportOnMap.x}
              y={viewportOnMap.y}
              width={viewportOnMap.w}
              height={viewportOnMap.h}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              className="text-foreground"
            />
          </svg>
          <div className="max-h-72 overflow-y-auto scrollbar-sleek px-1.5 pb-1.5">
            {groups
              .map((group) => ({
                ...group,
                items: onlyNotices
                  ? group.items.filter((item) => boardAttention(item.status, item.unread))
                  : group.items
              }))
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <div key={group.id} className="mb-1">
                  <div className="flex items-center gap-1.5 px-1 py-0.5 text-2xs font-medium">
                    <span className="size-2 rounded-full" style={{ background: group.color }} />
                    <span className="truncate">{group.name}</span>
                    <span className="text-muted-foreground">{group.items.length}</span>
                  </div>
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-2xs hover:bg-muted/70"
                      onClick={() => onFocus(item.key)}
                    >
                      <AgentStatusChip status={item.status} unread={item.unread} compact />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <ModelBadge model={item.model} />
                    </button>
                  ))}
                </div>
              ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
