import { BoardLinkEditor } from './BoardLinkEditor'
import { isLinkApplied } from './board-link-send'
import type { BoardLink, BoardRect } from './board-layout-state'
import { linkSegment } from './board-links'

const LINK_COLOR = '#6E48E5'
const ARROW_ID = 'dudu-board-link-arrow'

export type BoardLinkFlow = { from: string; to: string }

type Segment = NonNullable<ReturnType<typeof linkSegment>>

function FlowDot({ segment, zoom }: { segment: Segment; zoom: number }): React.JSX.Element {
  return (
    <circle r={5 / zoom} fill={LINK_COLOR}>
      <animateMotion
        dur="1.2s"
        repeatCount="indefinite"
        path={`M ${segment.a.x} ${segment.a.y} L ${segment.b.x} ${segment.b.y}`}
      />
    </circle>
  )
}

/** Arrows drawn above the cards in board units; only the strokes and the selected link's controls take the pointer. */
export function BoardLinksLayer({
  links,
  names,
  rectFor,
  flows,
  draft,
  zoom,
  selectedId,
  onSelect,
  onUpdate,
  onApply,
  onDelete
}: {
  links: BoardLink[]
  names?: Readonly<Record<string, string>>
  rectFor: (key: string) => BoardRect | null
  /** Sends seen in the last few seconds, by card key. */
  flows: BoardLinkFlow[]
  /** A link being dragged out of a card port. */
  draft: { from: string; point: { x: number; y: number } } | null
  zoom: number
  selectedId: string | null
  onSelect: (id: string) => void
  onUpdate: (id: string, patch: Partial<BoardLink>) => void
  onApply: (link: BoardLink) => void
  onDelete: (id: string) => void
}): React.JSX.Element {
  const stroke = 2 / zoom
  const segmentOf = (from: string, to: string): Segment | null => {
    const a = rectFor(from)
    const b = rectFor(to)
    return a && b ? linkSegment(a, b) : null
  }
  const flowing = (link: BoardLink): boolean =>
    flows.some((flow) => flow.from === link.from && flow.to === link.to)
  // Sends with no drawn arrow still show, as a temporary dashed line.
  const looseFlows = flows.filter(
    (flow) => !links.some((link) => link.from === flow.from && link.to === flow.to)
  )
  const selected = links.find((link) => link.id === selectedId)
  const selectedSegment = selected ? segmentOf(selected.from, selected.to) : null
  const draftFrom = draft ? rectFor(draft.from) : null

  return (
    <>
      <svg
        className="pointer-events-none absolute top-0 left-0 overflow-visible"
        width={1}
        height={1}
        aria-hidden
      >
        <defs>
          <marker
            id={ARROW_ID}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={LINK_COLOR} />
          </marker>
        </defs>
        {links.map((link) => {
          const segment = segmentOf(link.from, link.to)
          if (!segment) {
            return null
          }
          const active = flowing(link)
          const isSelected = link.id === selectedId
          return (
            <g key={link.id}>
              <line
                x1={segment.a.x}
                y1={segment.a.y}
                x2={segment.b.x}
                y2={segment.b.y}
                stroke="transparent"
                strokeWidth={14 / zoom}
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onSelect(link.id)}
              >
                {link.rule ? <title>{link.rule}</title> : null}
              </line>
              <line
                x1={segment.a.x}
                y1={segment.a.y}
                x2={segment.b.x}
                y2={segment.b.y}
                stroke={LINK_COLOR}
                strokeOpacity={isSelected || active ? 1 : 0.7}
                strokeWidth={isSelected || active ? stroke * 1.8 : stroke}
                strokeDasharray={active ? `${8 / zoom} ${6 / zoom}` : undefined}
                markerEnd={`url(#${ARROW_ID})`}
                markerStart={link.twoWay ? `url(#${ARROW_ID})` : undefined}
              >
                {active ? (
                  <animate
                    attributeName="stroke-dashoffset"
                    from={28 / zoom}
                    to="0"
                    dur="0.6s"
                    repeatCount="indefinite"
                  />
                ) : null}
              </line>
              {active ? <FlowDot segment={segment} zoom={zoom} /> : null}
              {link.rule?.trim() ? (
                <circle
                  cx={segment.mid.x}
                  cy={segment.mid.y}
                  r={4 / zoom}
                  fill={isLinkApplied(link, names) ? LINK_COLOR : 'var(--muted-foreground)'}
                />
              ) : null}
              {link.label && !isSelected ? (
                <text
                  x={segment.mid.x}
                  y={segment.mid.y - 8 / zoom}
                  textAnchor="middle"
                  fontSize={12 / zoom}
                  fill="var(--muted-foreground)"
                >
                  {link.label}
                </text>
              ) : null}
            </g>
          )
        })}
        {looseFlows.map((flow) => {
          const segment = segmentOf(flow.from, flow.to)
          return segment ? (
            <g key={`${flow.from}>${flow.to}`}>
              <line
                x1={segment.a.x}
                y1={segment.a.y}
                x2={segment.b.x}
                y2={segment.b.y}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.8}
                strokeWidth={stroke}
                strokeDasharray={`${6 / zoom} ${6 / zoom}`}
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from={24 / zoom}
                  to="0"
                  dur="0.6s"
                  repeatCount="indefinite"
                />
              </line>
              <FlowDot segment={segment} zoom={zoom} />
            </g>
          ) : null
        })}
        {draft && draftFrom ? (
          <line
            x1={draftFrom.x + draftFrom.w}
            y1={draftFrom.y + draftFrom.h / 2}
            x2={draft.point.x}
            y2={draft.point.y}
            stroke={LINK_COLOR}
            strokeWidth={stroke}
            strokeDasharray={`${6 / zoom} ${4 / zoom}`}
            markerEnd={`url(#${ARROW_ID})`}
          />
        ) : null}
      </svg>
      {selected && selectedSegment ? (
        <div
          data-board-card
          data-board-card-body
          className="absolute rounded-md border border-border bg-popover p-1.5 shadow-sm"
          style={{
            left: selectedSegment.mid.x,
            top: selectedSegment.mid.y,
            transform: `translate(-50%, -50%) scale(${1 / zoom})`
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <BoardLinkEditor
            link={selected}
            names={names}
            onUpdate={(patch) => onUpdate(selected.id, patch)}
            onApply={() => onApply(selected)}
            onDelete={() => onDelete(selected.id)}
          />
        </div>
      ) : null}
    </>
  )
}
