import type { WorktreeStatus } from '@/lib/worktree-status'

/** Mission-map buckets: working, needs the user, or waiting (everything settled or quiet). */
export type BoardAgentBucket = 'working' | 'attention' | 'waiting'

export function agentBucket(status: WorktreeStatus | undefined): BoardAgentBucket {
  if (status === 'working' || status === 'monitoring') {
    return 'working'
  }
  if (status === 'permission') {
    return 'attention'
  }
  return 'waiting'
}

export const BUCKET_LABELS: Record<BoardAgentBucket, string> = {
  working: '작업 중',
  attention: '확인 필요',
  waiting: '대기'
}

export type ModelFamily = 'opus' | 'sonnet' | 'haiku' | 'fable' | 'other'

export function modelFamily(model: string): ModelFamily {
  const lower = model.toLowerCase()
  if (lower.includes('opus')) {
    return 'opus'
  }
  if (lower.includes('sonnet')) {
    return 'sonnet'
  }
  if (lower.includes('haiku')) {
    return 'haiku'
  }
  if (lower.includes('fable')) {
    return 'fable'
  }
  return 'other'
}

/** "claude-opus-5-5" -> "Opus"; unknown families keep a short form of their own name. */
export function modelShortLabel(model: string): string {
  const family = modelFamily(model)
  if (family !== 'other') {
    return family[0].toUpperCase() + family.slice(1)
  }
  const short = model.replace(/^claude-/, '').replace(/\[.*\]$/, '')
  return short.length > 14 ? `${short.slice(0, 13)}…` : short
}

export const MODEL_BADGE_CLASSES: Record<ModelFamily, string> = {
  opus: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
  sonnet: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  haiku: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  fable: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  other: 'bg-muted text-muted-foreground'
}

/** "Opus 3, Sonnet 2" for a category header. */
export function modelDistribution(models: readonly (string | null | undefined)[]): string {
  const counts = new Map<string, number>()
  for (const model of models) {
    if (model) {
      const label = modelShortLabel(model)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `${label} ${count}`)
    .join(', ')
}

/** Orca pane key (`tabId:leafId`) that Claude Code processes carry in ORCA_PANE_KEY. */
export function paneKeyOf(terminal: { tabId: string; leafId: string }): string {
  return `${terminal.tabId}:${terminal.leafId}`
}
