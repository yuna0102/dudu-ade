import { isCutArtifactLink } from '../../../../shared/dudu-ade-asset-kinds'
import {
  findIndexEntry,
  localPageCandidates,
  type OutIndexEntry
} from '../../../../shared/dudu-ade-out-index'
import type { BoardNote } from './board-layout-state'
import type { CollectedAsset } from './dudu-ade-store-types'

const LOOKS_LIKE_ADDRESS = /^(?:https?:\/\/)?claude\.ai\//

/** What the results table can correct about an artifact card; null when it knows nothing more. */
export function artifactNoteRepair(
  note: BoardNote,
  entries: readonly OutIndexEntry[],
  outRoot: string
): { url?: string; title?: string; pages: string[] } | null {
  if (note.kind !== 'artifact' || !note.url) {
    return null
  }
  const entry = findIndexEntry(note.url, entries)
  if (!entry?.artifactUrl) {
    return null
  }
  const url = entry.artifactUrl === note.url ? undefined : entry.artifactUrl
  // A title that was only the address is replaced; one the user can read is kept.
  const title = !note.title || LOOKS_LIKE_ADDRESS.test(note.title) ? entry.name : undefined
  const pages = note.localHtml ? [] : localPageCandidates(entry, outRoot)
  return url || title || pages.length > 0
    ? { ...(url ? { url } : {}), ...(title ? { title } : {}), pages }
    : null
}

/**
 * A cut link and the full address it is the start of are one artifact. The full one stays, with the earlier
 * source and first sighting. A cut link two addresses could finish stays as it is.
 */
export function joinCutAssetLinks(
  assets: readonly CollectedAsset[],
  idOf: (kind: CollectedAsset['kind'], location: string) => string,
  fullUrls: readonly string[] = []
): { assets: CollectedAsset[]; moved: Map<string, string> } {
  const links = assets.filter((asset) => asset.kind === 'artifact-link')
  const full = new Set([...fullUrls, ...links.map((asset) => asset.location)])
  const moved = new Map<string, string>()
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  for (const cut of links) {
    if (!isCutArtifactLink(cut.location)) {
      continue
    }
    const longer = [...full].filter(
      (url) => url !== cut.location && url.startsWith(cut.location) && !isCutArtifactLink(url)
    )
    if (longer.length !== 1) {
      continue
    }
    const id = idOf('artifact-link', longer[0])
    const kept = byId.get(id)
    byId.delete(cut.id)
    const earlier = !kept || cut.firstSeenAt < kept.firstSeenAt ? cut : kept
    byId.set(id, {
      ...(kept ?? cut),
      id,
      location: longer[0],
      source: earlier.source,
      firstSeenAt: earlier.firstSeenAt,
      lastSeenAt: Math.max(cut.lastSeenAt, kept?.lastSeenAt ?? 0)
    })
    moved.set(cut.id, id)
  }
  return { assets: [...byId.values()], moved }
}
