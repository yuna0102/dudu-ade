/* eslint-disable max-lines -- Why: the board view wires its hooks and cards in one place. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import {
  TERMINAL_CARD_SIZE,
  centerViewportOn,
  zoomViewportAt,
  findFreeSlot,
  fitViewportToCards,
  hitTestFrames,
  type BoardCardGeometry,
  type BoardRect,
  type BoardViewport,
  type LayoutPreset
} from './board-layout-state'
import { arrangeBoard } from './board-sync'
import { AssetDock } from './AssetDock'
import { AssetLightbox } from './AssetLightbox'
import { BoardFrames } from './BoardFrames'
import { BoardToolOverlays } from './BoardToolOverlays'
import { selectionRects } from './board-selection'
import { withoutAutoFiling } from './board-areas'
import { useBoardLinkRules } from './use-board-link-rules'
import { BoardMissionMap } from './BoardMissionMap'
import { ALL_WORKSPACES, BoardToolbar } from './BoardToolbar'
import { useBoardAutoSync, useBoardViewModel } from './use-board-view-model'
import { boardTerminalTitle } from './BoardTerminalCard'
import { BoardWorkspaceTabs } from './BoardWorkspaceTabs'
import type { BoardCardChange } from './use-board-card-drag'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'
import {
  useBoardHandoffFlows,
  useBoardTerminalMeta,
  useBoardTerminals
} from './use-board-terminals'
import { useBoardChats } from './use-board-chats'
import { useBoardIdentity } from './use-board-identity'
import { useBoardLayoutFiles } from './use-board-layout-files'
import { useBoardLinks } from './use-board-links'
import { visibleBoardRect } from './board-terminal-focus'
import { useBoardAssetDrop } from './use-board-asset-drop'
import { useBoardWheel } from './use-board-wheel'
import { useBoardTools } from './use-board-tools'
import { useBoardAutoLayout } from './use-board-auto-layout'
import { useBoardTerminalFocus } from './use-board-terminal-focus'
import { BoardLinksLayer } from './BoardLinksLayer'
import { BoardCards } from './BoardCards'

const GRID_DOT_SPACING = 24
const HIGHLIGHT_MS = 1800

function isInsideCard(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-board-card]') !== null
}

export function InfiniteBoard(): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const board = useDuduAdeStore((s) => s.board)
  const assets = useDuduAdeStore((s) => s.assets)
  const ptyModels = useDuduAdeStore((s) => s.terminalModels)
  const focusRequest = useDuduAdeStore((s) => s.focusRequest)
  const setViewport = useDuduAdeStore((s) => s.setViewport)
  const setCard = useDuduAdeStore((s) => s.setCard)
  const updateBoard = useDuduAdeStore((s) => s.updateBoard)
  const showTerminal = useDuduAdeStore((s) => s.showTerminal)
  const addNote = useDuduAdeStore((s) => s.addNote)
  const createCategory = useDuduAdeStore((s) => s.createCategory)
  const updateCategory = useDuduAdeStore((s) => s.updateCategory)
  const assignCategory = useDuduAdeStore((s) => s.assignCategory)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const { terminals: ptyTerminals, loaded, refresh } = useBoardTerminals()
  const ptyMeta = useBoardTerminalMeta(ptyTerminals)
  const boardChats = useBoardChats()
  // Chat sessions ride the terminal pipeline (auto-add, categories, mission map) under their own keys.
  const terminals = useMemo(
    () => [...ptyTerminals, ...boardChats.chats],
    [ptyTerminals, boardChats.chats]
  )
  const meta = useMemo(() => new Map([...ptyMeta, ...boardChats.meta]), [ptyMeta, boardChats.meta])
  const terminalModels = useMemo(
    () => ({ ...ptyModels, ...boardChats.models }),
    [ptyModels, boardChats.models]
  )
  const flows = useBoardHandoffFlows(terminals)
  const identity = useBoardIdentity({
    terminals,
    meta,
    providerIds: boardChats.providerIds,
    loaded
  })
  const [workspaceFilter, setWorkspaceFilter] = useState(ALL_WORKSPACES)
  const [highlightKey, setHighlightKey] = useState<string | null>(null)
  const [screen, setScreen] = useState({ width: 0, height: 0 })
  // Pan updates stay local while dragging; the store (and storage) gets the final viewport.
  const [panViewport, setPanViewport] = useState<BoardViewport | null>(null)
  const viewport = panViewport ?? board.viewport
  const viewportStateRef = useRef(viewport)
  viewportStateRef.current = viewport
  const stopFocusAnimationRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    const element = viewportRef.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(() =>
      setScreen({ width: element.clientWidth, height: element.clientHeight })
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const workspaceName = useCallback(
    (worktreeId: string, worktreePath: string): string =>
      findWorktreeById(worktreesByRepo, worktreeId)?.displayName ||
      worktreePath.split('/').pop() ||
      worktreeId,
    [worktreesByRepo]
  )

  const terminalsByKey = useMemo(
    () => new Map(terminals.map((terminal) => [terminal.key, terminal])),
    [terminals]
  )
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])

  useBoardAutoSync({ board, terminals, meta, loaded, workspaceName, updateBoard })

  const {
    terminalKeySet,
    liveKeys,
    collapsedKeys,
    frames,
    summaries,
    missionGroups,
    minimapRects,
    workspaces
  } = useBoardViewModel({
    board,
    terminals,
    terminalsByKey,
    assetsById,
    workspaceFilter,
    meta,
    terminalModels,
    workspaceName
  })

  useBoardWheel({
    viewportRef,
    viewportStateRef,
    stopAnimationRef: stopFocusAnimationRef,
    setViewport
  })

  const centerOn = useCallback(
    (rect: BoardRect): void => {
      if (screen.width > 0) {
        setViewport(centerViewportOn(rect, screen))
      }
    },
    [screen, setViewport]
  )

  // Focus requests come from the dock, the large preview and the mission map; only a new request moves the board.
  const focusContextRef = useRef({ board, liveKeys, centerOn, updateCategory })
  focusContextRef.current = { board, liveKeys, centerOn, updateCategory }
  useEffect(() => {
    if (!focusRequest) {
      return
    }
    const context = focusContextRef.current
    const geometry = context.board.cards[focusRequest.key]
    if (!geometry || !context.liveKeys.includes(focusRequest.key)) {
      toast(DUDU_ADE_COPY.notOnBoard)
      return
    }
    const categoryId = context.board.categoryOf[focusRequest.key]
    if (
      categoryId &&
      context.board.categories.find((category) => category.id === categoryId)?.collapsed
    ) {
      context.updateCategory(categoryId, { collapsed: false })
    }
    context.centerOn(geometry)
    setHighlightKey(focusRequest.key)
    const timer = setTimeout(() => setHighlightKey(null), HIGHLIGHT_MS)
    return () => clearTimeout(timer)
  }, [focusRequest])

  const toBoardPoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const current = viewportStateRef.current
    return {
      x: (clientX - (rect?.left ?? 0) - current.x) / current.zoom,
      y: (clientY - (rect?.top ?? 0) - current.y) / current.zoom
    }
  }
  const screenCenterPoint = (): { x: number; y: number } => ({
    x: (screen.width / 2 - viewport.x) / viewport.zoom,
    y: (screen.height / 2 - viewport.y) / viewport.zoom
  })

  /** Moving a card's title bar into a frame files it there; dropping it outside every frame unfiles it. */
  const commitCard = useCallback(
    (key: string, geometry: BoardCardGeometry, change: BoardCardChange): void => {
      // A drag or resize is the user's own placement, which restoring must not overwrite.
      setCard(
        key,
        change === 'move' || change === 'resize' ? { ...geometry, placed: true } : geometry
      )
      if (change !== 'move') {
        return
      }
      const point = { x: geometry.x + geometry.w / 2, y: geometry.y + 16 }
      const target = hitTestFrames(
        point,
        frames
          .filter(({ category }) => !category.collapsed)
          .map(({ category, rect }) => ({ id: category.id, rect }))
      )
      if ((board.categoryOf[key] ?? null) !== target) {
        assignCategory([key], target)
      }
    },
    [frames, board.categoryOf, setCard, assignCategory]
  )

  // Stable for memoized cards: panning re-renders the board, not every terminal preview.
  const commitRef = useRef(commitCard)
  commitRef.current = commitCard
  const onCommitCard = useCallback(
    (key: string, geometry: BoardCardGeometry, change: BoardCardChange) =>
      commitRef.current(key, geometry, change),
    []
  )

  const { rectFor, onStartLink, deleteLink, selectedLinkId, setSelectedLinkId, draftLink } =
    useBoardLinks({
      board,
      liveKeys,
      collapsedKeys,
      frames,
      viewportRef,
      viewportStateRef,
      updateBoard
    })

  const { focusedKey, activateCard, onBoardPointerDownCapture, stopFocusAnimation } =
    useBoardTerminalFocus({ rectFor, screen, viewportStateRef, setPanViewport, setViewport })
  stopFocusAnimationRef.current = stopFocusAnimation
  const { applyLink } = useBoardLinkRules({ board, terminalsByKey, meta })
  const autoLayout = useBoardAutoLayout({ board, liveKeys, collapsedKeys, terminalKeySet, assets })
  const layoutFiles = useBoardLayoutFiles({
    ...identity,
    terminals,
    meta,
    providerIds: boardChats.providerIds,
    rememberLayout: autoLayout.rememberLayout
  })
  const tools = useBoardTools({
    board,
    visibleKeys: liveKeys.filter((key) => !collapsedKeys.has(key)),
    focusedKey,
    toBoardPoint,
    onStartLink,
    onActivate: activateCard,
    frameRects: frames
      .filter(({ category }) => !category.collapsed)
      .map(({ category, rect }) => ({ id: category.id, rect })),
    onBeforeLayoutChange: autoLayout.rememberLayout
  })

  const startPan = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || (!tools.panning && isInsideCard(event.target))) {
      return
    }
    const element = event.currentTarget
    element.setPointerCapture(event.pointerId)
    const origin = { x: event.clientX, y: event.clientY }
    const base = viewportStateRef.current
    let latest = base
    const onMove = (move: PointerEvent): void => {
      latest = { ...base, x: base.x + move.clientX - origin.x, y: base.y + move.clientY - origin.y }
      setPanViewport(latest)
    }
    const onUp = (): void => {
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', onUp)
      element.removeEventListener('pointercancel', onUp)
      setPanViewport(null)
      setViewport(latest)
    }
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', onUp)
    element.addEventListener('pointercancel', onUp)
  }

  const zoomBy = (factor: number): void => {
    setViewport(
      zoomViewportAt(viewport, viewport.zoom * factor, {
        x: screen.width / 2,
        y: screen.height / 2
      })
    )
  }

  const fitAll = (): void => {
    const next = fitViewportToCards(
      [...liveKeys.map((key) => board.cards[key]), ...frames.map((frame) => frame.rect)],
      screen
    )
    if (next) {
      setViewport(next)
    }
  }

  const applyPreset = (preset: LayoutPreset): void => {
    updateBoard((current) => arrangeBoard(current, liveKeys, preset))
  }

  const addTerminalToBoard = (key: string): void => {
    const occupied = liveKeys.map((liveKey) => board.cards[liveKey])
    showTerminal(
      key,
      board.cards[key] ?? findFreeSlot(occupied, TERMINAL_CARD_SIZE, 3, screenCenterPoint())
    )
    setTimeout(() => useDuduAdeStore.getState().focusCard(key), 0)
  }

  const offBoardTerminals = terminals.filter((terminal) => !liveKeys.includes(terminal.key))

  const viewportRect = visibleBoardRect(viewport, screen)

  const assetDrop = useBoardAssetDrop({ frames, toBoardPoint })

  const dotSize = GRID_DOT_SPACING * viewport.zoom
  return (
    <div className="flex h-full w-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <BoardWorkspaceTabs />
        <div
          ref={viewportRef}
          className={cn(
            'relative min-h-0 flex-1 overflow-hidden bg-background select-none',
            tools.panning ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
          )}
          style={{
            backgroundImage:
              'radial-gradient(circle, color-mix(in srgb, var(--muted-foreground) 28%, transparent) 1px, transparent 1px)',
            backgroundSize: `${dotSize}px ${dotSize}px`,
            backgroundPosition: `${viewport.x}px ${viewport.y}px`
          }}
          onPointerDownCapture={(event) => {
            onBoardPointerDownCapture(event)
            if (!isInsideCard(event.target)) {
              setSelectedLinkId(null)
            }
            // Hand tool and Space pan from anywhere, even over a card.
            if (
              tools.panning &&
              event.target instanceof Element &&
              !event.target.closest('[data-board-ui]')
            ) {
              event.stopPropagation()
              startPan(event)
              return
            }
            tools.onToolPointerDownCapture(event)
          }}
          onDragOver={assetDrop.onDragOver}
          onDrop={assetDrop.onDrop}
        >
          <div
            className={cn(
              'absolute top-0 left-0',
              // Only while auto layout moves cards; a user's drag must track the pointer.
              autoLayout.animating &&
                '[&_[data-board-card]]:transition-[left,top] [&_[data-board-card]]:duration-250 motion-reduce:[&_[data-board-card]]:transition-none'
            )}
            style={{
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
              transformOrigin: '0 0'
            }}
          >
            <BoardFrames
              frames={frames}
              board={board}
              zoom={viewport.zoom}
              summaries={summaries}
              selectedId={tools.selectedAreaId}
              renamingId={tools.renamingAreaId}
              onSelect={tools.setSelectedAreaId}
            />
            <BoardCards
              liveKeys={liveKeys}
              collapsedKeys={collapsedKeys}
              terminalKeySet={terminalKeySet}
              board={board}
              terminalsByKey={terminalsByKey}
              assets={assets}
              assetsById={assetsById}
              meta={meta}
              terminalModels={terminalModels}
              highlightKey={highlightKey}
              zoom={viewport.zoom}
              workspaceName={workspaceName}
              onCommitCard={onCommitCard}
              onStartLink={onStartLink}
              focusedKey={focusedKey}
              onActivate={activateCard}
            />
            <BoardLinksLayer
              links={board.links}
              names={board.names}
              rectFor={(key) => autoLayout.footprints[key] ?? rectFor(key)}
              flows={flows}
              draft={draftLink}
              zoom={viewport.zoom}
              selectedId={selectedLinkId}
              onSelect={setSelectedLinkId}
              onUpdate={(id, patch) =>
                updateBoard((current) => ({
                  links: current.links.map((link) =>
                    link.id === id ? { ...link, ...patch } : link
                  )
                }))
              }
              onApply={applyLink}
              onDelete={deleteLink}
            />
            <BoardToolOverlays
              rects={selectionRects(tools.selectedKeys, frames, rectFor)}
              draft={tools.draftRect}
              zoom={viewport.zoom}
            />
          </div>

          {loaded && terminals.length === 0 && liveKeys.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-muted-foreground">
              {DUDU_ADE_COPY.boardEmpty}
            </div>
          ) : null}

          <BoardToolbar
            zoom={viewport.zoom}
            offBoardTerminals={offBoardTerminals.map((terminal) => ({
              key: terminal.key,
              title: boardTerminalTitle(terminal),
              workspace: workspaceName(terminal.worktreeId, terminal.worktreePath)
            }))}
            workspaces={workspaces}
            workspaceFilter={workspaceFilter}
            onWorkspaceFilter={setWorkspaceFilter}
            hasHidden={board.hiddenKeys.some((key) => terminalKeySet.has(key))}
            onShowHidden={() => updateBoard(() => ({ hiddenKeys: [] }))}
            onRefresh={refresh}
            onFit={fitAll}
            onZoomBy={zoomBy}
            onCreateCategory={() => {
              const center = screenCenterPoint()
              createCategory(DUDU_ADE_COPY.newCategory, { x: center.x - 180, y: center.y - 80 })
            }}
            onAddTerminal={addTerminalToBoard}
            onAddNote={(kind, note) => {
              const center = screenCenterPoint()
              return addNote(kind, { x: center.x - 140, y: center.y - 120 }, note)
            }}
            onPreset={applyPreset}
            tool={tools.tool}
            onTool={tools.setTool}
            canGroup={tools.selectedKeys.size > 0}
            selectionSize={tools.selectedKeys.size}
            onAlign={tools.alignSelection}
            onRemoveSelection={tools.removeSelection}
            onGroup={tools.groupSelection}
            onTidy={autoLayout.tidy}
            canUndoTidy={autoLayout.canUndoTidy}
            onUndoTidy={autoLayout.undoTidy}
            autoPush={board.autoPush !== false}
            onToggleAutoPush={() =>
              updateBoard((current) => ({ autoPush: current.autoPush === false }))
            }
            onAutoClassify={() => updateBoard(withoutAutoFiling)}
            onSaveLayout={layoutFiles.saveLayout}
            onRestoreLayout={layoutFiles.restoreLayout}
          />

          <BoardMissionMap
            groups={missionGroups}
            rects={minimapRects}
            viewportRect={viewportRect}
            onFocus={(key) => useDuduAdeStore.getState().focusCard(key)}
            onJump={(point) =>
              setViewport({
                zoom: viewport.zoom,
                x: screen.width / 2 - point.x * viewport.zoom,
                y: screen.height / 2 - point.y * viewport.zoom
              })
            }
          />
          <AssetLightbox />
        </div>
      </div>
      <AssetDock />
    </div>
  )
}
