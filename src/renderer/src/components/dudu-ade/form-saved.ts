import { useEffect } from 'react'
import { toast } from 'sonner'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'

export type FormSavedEvent = { page: string; verdict: 'saved' | 'failed' }

/**
 * A preview's form came back. Saved: say so, and put the preview away (a large preview closes, a card goes
 * back to its page). Failed: say so and leave it open so the answer can be corrected.
 */
export function applyFormSaved(
  event: FormSavedEvent,
  notify: Pick<typeof toast, 'success' | 'error'> = toast
): void {
  if (event.verdict === 'failed') {
    notify.error(DUDU_ADE_COPY.formSaveFailed)
    return
  }
  notify.success(DUDU_ADE_COPY.formSaved)
  const state = useDuduAdeStore.getState()
  const previewed = state.assets.find((asset) => asset.id === state.previewAssetId)
  if (previewed?.location === event.page) {
    state.setPreviewAsset(null)
  }
  state.resetPage(event.page)
}

export function useFormSavedWatch(): void {
  useEffect(() => window.api.shell.onDuduAdeFormSaved?.((event) => applyFormSaved(event)), [])
}
