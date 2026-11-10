import { useState } from 'react'
import {
  CheckSquare,
  Columns3,
  Eye,
  FolderPlus,
  GitBranch,
  Globe,
  LayoutGrid,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Hand,
  History,
  Save,
  FileBox,
  FileText,
  LayoutTemplate,
  Trash2,
  MousePointer2,
  Spline,
  Square,
  Group,
  Sparkles,
  Undo2,
  Wand2,
  Maximize,
  Minus,
  Plus,
  RefreshCw,
  SquareTerminal,
  StickyNote,
  Type
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { BoardNote, BoardNoteKind, LayoutPreset } from './board-layout-state'
import { BoardCardPickers, type BoardCardPicker } from './BoardCardPickers'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import type { AlignMode } from './board-selection'
import type { BoardTool } from './use-board-tools'

const NOTE_MENU: { kind: BoardNoteKind; label: string; icon: typeof StickyNote }[] = [
  { kind: 'sticky', label: '스티커 메모', icon: StickyNote },
  { kind: 'text', label: '텍스트', icon: Type },
  { kind: 'checklist', label: '체크리스트', icon: CheckSquare },
  { kind: 'kanban', label: '칸반', icon: Columns3 },
  { kind: 'web', label: '웹 타일 (localhost 미리보기)', icon: Globe },
  { kind: 'git', label: 'Git 상태 카드', icon: GitBranch }
]

const PRESETS: { preset: LayoutPreset; label: string }[] = [
  { preset: 'grid', label: DUDU_ADE_COPY.presetGrid },
  { preset: 'columns', label: DUDU_ADE_COPY.presetColumns },
  { preset: 'row', label: DUDU_ADE_COPY.presetRow }
]

const TOOLS: { tool: BoardTool; label: string; icon: typeof Square }[] = [
  { tool: 'select', label: DUDU_ADE_COPY.toolSelect, icon: MousePointer2 },
  { tool: 'hand', label: DUDU_ADE_COPY.toolHand, icon: Hand },
  { tool: 'area', label: DUDU_ADE_COPY.toolArea, icon: Square },
  { tool: 'link', label: DUDU_ADE_COPY.toolLink, icon: Spline }
]

const ALIGN_ACTIONS: { mode: AlignMode; label: string; icon: typeof Square }[] = [
  { mode: 'left', label: DUDU_ADE_COPY.alignLeft, icon: AlignStartVertical },
  { mode: 'top', label: DUDU_ADE_COPY.alignTop, icon: AlignStartHorizontal },
  { mode: 'distribute-x', label: DUDU_ADE_COPY.distributeX, icon: AlignHorizontalSpaceAround },
  { mode: 'distribute-y', label: DUDU_ADE_COPY.distributeY, icon: AlignVerticalSpaceAround }
]

export const ALL_WORKSPACES = '__all__'

/** Board controls: add menu (categories, terminals, cards), layout presets, workspace filter and zoom. */
export function BoardToolbar({
  zoom,
  offBoardTerminals,
  workspaces,
  workspaceFilter,
  onWorkspaceFilter,
  hasHidden,
  onShowHidden,
  onRefresh,
  onFit,
  onZoomBy,
  onCreateCategory,
  onAddTerminal,
  onNewTerminal,
  onAddAllOffBoard,
  onAddNote,
  onPreset,
  tool,
  onTool,
  canGroup,
  onGroup,
  onTidy,
  canUndoTidy,
  onUndoTidy,
  autoPush,
  onToggleAutoPush,
  onAutoClassify,
  onSaveLayout,
  onRestoreLayout,
  selectionSize,
  onAlign,
  onRemoveSelection
}: {
  zoom: number
  offBoardTerminals: { key: string; title: string; workspace: string }[]
  workspaces: [string, string][]
  workspaceFilter: string
  onWorkspaceFilter: (value: string) => void
  hasHidden: boolean
  onShowHidden: () => void
  onRefresh: () => void
  onFit: () => void
  onZoomBy: (factor: number) => void
  onCreateCategory: () => void
  onAddTerminal: (key: string) => void
  onNewTerminal: () => void
  onAddAllOffBoard: () => void
  onAddNote: (kind: BoardNoteKind, note?: Partial<BoardNote>) => string
  onPreset: (preset: LayoutPreset) => void
  tool: BoardTool
  onTool: (tool: BoardTool) => void
  canGroup: boolean
  onGroup: () => void
  onTidy: () => void
  canUndoTidy: boolean
  onUndoTidy: () => void
  autoPush: boolean
  onToggleAutoPush: () => void
  onAutoClassify: () => void
  onSaveLayout: () => void
  onRestoreLayout: () => void
  selectionSize: number
  onAlign: (mode: AlignMode) => void
  onRemoveSelection: () => void
}): React.JSX.Element {
  const [picker, setPicker] = useState<BoardCardPicker | null>(null)
  return (
    <div
      data-board-ui
      className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-xs"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {TOOLS.map(({ tool: id, label, icon: Icon }) => (
        <Button
          key={id}
          variant={tool === id ? 'secondary' : 'ghost'}
          size="icon-xs"
          aria-label={label}
          aria-pressed={tool === id}
          title={label}
          onClick={() => onTool(id)}
        >
          <Icon />
        </Button>
      ))}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={DUDU_ADE_COPY.groupSelection}
        title={DUDU_ADE_COPY.groupSelection}
        disabled={!canGroup}
        onClick={onGroup}
      >
        <Group />
      </Button>
      {selectionSize > 0 ? (
        <>
          {selectionSize > 1
            ? ALIGN_ACTIONS.map(({ mode, label, icon: Icon }) => (
                <Button
                  key={mode}
                  variant="ghost"
                  size="icon-xs"
                  aria-label={label}
                  title={label}
                  onClick={() => onAlign(mode)}
                >
                  <Icon />
                </Button>
              ))
            : null}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={DUDU_ADE_COPY.removeSelection}
            title={DUDU_ADE_COPY.removeSelection}
            onClick={onRemoveSelection}
          >
            <Trash2 />
          </Button>
        </>
      ) : null}
      <div className="mx-0.5 h-4 w-px bg-border" />
      {offBoardTerminals.length > 0 ? (
        <Button variant="ghost" size="xs" onClick={onAddAllOffBoard}>
          <SquareTerminal />
          {`${DUDU_ADE_COPY.addOffBoard} ${offBoardTerminals.length}`}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs">
            <Plus />
            {DUDU_ADE_COPY.add}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={onCreateCategory}>
            <FolderPlus />
            {DUDU_ADE_COPY.newCategory}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onNewTerminal}>
            <SquareTerminal />
            {DUDU_ADE_COPY.newTerminal}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={offBoardTerminals.length === 0}>
              <SquareTerminal />
              {`${DUDU_ADE_COPY.addTerminal} ${offBoardTerminals.length}`}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto scrollbar-sleek">
              {offBoardTerminals.map((terminal) => (
                <DropdownMenuItem key={terminal.key} onSelect={() => onAddTerminal(terminal.key)}>
                  <span className="truncate">{terminal.title}</span>
                  <span className="ml-auto truncate text-2xs text-muted-foreground">
                    {terminal.workspace}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-2xs text-muted-foreground">
            {DUDU_ADE_COPY.cards}
          </DropdownMenuLabel>
          {NOTE_MENU.map(({ kind, label, icon: Icon }) => (
            <DropdownMenuItem key={kind} onSelect={() => onAddNote(kind)}>
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => setPicker('artifact')}>
            <FileBox />
            {DUDU_ADE_COPY.artifactCard}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPicker('markdown')}>
            <FileText />
            {DUDU_ADE_COPY.markdownCard}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={DUDU_ADE_COPY.viewMenu}
            title={DUDU_ADE_COPY.viewMenu}
          >
            <LayoutTemplate />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="text-2xs text-muted-foreground">
            {DUDU_ADE_COPY.layoutPresets}
          </DropdownMenuLabel>
          {PRESETS.map(({ preset, label }) => (
            <DropdownMenuItem key={preset} onSelect={() => onPreset(preset)}>
              <LayoutGrid />
              {label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onTidy}>
            <Sparkles />
            {DUDU_ADE_COPY.tidyBoard}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canUndoTidy} onSelect={onUndoTidy}>
            <Undo2 />
            {DUDU_ADE_COPY.undoTidy}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onSaveLayout}>
            <Save />
            {DUDU_ADE_COPY.saveLayout}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRestoreLayout}>
            <History />
            {DUDU_ADE_COPY.restoreLayout}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onAutoClassify}>
            <Wand2 />
            {DUDU_ADE_COPY.autoClassify}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggleAutoPush}>
            <LayoutGrid />
            {autoPush ? DUDU_ADE_COPY.autoPushOn : DUDU_ADE_COPY.autoPushOff}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <select
        className="h-6 max-w-36 rounded-md border border-border bg-background px-1.5 text-xs"
        value={workspaceFilter}
        onChange={(event) => onWorkspaceFilter(event.target.value)}
        aria-label={DUDU_ADE_COPY.allWorkspaces}
      >
        <option value={ALL_WORKSPACES}>{DUDU_ADE_COPY.allWorkspaces}</option>
        {workspaces.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      {hasHidden ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={DUDU_ADE_COPY.showHidden}
          title={DUDU_ADE_COPY.showHidden}
          onClick={onShowHidden}
        >
          <Eye />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={DUDU_ADE_COPY.refresh}
        title={DUDU_ADE_COPY.refresh}
        onClick={onRefresh}
      >
        <RefreshCw />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={DUDU_ADE_COPY.fitAll}
        title={DUDU_ADE_COPY.fitAll}
        onClick={onFit}
      >
        <Maximize />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={DUDU_ADE_COPY.zoomOut}
        title={DUDU_ADE_COPY.zoomOut}
        onClick={() => onZoomBy(1 / 1.2)}
      >
        <Minus />
      </Button>
      <button
        type="button"
        className="w-11 text-center text-2xs text-muted-foreground tabular-nums hover:text-foreground"
        title={DUDU_ADE_COPY.zoomReset}
        onClick={() => onZoomBy(1 / zoom)}
      >
        {Math.round(zoom * 100)}%
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={DUDU_ADE_COPY.zoomIn}
        title={DUDU_ADE_COPY.zoomIn}
        onClick={() => onZoomBy(1.2)}
      >
        <Plus />
      </Button>
      <BoardCardPickers picker={picker} onClose={() => setPicker(null)} onAddNote={onAddNote} />
    </div>
  )
}
