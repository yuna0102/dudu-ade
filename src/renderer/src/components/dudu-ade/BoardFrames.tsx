import {
  arrangeGroups,
  categoryFrameRect,
  type BoardCategory,
  type BoardLayout,
  type BoardRect
} from './board-layout-state'
import { BoardCategoryFrame, type CategorySummary } from './BoardCategoryFrame'
import { useDuduAdeStore } from './dudu-ade-store'

/** The named areas behind the cards. */
export function BoardFrames({
  frames,
  board,
  zoom,
  summaries,
  selectedId,
  renamingId,
  onSelect
}: {
  frames: { category: BoardCategory; keys: string[]; rect: BoardRect }[]
  board: BoardLayout
  zoom: number
  summaries: Map<string, CategorySummary>
  selectedId: string | null
  renamingId: string | null
  onSelect: (id: string) => void
}): React.JSX.Element {
  const store = useDuduAdeStore.getState
  return (
    <>
      {frames.map(({ category, keys, rect }) => (
        <BoardCategoryFrame
          key={category.id}
          category={category}
          rect={rect}
          zoom={zoom}
          summary={
            summaries.get(category.id) ?? {
              count: 0,
              buckets: { working: 0, attention: 0, waiting: 0 },
              models: ''
            }
          }
          onMoveBy={(dx, dy) => store().moveCategory(category.id, keys, dx, dy)}
          onRename={(name) => store().updateCategory(category.id, { name })}
          onColor={(color) => store().updateCategory(category.id, { color })}
          onToggleCollapse={() =>
            store().updateCategory(category.id, { collapsed: !category.collapsed })
          }
          onArrange={() =>
            store().setCards(
              arrangeGroups([{ id: category.id, keys }], board.cards, 'grid', {
                x: rect.x,
                y: rect.y
              }).cards
            )
          }
          onDelete={() => store().deleteCategory(category.id)}
          memberRect={
            keys.length > 0
              ? categoryFrameRect(
                  { anchor: category.anchor },
                  keys.map((key) => board.cards[key])
                )
              : null
          }
          selected={selectedId === category.id}
          autoEdit={renamingId === category.id}
          onSelect={() => onSelect(category.id)}
          onResize={(next) => store().updateCategory(category.id, { rect: next })}
        />
      ))}
    </>
  )
}
