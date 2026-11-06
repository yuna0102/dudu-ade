import type { OutIndexEntry } from '../../../../shared/dudu-ade-out-index'
import type { CollectedAsset, CollectedAssetSource } from './dudu-ade-store-types'

export type ArtifactChoice = {
  id: string
  title: string
  detail: string
  url: string | null
  localHtml: string | null
  /** Set only when the row has no page or link; it opens as a Markdown card. */
  localMarkdown: string | null
  source: CollectedAssetSource | null
  /** Newest first; INDEX rows only know MMDD, so they rank by that within the current year. */
  order: number
}

function indexOrder(date: string, now: Date): number {
  const stamp = new Date(
    now.getFullYear(),
    Number(date.slice(0, 2)) - 1,
    Number(date.slice(2))
  ).getTime()
  // A later month than today belongs to last year.
  return stamp > now.getTime()
    ? new Date(now.getFullYear() - 1, Number(date.slice(0, 2)) - 1, Number(date.slice(2))).getTime()
    : stamp
}

/** Links and pages the scanner collected plus rows of _out/INDEX.md, once each. A row wins on title, a scanned asset adds who made it. */
export function artifactChoices(
  assets: readonly (CollectedAsset & { name: string })[],
  index: readonly OutIndexEntry[],
  outRoot: string,
  query: string,
  now = new Date()
): ArtifactChoice[] {
  const byId = new Map<string, ArtifactChoice>()
  for (const entry of index) {
    const localHtml = entry.localHtml ? `${outRoot}/${entry.localHtml}` : null
    const localMarkdown =
      entry.localMarkdown && !entry.artifactUrl && !localHtml
        ? `${outRoot}/${entry.localMarkdown}`
        : null
    const id = entry.artifactUrl ?? localHtml ?? localMarkdown ?? entry.name
    byId.set(id, {
      id,
      title: entry.name,
      detail: entry.section,
      url: entry.artifactUrl,
      localHtml,
      localMarkdown,
      source: null,
      order: indexOrder(entry.date, now)
    })
  }
  for (const asset of assets) {
    if (asset.kind !== 'artifact-link' && asset.kind !== 'html') {
      continue
    }
    const known = byId.get(asset.location)
    if (known) {
      known.source = asset.source
      known.order = Math.max(known.order, asset.firstSeenAt)
      continue
    }
    byId.set(asset.location, {
      id: asset.location,
      title: asset.name,
      detail: asset.source.terminalTitle ?? asset.source.branch,
      url: asset.kind === 'artifact-link' ? asset.location : null,
      localHtml: asset.kind === 'html' ? asset.location : null,
      localMarkdown: null,
      source: asset.source,
      order: asset.firstSeenAt
    })
  }
  const needle = query.trim().toLowerCase()
  return [...byId.values()]
    .filter(
      (choice) =>
        !needle ||
        choice.title.toLowerCase().includes(needle) ||
        choice.detail.toLowerCase().includes(needle)
    )
    .sort((a, b) => b.order - a.order)
}
