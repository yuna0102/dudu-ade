import type { BoardRect } from './board-layout-state'
import { selectionBounds } from './board-selection'
import { DUDU_ADE_COPY } from './dudu-ade-copy'

const GROUP_PAD = 12

/** Selection rings, the box around a multi-selection and the rectangle being drawn; they never take the pointer. */
export function BoardToolOverlays({
  rects,
  draft,
  zoom
}: {
  rects: BoardRect[]
  draft: BoardRect | null
  zoom: number
}): React.JSX.Element {
  const bounds = rects.length > 1 ? selectionBounds(rects) : null
  return (
    <>
      {rects.map((at) => (
        <div
          key={`${at.x}:${at.y}:${at.w}`}
          className="pointer-events-none absolute rounded-lg ring-2 ring-[#6E48E5]"
          style={{ left: at.x, top: at.y, width: at.w, height: at.h }}
        />
      ))}
      {bounds ? (
        <div
          className="pointer-events-none absolute rounded-xl border border-dashed border-[#6E48E5]"
          style={{
            left: bounds.x - GROUP_PAD,
            top: bounds.y - GROUP_PAD,
            width: bounds.w + GROUP_PAD * 2,
            height: bounds.h + GROUP_PAD * 2,
            borderWidth: 1.5 / zoom
          }}
        >
          <span
            className="absolute bottom-0 left-0 rounded-full bg-[#6E48E5] px-2 py-0.5 text-xs whitespace-nowrap text-white"
            style={{
              transform: `translateY(100%) scale(${1 / zoom})`,
              transformOrigin: 'top left'
            }}
          >
            {`${rects.length}${DUDU_ADE_COPY.selectedCount}`}
          </span>
        </div>
      ) : null}
      {draft ? (
        <div
          className="pointer-events-none absolute rounded-xl border-2 border-dashed border-[#6E48E5] bg-[#6E48E5]/10"
          style={{ left: draft.x, top: draft.y, width: draft.w, height: draft.h }}
        />
      ) : null}
    </>
  )
}
