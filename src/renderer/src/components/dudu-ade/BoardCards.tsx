import { useMemo } from 'react'
import type { TerminalAgentModel } from '../../../../shared/dudu-ade-terminal-models'
import { BoardAssetCard } from './BoardAssetCard'
import { BoardAssetPanel } from './BoardAssetPanel'
import { panelAssets } from './board-asset-panels'
import { paneKeyOf } from './board-agent-labels'
import type { BoardCardGeometry, BoardLayout } from './board-layout-state'
import type { BoardTerminal } from './board-terminal-listing'
import { BoardNoteCard } from './BoardNoteCard'
import { BoardTerminalCard } from './BoardTerminalCard'
import type { CollectedAsset } from './dudu-ade-store-types'
import type { BoardCardChange } from './use-board-card-drag'
import type { BoardTerminalMeta } from './use-board-terminals'

/** Every card on the board, plus each terminal's or chat's asset panel. */
export function BoardCards({
  liveKeys,
  collapsedKeys,
  terminalKeySet,
  board,
  terminalsByKey,
  assets,
  assetsById,
  meta,
  terminalModels,
  highlightKey,
  zoom,
  workspaceName,
  onCommitCard,
  onStartLink,
  focusedKey,
  onActivate
}: {
  liveKeys: string[]
  collapsedKeys: ReadonlySet<string>
  terminalKeySet: ReadonlySet<string>
  board: BoardLayout
  terminalsByKey: Map<string, BoardTerminal>
  assets: CollectedAsset[]
  assetsById: Map<string, CollectedAsset>
  meta: Map<string, BoardTerminalMeta>
  terminalModels: Record<string, TerminalAgentModel>
  highlightKey: string | null
  zoom: number
  workspaceName: (worktreeId: string, worktreePath: string) => string
  onCommitCard: (key: string, geometry: BoardCardGeometry, change: BoardCardChange) => void
  onStartLink: (key: string, event: React.PointerEvent) => void
  focusedKey: string | null
  onActivate: (key: string) => void
}): React.JSX.Element {
  const panels = useMemo(
    () =>
      liveKeys
        .filter((key) => terminalKeySet.has(key) && !collapsedKeys.has(key))
        .map((key) => ({
          key,
          assets: panelAssets(assets, key, board.assetPanels[key], board.cards)
        })),
    [assets, liveKeys, terminalKeySet, collapsedKeys, board.assetPanels, board.cards]
  )
  return (
    <>
      {liveKeys.map((key) => {
        if (collapsedKeys.has(key)) {
          return null
        }
        const geometry = board.cards[key]
        const highlighted = highlightKey === key
        const terminal = terminalsByKey.get(key)
        if (terminal) {
          return (
            <BoardTerminalCard
              key={key}
              terminal={terminal}
              workspaceName={workspaceName(terminal.worktreeId, terminal.worktreePath)}
              geometry={geometry}
              zoom={zoom}
              status={meta.get(key)?.status}
              model={terminalModels[paneKeyOf(terminal)]}
              highlighted={highlighted}
              onCommitCard={onCommitCard}
              onStartLink={onStartLink}
              focused={focusedKey === key}
              onActivate={onActivate}
            />
          )
        }
        const note = board.notes[key]
        if (note) {
          return (
            <BoardNoteCard
              key={key}
              noteKey={key}
              note={note}
              geometry={geometry}
              zoom={zoom}
              highlighted={highlighted}
              onCommitCard={onCommitCard}
              onStartLink={onStartLink}
            />
          )
        }
        const asset = assetsById.get(key.slice('asset:'.length))
        return asset ? (
          <BoardAssetCard
            key={key}
            asset={asset}
            card={geometry}
            zoom={zoom}
            highlighted={highlighted}
            onCommitCard={onCommitCard}
            onStartLink={onStartLink}
          />
        ) : null
      })}
      {panels.map(({ key, assets: owned }) => (
        <BoardAssetPanel
          key={`panel:${key}`}
          cardKey={key}
          card={board.cards[key]}
          panel={board.assetPanels[key]}
          assets={owned}
          zoom={zoom}
        />
      ))}
    </>
  )
}
