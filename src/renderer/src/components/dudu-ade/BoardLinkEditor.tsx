import { Check, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BoardLink } from './board-layout-state'
import { LINK_RULE_TEMPLATES, isLinkApplied } from './board-link-send'
import { DUDU_ADE_COPY } from './dudu-ade-copy'

/** Edits how two windows work together. Applying tells both windows; they judge and hand over by themselves. */
export function BoardLinkEditor({
  link,
  names,
  onUpdate,
  onApply,
  onDelete
}: {
  link: BoardLink
  names?: Readonly<Record<string, string>>
  onUpdate: (patch: Partial<BoardLink>) => void
  onApply: () => void
  onDelete: () => void
}): React.JSX.Element {
  const applied = isLinkApplied(link, names)
  return (
    <div className="flex w-72 flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <input
          key={`${link.id}:${link.label ?? ''}`}
          className="h-6 min-w-0 flex-1 rounded-sm bg-transparent px-1.5 text-xs outline-none"
          defaultValue={link.label ?? ''}
          placeholder={DUDU_ADE_COPY.linkLabelPlaceholder}
          onBlur={(event) => {
            const label = event.currentTarget.value.trim()
            if (label !== (link.label ?? '')) {
              onUpdate({ label: label || undefined })
            }
          }}
        />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={DUDU_ADE_COPY.linkDelete}
          title={DUDU_ADE_COPY.linkDelete}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>
      <textarea
        key={`${link.id}:${link.rule ?? ''}`}
        autoFocus
        rows={4}
        className="resize-none rounded-sm border border-border bg-transparent px-1.5 py-1 text-xs outline-none"
        defaultValue={link.rule ?? ''}
        placeholder={DUDU_ADE_COPY.linkRulePlaceholder}
        onBlur={(event) => {
          if (event.currentTarget.value !== (link.rule ?? '')) {
            onUpdate({ rule: event.currentTarget.value })
          }
        }}
      />
      {link.rule?.trim() ? null : (
        <div className="flex flex-wrap gap-1">
          {LINK_RULE_TEMPLATES.map(({ name, rule }) => (
            <button
              key={name}
              type="button"
              className="rounded-full bg-[#F1EDFF] px-2 py-0.5 text-2xs text-[#6E48E5] dark:bg-[#6E48E5]/25 dark:text-foreground"
              onClick={() => onUpdate({ label: link.label ?? name, rule })}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <select
          className="h-6 min-w-0 flex-1 rounded-sm border border-border bg-transparent text-xs"
          aria-label={DUDU_ADE_COPY.linkDirection}
          value={link.twoWay ? 'both' : 'one'}
          onChange={(event) => onUpdate({ twoWay: event.target.value === 'both' })}
        >
          <option value="one">{DUDU_ADE_COPY.linkOneWay}</option>
          <option value="both">{DUDU_ADE_COPY.linkTwoWay}</option>
        </select>
        <select
          className="h-6 min-w-0 flex-1 rounded-sm border border-border bg-transparent text-xs"
          aria-label={DUDU_ADE_COPY.linkTrigger}
          value={link.trigger ?? 'manual'}
          onChange={(event) =>
            onUpdate({ trigger: event.target.value === 'on-finish' ? 'on-finish' : 'manual' })
          }
        >
          <option value="manual">{DUDU_ADE_COPY.linkTriggerManual}</option>
          <option value="on-finish">{DUDU_ADE_COPY.linkTriggerFinish}</option>
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" size="xs" onClick={onApply}>
          <Check />
          {DUDU_ADE_COPY.linkApply}
        </Button>
        <span className="text-2xs text-muted-foreground">
          {applied ? DUDU_ADE_COPY.linkApplied : DUDU_ADE_COPY.linkNotApplied}
        </span>
      </div>
    </div>
  )
}
