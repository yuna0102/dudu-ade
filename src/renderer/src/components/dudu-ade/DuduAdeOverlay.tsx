import { useEffect, useRef } from 'react'
import { Images, LayoutDashboard, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { AssetGallery } from './AssetGallery'
import { useBoardFocusGuard } from './use-board-focus-guard'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore, type DuduAdePanel } from './dudu-ade-store'
import { useFormSavedWatch } from './form-saved'
import { InfiniteBoard } from './InfiniteBoard'
import { useAssetScanner } from './use-asset-scanner'
import { useTerminalModelPoller } from './use-board-terminals'

const PANELS: { id: DuduAdePanel; label: string; icon: typeof Images }[] = [
  { id: 'board', label: DUDU_ADE_COPY.boardTab, icon: LayoutDashboard },
  { id: 'assets', label: DUDU_ADE_COPY.assetsTab, icon: Images }
]

/** Navigating anywhere else in the app (workspace, page) hands the screen back. */
function useCloseOnNavigation(open: boolean): void {
  const activeView = useAppStore((s) => s.activeView)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const closePanel = useDuduAdeStore((s) => s.closePanel)
  const previous = useRef({ activeView, activeWorktreeId })
  useEffect(() => {
    const changed =
      previous.current.activeView !== activeView ||
      previous.current.activeWorktreeId !== activeWorktreeId
    previous.current = { activeView, activeWorktreeId }
    if (open && changed) {
      closePanel()
    }
  }, [open, activeView, activeWorktreeId, closePanel])
}

/** Board and asset gallery layered over the workbench; the tab/split workspace underneath stays mounted. */
export function DuduAdeOverlay({
  reserveWindowControls
}: {
  /** The left sidebar is closed, so macOS traffic lights sit over this header. */
  reserveWindowControls: boolean
}): React.JSX.Element | null {
  useAssetScanner()
  useFormSavedWatch()
  useTerminalModelPoller()
  const panel = useDuduAdeStore((s) => s.panel)
  const openPanel = useDuduAdeStore((s) => s.openPanel)
  const closePanel = useDuduAdeStore((s) => s.closePanel)
  useCloseOnNavigation(panel !== null)
  const rootRef = useRef<HTMLDivElement>(null)
  useBoardFocusGuard(rootRef, panel !== null)

  useEffect(() => {
    if (!panel) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      // The large asset preview handles its own Escape first.
      if (
        event.key === 'Escape' &&
        event.target === document.body &&
        !useDuduAdeStore.getState().previewAssetId
      ) {
        closePanel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panel, closePanel])

  if (!panel) {
    return null
  }
  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-30 flex flex-col bg-background"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        className={cn(
          'flex h-9 shrink-0 items-center gap-1 border-b border-border pr-2',
          reserveWindowControls ? 'pl-20' : 'pl-2'
        )}
        style={{ paddingRight: 'calc(var(--window-controls-width, 0px) + 8px)' }}
      >
        {PANELS.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant={panel === id ? 'secondary' : 'ghost'}
            size="xs"
            onClick={() => openPanel(id)}
          >
            <Icon />
            {label}
          </Button>
        ))}
        {/* Window drag handle for the empty header space. */}
        <div className="h-full flex-1" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={DUDU_ADE_COPY.close}
          title={DUDU_ADE_COPY.close}
          onClick={closePanel}
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {panel === 'board' ? <InfiniteBoard /> : <AssetGallery />}
      </div>
    </div>
  )
}
