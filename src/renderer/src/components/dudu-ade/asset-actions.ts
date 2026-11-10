import { toast } from 'sonner'
import { openDetectedFilePath } from '@/components/terminal-pane/terminal-file-open-routing'
import { revealDashboardAgent } from '@/components/dashboard/reveal-dashboard-agent'
import type { CollectedAsset } from './dudu-ade-store'
import { useDuduAdeStore } from './dudu-ade-store'

/** Opens through the terminal link path, so Markdown, image and PDF land in the editor preview and HTML in the browser pane. */
export function openCollectedAsset(asset: CollectedAsset): void {
  if (asset.kind === 'artifact-link') {
    void window.api.shell.openUrl(asset.location)
    return
  }
  useDuduAdeStore.getState().closePanel()
  openDetectedFilePath(asset.location, null, null, {
    worktreeId: asset.source.worktreeId,
    worktreePath: asset.source.worktreePath
  })
}

export function revealAssetSourceTerminal(asset: CollectedAsset): void {
  useDuduAdeStore.getState().closePanel()
  revealDashboardAgent({
    repoId: '',
    worktreeId: asset.source.worktreeId,
    tabId: asset.source.tabId,
    leafId: asset.source.leafId
  })
}

export async function copyAssetLocation(asset: CollectedAsset): Promise<void> {
  try {
    await window.api.ui.writeClipboardText(asset.location)
    toast.success(asset.location)
  } catch {}
}
