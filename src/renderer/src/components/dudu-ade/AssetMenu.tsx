import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { isRenamableAsset } from './AssetName'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'
import type { CollectedAsset } from './dudu-ade-store-types'

/**
 * Right click on an asset: rename, pair with an artifact page, and (inside a card's list) show it on another
 * card or take it off this one.
 */
export function AssetMenu({
  asset,
  card,
  children
}: {
  asset: CollectedAsset
  /** Set inside a card's list: the card, the other cards that can share it, and whether it was collected there. */
  card?: {
    key: string
    others: { key: string; name: string }[]
    collectedHere: boolean
  }
  children: React.ReactNode
}): React.JSX.Element {
  const store = useDuduAdeStore.getState
  const hasPair = useDuduAdeStore((state) => !!state.board.assetMeta?.[asset.id]?.artifactUrl)
  const formsAllowed = useDuduAdeStore((state) => !!state.board.assetMeta?.[asset.id]?.formAllow)
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {isRenamableAsset(asset) ? (
          <ContextMenuItem onSelect={() => store().startRenameAsset(asset.id)}>
            {DUDU_ADE_COPY.assetRename}
          </ContextMenuItem>
        ) : null}
        {asset.kind === 'html' ? (
          <ContextMenuItem
            onSelect={() => {
              store().startLinkAsset(asset.id)
              store().setPreviewAsset(asset.id)
            }}
          >
            {DUDU_ADE_COPY.assetLinkArtifact}
          </ContextMenuItem>
        ) : null}
        {asset.kind === 'html' ? (
          <ContextMenuItem
            onSelect={() => {
              if (formsAllowed) {
                store().setAssetMeta(asset.id, { formAllow: null })
              } else {
                store().startFormAllow(asset.id)
                store().setPreviewAsset(asset.id)
              }
            }}
          >
            {formsAllowed ? DUDU_ADE_COPY.formToggleOff : DUDU_ADE_COPY.formToggleOn}
          </ContextMenuItem>
        ) : null}
        {hasPair ? (
          <ContextMenuItem onSelect={() => store().setAssetMeta(asset.id, { artifactUrl: null })}>
            {DUDU_ADE_COPY.assetUnlinkArtifact}
          </ContextMenuItem>
        ) : null}
        {card && card.others.length > 0 ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger>{DUDU_ADE_COPY.assetShareTo}</ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-h-72 overflow-y-auto scrollbar-sleek">
              {card.others.map((other) => (
                <ContextMenuItem
                  key={other.key}
                  onSelect={() => store().shareAsset(asset.id, other.key)}
                >
                  {other.name}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : null}
        {card ? (
          <ContextMenuItem
            variant="destructive"
            onSelect={() => store().removeAssetFromCard(asset.id, card.key, card.collectedHere)}
          >
            {DUDU_ADE_COPY.assetRemoveFromCard}
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}
