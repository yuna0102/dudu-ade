import { Bell, BellDot } from 'lucide-react'
import { AgentStateDot } from '@/components/AgentStateDot'
import { terminalTabActivityToAgentDotState } from '@/components/tab-bar/terminal-tab-activity-status'
import type { WorktreeStatus } from '@/lib/worktree-status'
import { cn } from '@/lib/utils'
import type { TerminalAgentModel } from '../../../../shared/dudu-ade-terminal-models'
import {
  ATTENTION_LABELS,
  BUCKET_LABELS,
  boardAttention,
  MODEL_BADGE_CLASSES,
  agentBucket,
  modelFamily,
  modelShortLabel
} from './board-agent-labels'

/** Shared glyph plus a short Korean label: 작업 중, 확인 필요 or 대기. */
export function AgentStatusChip({
  status,
  unread,
  compact = false
}: {
  status: WorktreeStatus | undefined
  /** The window finished and its result was not looked at. */
  unread?: boolean
  compact?: boolean
}): React.JSX.Element {
  const attention = boardAttention(status, unread)
  if (attention) {
    const Icon = attention === 'respond' ? Bell : BellDot
    return (
      <span
        role="img"
        aria-label={ATTENTION_LABELS[attention]}
        title={ATTENTION_LABELS[attention]}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-3xs font-medium',
          attention === 'respond'
            ? 'bg-orange-500/20 text-orange-600 dark:text-orange-300'
            : 'bg-[#F1EDFF] text-[#6E48E5] dark:bg-[#6E48E5]/25 dark:text-[#B9A6FF]'
        )}
      >
        <Icon className="size-3.5" />
        {compact ? null : ATTENTION_LABELS[attention]}
      </span>
    )
  }
  const bucket = agentBucket(status)
  const dot = status ? terminalTabActivityToAgentDotState(status) : null
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-3xs',
        bucket === 'attention' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
        bucket === 'working' && 'bg-primary/10 text-foreground',
        bucket === 'waiting' && 'text-muted-foreground'
      )}
      title={BUCKET_LABELS[bucket]}
    >
      {dot ? (
        <AgentStateDot state={dot} title={null} />
      ) : (
        <span className="size-1.5 rounded-full bg-muted-foreground/50" />
      )}
      {compact ? null : BUCKET_LABELS[bucket]}
    </span>
  )
}

/** "Opus" / "Sonnet" / "Haiku" with effort; hidden when the model is unknown. */
export function ModelBadge({
  model,
  className
}: {
  model: TerminalAgentModel | undefined
  className?: string
}): React.JSX.Element | null {
  if (!model?.model) {
    return null
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-baseline gap-1 rounded px-1.5 py-px text-3xs font-medium',
        MODEL_BADGE_CLASSES[modelFamily(model.model)],
        className
      )}
      title={model.effort ? `${model.model} (effort ${model.effort})` : model.model}
    >
      {modelShortLabel(model.model)}
      {model.effort ? <span className="font-normal opacity-70">{model.effort}</span> : null}
    </span>
  )
}
