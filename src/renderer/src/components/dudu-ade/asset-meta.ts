import { ARTIFACT_ID_LENGTH, assetKindForPath } from '../../../../shared/dudu-ade-asset-kinds'
import type { CollectedAsset } from './dudu-ade-store-types'

/** What the user told the board about one asset; kept by asset id so a re-collected file keeps it. */
export type FormAllow = { hash: string; ports: number[] }
export type AssetMeta = { name?: string; artifactUrl?: string; formAllow?: FormAllow }

const ARTIFACT_PAGE = new RegExp(
  String.raw`^https://claude\.ai/(?:code/)?artifact/([A-Za-z0-9_-]{${ARTIFACT_ID_LENGTH}})/?(?:[?#].*)?$`
)

/** The artifact address in its stored form, or null when it is not one (the id must be exactly 22 characters). */
export function parseArtifactLink(typed: string): string | null {
  const match = ARTIFACT_PAGE.exec(typed.trim())
  return match ? `https://claude.ai/artifact/${match[1]}` : null
}

/** The shown name: what the user typed, else the file's own name. */
export function assetLabel(
  asset: Pick<CollectedAsset, 'id'>,
  fallback: string,
  meta: Readonly<Record<string, AssetMeta>> | undefined
): string {
  return meta?.[asset.id]?.name || fallback
}

/** What a rename saves: nothing for an empty or unchanged name. */
export function nextAssetName(typed: string, current: string): string | null {
  const name = typed.trim()
  return name && name !== current ? name : null
}

/** One asset's entry changed; an entry left with nothing in it is dropped. */
export function withAssetMeta(
  meta: Readonly<Record<string, AssetMeta>> | undefined,
  id: string,
  patch: { [K in keyof AssetMeta]?: AssetMeta[K] | null }
): Record<string, AssetMeta> {
  const next: Record<string, unknown> = { ...meta?.[id] }
  for (const [key, value] of Object.entries(patch)) {
    if (value) {
      next[key] = value
    } else {
      delete next[key]
    }
  }
  const { [id]: _old, ...rest } = meta ?? {}
  return Object.keys(next).length > 0 ? { ...rest, [id]: next as AssetMeta } : rest
}

/** A path typed or pasted by hand: absolute or from home, of a kind the board shows. */
export function manualAssetPath(typed: string, home: string | null): string | null {
  let path = typed.trim().replace(/^['"]|['"]$/g, '')
  if (path.startsWith('file://')) {
    try {
      path = decodeURIComponent(path.slice('file://'.length))
    } catch {
      return null
    }
  }
  if (path.startsWith('~/') && home) {
    path = `${home}${path.slice(1)}`
  }
  return path.startsWith('/') && !path.includes('\n') && assetKindForPath(path) ? path : null
}
