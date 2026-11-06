import { Button } from '@/components/ui/button'
import type { FormAllow } from './asset-meta'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'
import type { FormInfo } from './use-form-info'

/**
 * Posting a form from a preview is off. Allowing it is a decision about one exact page and the local port it
 * posts to, so the port is shown here and the user confirms; an edited page asks again.
 */
export function FormAllowBar({
  assetId,
  info,
  allow,
  confirming
}: {
  assetId: string
  info: FormInfo | null
  allow: FormAllow | undefined
  confirming: boolean
}): React.JSX.Element | null {
  const store = useDuduAdeStore.getState
  const changed = !!allow && info !== null && !info.allowed
  if (!confirming && !changed) {
    return null
  }
  const ports = info?.ports ?? []
  const message = changed
    ? DUDU_ADE_COPY.formChanged
    : ports.length > 0
      ? `${DUDU_ADE_COPY.formConfirm} ${ports.map((port) => `127.0.0.1:${port}`).join(', ')}`
      : DUDU_ADE_COPY.formNone
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-orange-500/10 px-2 py-1 text-2xs">
      <span className="min-w-0 flex-1">{message}</span>
      {ports.length > 0 && info ? (
        <Button
          variant="secondary"
          size="xs"
          onClick={() => {
            store().setAssetMeta(assetId, { formAllow: { hash: info.hash, ports } })
            store().startFormAllow(null)
          }}
        >
          {DUDU_ADE_COPY.formAllow}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          if (changed) {
            store().setAssetMeta(assetId, { formAllow: null })
          }
          store().startFormAllow(null)
        }}
      >
        {changed ? DUDU_ADE_COPY.formOff : DUDU_ADE_COPY.pairDismiss}
      </Button>
    </div>
  )
}
