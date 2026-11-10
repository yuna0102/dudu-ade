import { Suspense, lazy, useEffect, useState } from 'react'
import { FileText, FileType2, Film, Globe, Image as ImageIcon, Link2 } from 'lucide-react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { chatImageAccess, userNamedFileAccess } from '@/lib/local-file-access'
import { cn } from '@/lib/utils'
import type { CollectedAssetKind } from './asset-path-extraction'
import type { CollectedAsset } from './dudu-ade-store'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { ArtifactPageFrame } from './ArtifactPageFrame'

const MARKDOWN_PREVIEW_CHARS = 6000
const MARKDOWN_FULL_CHARS = 400_000
// pdf.js is heavy; only the large preview loads it.
const PdfViewer = lazy(() => import('@/components/editor/PdfViewer'))
const HTML_PREVIEW_CHARS = 200_000

type LoadedPreview =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'media'; src: string; content: string; size?: number }
  | { state: 'text'; text: string }

export const KIND_ICONS: Record<CollectedAssetKind, typeof FileText> = {
  image: ImageIcon,
  pdf: FileType2,
  html: Globe,
  markdown: FileText,
  video: Film,
  'artifact-link': Link2
}

export function assetKindLabel(kind: CollectedAssetKind): string {
  switch (kind) {
    case 'image':
      return DUDU_ADE_COPY.kindImage
    case 'pdf':
      return DUDU_ADE_COPY.kindPdf
    case 'html':
      return DUDU_ADE_COPY.kindHtml
    case 'markdown':
      return DUDU_ADE_COPY.kindMarkdown
    case 'video':
      return DUDU_ADE_COPY.kindVideo
    case 'artifact-link':
      return DUDU_ADE_COPY.kindLink
  }
}

export function assetDisplayName(asset: Pick<CollectedAsset, 'kind' | 'location'>): string {
  if (asset.kind === 'artifact-link') {
    return asset.location.replace(/^https:\/\//, '')
  }
  return asset.location.split('/').pop() || asset.location
}

/** Which kinds read file bytes; PDFs and links stay icon cards. */
function previewMode(
  kind: CollectedAssetKind,
  detailed: boolean,
  full: boolean
): 'media' | 'text' | null {
  if (kind === 'image' || (kind === 'video' && detailed) || (kind === 'pdf' && full)) {
    return 'media'
  }
  if (kind === 'markdown' || (kind === 'html' && detailed)) {
    return 'text'
  }
  return null
}

export function useAssetPreview(
  asset: CollectedAsset,
  detailed: boolean,
  full: boolean
): LoadedPreview | null {
  const mode = asset.missing ? null : previewMode(asset.kind, detailed, full)
  const [preview, setPreview] = useState<LoadedPreview | null>(mode ? { state: 'loading' } : null)
  useEffect(() => {
    if (!mode) {
      setPreview(null)
      return
    }
    let cancelled = false
    setPreview({ state: 'loading' })
    // Same main-process reader the editor previews use; images take the chat-image grant.
    window.api.fs
      .readFile({
        filePath: asset.location,
        access: asset.kind === 'image' ? chatImageAccess() : userNamedFileAccess(),
        rangePreview: mode === 'media'
      })
      .then((result) => {
        if (cancelled) {
          return
        }
        if (mode === 'media') {
          const src =
            result.mediaUrl ??
            (result.isBinary && result.mimeType
              ? `data:${result.mimeType};base64,${result.content}`
              : null)
          setPreview(
            src || (asset.kind === 'pdf' && result.content)
              ? { state: 'media', src: src ?? '', content: result.content, size: result.size }
              : { state: 'failed' }
          )
          return
        }
        const limit =
          asset.kind === 'html'
            ? HTML_PREVIEW_CHARS
            : full
              ? MARKDOWN_FULL_CHARS
              : MARKDOWN_PREVIEW_CHARS
        setPreview(
          result.isBinary
            ? { state: 'failed' }
            : { state: 'text', text: result.content.slice(0, limit) }
        )
      })
      .catch(() => {
        if (!cancelled) {
          setPreview({ state: 'failed' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [asset.location, asset.kind, mode, full])
  return preview
}

function KindIconFallback({
  kind,
  label
}: {
  kind: CollectedAssetKind
  label?: string
}): React.JSX.Element {
  const Icon = KIND_ICONS[kind]
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/40 text-muted-foreground">
      <Icon className="size-8" strokeWidth={1.5} />
      <span className="text-2xs">{label ?? assetKindLabel(kind)}</span>
    </div>
  )
}

/** Thumbnail in the gallery; `detailed` (board cards) also renders HTML and video; `full` (large preview) adds PDF pages. */
export function AssetPreview({
  asset,
  detailed = false,
  full = false,
  className
}: {
  asset: CollectedAsset
  detailed?: boolean
  full?: boolean
  className?: string
}): React.JSX.Element {
  const preview = useAssetPreview(asset, detailed || full, full)
  let body: React.JSX.Element
  if (asset.kind === 'html' && (detailed || full) && !asset.missing) {
    // Runs like the board's page card; the small gallery tiles keep the still type icon and open to the live page.
    body = <ArtifactPageFrame asset={asset} title={assetDisplayName(asset)} />
  } else if (asset.missing) {
    body = <KindIconFallback kind={asset.kind} label={DUDU_ADE_COPY.assetMissing} />
  } else if (!preview) {
    body = <KindIconFallback kind={asset.kind} />
  } else if (preview.state === 'loading') {
    body = <div className="h-full w-full animate-pulse bg-muted/40" />
  } else if (preview.state === 'failed') {
    body = <KindIconFallback kind={asset.kind} label={DUDU_ADE_COPY.previewUnavailable} />
  } else if (preview.state === 'media') {
    body =
      asset.kind === 'pdf' ? (
        <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/40" />}>
          <PdfViewer
            content={preview.content}
            src={preview.src || undefined}
            byteSize={preview.size}
            filePath={asset.location}
          />
        </Suspense>
      ) : asset.kind === 'video' ? (
        <video src={preview.src} className="h-full w-full object-contain" controls muted />
      ) : (
        <img
          src={preview.src}
          alt={assetDisplayName(asset)}
          className="h-full w-full object-contain"
          draggable={false}
        />
      )
  } else {
    body = (
      <div
        className="h-full w-full overflow-auto scrollbar-sleek p-3 text-xs"
        data-board-card-scroll
      >
        <CommentMarkdown content={preview.text} variant="document" />
      </div>
    )
  }
  return <div className={cn('relative overflow-hidden', className)}>{body}</div>
}
