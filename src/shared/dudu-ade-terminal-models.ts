import type { CollectedAssetKind } from './dudu-ade-asset-kinds'

/** Model a terminal's Claude Code session last answered with; null fields are unknown. */
export type TerminalAgentModel = {
  model: string | null
  effort: string | null
  /** The conversation the process reports, and the one it was resumed from; either names the role in desk.json. */
  sessionId?: string
  resumeId?: string
}

/** One terminal sent input to another (runtime handles), at host time in ms. */
export type TerminalHandoff = { from: string; to: string; at: number }

export type RecentMarkdown = { path: string; name: string; mtime: number }

export type BoardMarkdownRead =
  | { status: 'ok'; content: string; mtime: number }
  | { status: 'missing' | 'denied' }

export type BoardMarkdownWrite =
  | { status: 'ok'; mtime: number }
  | { status: 'conflict' | 'missing' | 'denied' }

/** A file a conversation wrote, or an artifact link it produced; `at` is that line's time. Paths and links only, never message text. */
export type TranscriptAssetRef = { location: string; kind: CollectedAssetKind; at: number }

export type TranscriptAssetRequest = {
  /** Chat tabs: pane key (`tabId:chat`) and the provider conversation behind them. */
  chats: { paneKey: string; providerSessionId: string }[]
  /** References already handed over, per conversation; only newer ones come back. */
  seen: Record<string, number>
}

export type TranscriptAssets = {
  paneKey: string
  sessionId: string
  /** How many references this conversation has in total. */
  total: number
  refs: TranscriptAssetRef[]
}[]
