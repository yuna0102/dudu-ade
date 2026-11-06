export type CollectedAssetKind = 'image' | 'pdf' | 'html' | 'markdown' | 'video' | 'artifact-link'

export const ASSET_EXTENSION_KINDS: Record<string, CollectedAssetKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  avif: 'image',
  pdf: 'pdf',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  mdx: 'markdown',
  mp4: 'video',
  mov: 'video',
  webm: 'video'
}

export const ARTIFACT_LINK_PATTERN =
  /https:\/\/claude\.ai\/(?:code\/)?(?:artifact|artifacts|public\/artifacts)\/[A-Za-z0-9_-]+/g

export function assetKindForPath(path: string): CollectedAssetKind | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(path)
  return match ? (ASSET_EXTENSION_KINDS[match[1].toLowerCase()] ?? null) : null
}

export type ExtractedAssetReference = {
  kind: CollectedAssetKind
  /** Absolute local path, or URL for links. */
  location: string
}

const EXTENSIONS = Object.keys(ASSET_EXTENSION_KINDS).join('|')
// Absolute, home-relative, or ./relative paths ending in a tracked extension; stops at quotes, brackets and whitespace.
const PATH_PATTERN = new RegExp(
  String.raw`(?:file://)?((?:~|\.{1,2})?/[^\s'"\`<>()\[\]{}|*?]*?\.(?:${EXTENSIONS}))(?=$|[\s'"\`<>()\[\]{}|,;:!?.]|#)`,
  'gi'
)
/** Join soft-wrapped rows so a long path split by the terminal width stays one token. */
export function joinWrappedRows(
  tail: readonly string[],
  rows?: readonly { wrapped: boolean }[]
): string[] {
  const lines: string[] = []
  tail.forEach((row, index) => {
    if (index > 0 && rows?.[index]?.wrapped && lines.length > 0) {
      lines[lines.length - 1] += row
    } else {
      lines.push(row)
    }
  })
  return lines
}

function normalizeLocalPath(raw: string, homeDir: string | null, baseDir: string): string | null {
  let path = raw
  try {
    path = decodeURI(path)
  } catch {}
  if (path.startsWith('~/')) {
    if (!homeDir) {
      return null
    }
    path = `${homeDir}${path.slice(1)}`
  } else if (path.startsWith('./') || path.startsWith('../')) {
    path = `${baseDir.replace(/\/+$/, '')}/${path}`
  }
  if (!path.startsWith('/')) {
    return null
  }
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') {
      continue
    }
    if (part === '..') {
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  return `/${parts.join('/')}`
}

/** macOS and Linux home roots; the renderer has no homedir API, so derive it from a workspace path. */
export function homeDirFromPath(path: string): string | null {
  const match = /^(\/Users\/[^/]+|\/home\/[^/]+)(?:\/|$)/.exec(path)
  return match ? match[1] : null
}

export function extractAssetReferences(
  lines: readonly string[],
  context: { baseDir: string; homeDir: string | null }
): ExtractedAssetReference[] {
  const found = new Map<string, ExtractedAssetReference>()
  for (const line of lines) {
    for (const match of line.matchAll(ARTIFACT_LINK_PATTERN)) {
      found.set(match[0], { kind: 'artifact-link', location: match[0] })
    }
    for (const match of line.matchAll(PATH_PATTERN)) {
      const raw = match[1]
      // A URL path (https://host/a.png) is not a local file.
      const before = line.slice(Math.max(0, (match.index ?? 0) - 1), match.index ?? 0)
      if (before === ':' || before === '/' || /[A-Za-z0-9]/.test(before)) {
        continue
      }
      const location = normalizeLocalPath(raw, context.homeDir, context.baseDir)
      const kind = location ? assetKindForPath(location) : null
      if (location && kind) {
        found.set(location, { kind, location })
      }
    }
  }
  return [...found.values()]
}
