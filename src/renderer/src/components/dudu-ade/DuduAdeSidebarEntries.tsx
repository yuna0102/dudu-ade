import { Images, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore, type DuduAdePanel } from './dudu-ade-store'

const ENTRIES: { id: DuduAdePanel; label: string; icon: typeof Images }[] = [
  { id: 'board', label: DUDU_ADE_COPY.boardTab, icon: LayoutDashboard },
  { id: 'assets', label: DUDU_ADE_COPY.assetsTab, icon: Images }
]

/** Sidebar nav rows matching the Artifacts/Skills rows; clicking the open one closes it. */
export function DuduAdeSidebarEntries(): React.JSX.Element {
  const panel = useDuduAdeStore((s) => s.panel)
  const openPanel = useDuduAdeStore((s) => s.openPanel)
  const closePanel = useDuduAdeStore((s) => s.closePanel)
  const assetCount = useDuduAdeStore((s) => s.assets.length)
  return (
    <>
      {ENTRIES.map(({ id, label, icon: Icon }) => {
        const active = panel === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => (active ? closePanel() : openPanel(id))}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
              active
                ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
                : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
            )}
          >
            <Icon
              className={cn('size-4 shrink-0', !active && 'text-worktree-sidebar-foreground/30')}
              strokeWidth={active ? 2.25 : 1.75}
            />
            <span className="flex-1">{label}</span>
            {id === 'assets' && assetCount > 0 ? (
              <span className="text-2xs text-worktree-sidebar-foreground/40">{assetCount}</span>
            ) : null}
          </button>
        )
      })}
    </>
  )
}
