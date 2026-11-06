import { ExternalLink } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { cn } from '@/lib/utils'
import { parseArtifactLink } from './asset-meta'
import { useArtifactPageUrl } from './BoardArtifactBody'
import { BoardArtifactWebview } from './BoardArtifactWebview'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'
import type { CollectedAsset } from './dudu-ade-store-types'
import { FormAllowBar } from './FormAllowBar'
import { useArtifactPair } from './use-artifact-pair'
import { useFormInfo } from './use-form-info'

/** The system browser opens a local page whatever went wrong inside the frame. */
export function OpenInBrowserButton({ path }: { path: string }): React.JSX.Element {
  return (
    <Button
      variant="secondary"
      size="xs"
      onClick={() => void window.api.shell.openFilePath(path, 'local')}
    >
      <ExternalLink />
      {DUDU_ADE_COPY.openInBrowser}
    </Button>
  )
}

/**
 * A local HTML page as it runs: served from its own folder by main, scripts allowed, no same-origin so it cannot
 * reach the app. A script that stops, or a page that comes out blank, cannot be told apart from outside the
 * frame, so the browser button is always there. A page published as an artifact opens as the artifact first,
 * with a switch to the local copy.
 */
export function ArtifactPageFrame({
  asset,
  title
}: {
  asset: CollectedAsset
  title: string
}): React.JSX.Element {
  const path = asset.location
  const saved = useDuduAdeStore((state) => state.board.assetMeta?.[asset.id]?.artifactUrl)
  const linking = useDuduAdeStore((state) => state.linkingAssetId === asset.id)
  const { listed, twin } = useArtifactPair(path, !!saved)
  const [mode, setMode] = useState<'artifact' | 'local'>('artifact')
  const [dismissed, setDismissed] = useState(false)
  const artifactUrl = saved ?? listed
  const allow = useDuduAdeStore((state) => state.board.assetMeta?.[asset.id]?.formAllow)
  const allowing = useDuduAdeStore((state) => state.formAllowingAssetId === asset.id)
  const formInfo = useFormInfo(path, allow)
  // Forms post only on a page the user allowed, and only while it is the file they looked at.
  // A saved form leaves the frame on the server's answer; a new key puts the page itself back.
  const resets = useDuduAdeStore((state) => state.pageResets[path] ?? 0)
  const formsOn = !!allow && formInfo?.allowed === true
  const pageUrl = useArtifactPageUrl(path, formsOn ? allow : undefined)
  const showArtifact = !!artifactUrl && mode === 'artifact'
  if (!showArtifact && pageUrl === undefined) {
    return <div className="h-full w-full animate-pulse bg-muted/40" />
  }
  return (
    <div className="relative flex h-full w-full flex-col">
      {linking ? <ArtifactLinkBar assetId={asset.id} /> : null}
      <FormAllowBar assetId={asset.id} info={formInfo} allow={allow} confirming={allowing} />
      {!artifactUrl && twin && !dismissed ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-[#F1EDFF] px-2 py-1 text-2xs dark:bg-[#6E48E5]/25">
          <span className="min-w-0 flex-1 truncate">{`${DUDU_ADE_COPY.pairTwin}: ${twin.name}`}</span>
          <Button
            variant="secondary"
            size="xs"
            onClick={() =>
              useDuduAdeStore.getState().setAssetMeta(asset.id, { artifactUrl: twin.artifactUrl })
            }
          >
            {DUDU_ADE_COPY.pairTwinUse}
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setDismissed(true)}>
            {DUDU_ADE_COPY.pairDismiss}
          </Button>
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1">
        {showArtifact ? (
          <BoardArtifactWebview url={artifactUrl} />
        ) : pageUrl ? (
          <iframe
            key={resets}
            title={title}
            sandbox={formsOn ? 'allow-scripts allow-forms' : 'allow-scripts'}
            src={pageUrl}
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/40 text-2xs text-muted-foreground">
            {DUDU_ADE_COPY.previewUnavailable}
          </div>
        )}
        <div className="absolute bottom-2 right-2 flex items-center gap-1" data-board-card>
          {formsOn && !showArtifact ? (
            <span className="rounded-full bg-orange-500/20 px-1.5 py-px text-3xs font-medium text-orange-700 dark:text-orange-300">
              {DUDU_ADE_COPY.formAllowedBadge}
            </span>
          ) : null}
          {artifactUrl ? (
            <div className="flex overflow-hidden rounded-md border border-border bg-background text-2xs">
              {(['local', 'artifact'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  className={cn(
                    'px-2 py-1',
                    mode === value ? 'bg-[#6E48E5] text-white' : 'text-muted-foreground'
                  )}
                  onClick={() => setMode(value)}
                >
                  {value === 'local' ? DUDU_ADE_COPY.pairLocal : DUDU_ADE_COPY.pairArtifact}
                </button>
              ))}
            </div>
          ) : null}
          {showArtifact ? (
            <Button
              variant="secondary"
              size="xs"
              onClick={() => void window.api.shell.openUrl(artifactUrl)}
            >
              <ExternalLink />
              {DUDU_ADE_COPY.artifactOpen}
            </Button>
          ) : (
            <OpenInBrowserButton path={path} />
          )}
        </div>
      </div>
    </div>
  )
}

/** Pairing by hand: paste the artifact address; it must be a claude.ai artifact with a 22 character id. */
function ArtifactLinkBar({ assetId }: { assetId: string }): React.JSX.Element {
  const [invalid, setInvalid] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const apply = (): void => {
    const url = parseArtifactLink(field.current?.value ?? '')
    setInvalid(url === null)
    if (url) {
      const store = useDuduAdeStore.getState()
      store.setAssetMeta(assetId, { artifactUrl: url })
      store.startLinkAsset(null)
    }
  }
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
      <input
        ref={field}
        autoFocus
        aria-label={DUDU_ADE_COPY.assetLinkArtifact}
        aria-invalid={invalid}
        placeholder={DUDU_ADE_COPY.assetLinkHint}
        className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 font-mono text-2xs outline-none aria-invalid:border-destructive"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !isImeOwnedKeyboardEvent(event)) {
            apply()
          } else if (event.key === 'Escape') {
            event.stopPropagation()
            useDuduAdeStore.getState().startLinkAsset(null)
          }
        }}
      />
      <Button variant="secondary" size="xs" onClick={apply}>
        {DUDU_ADE_COPY.assetLinkApply}
      </Button>
      {invalid ? (
        <span className="text-2xs text-destructive">{DUDU_ADE_COPY.assetLinkInvalid}</span>
      ) : null}
    </div>
  )
}
