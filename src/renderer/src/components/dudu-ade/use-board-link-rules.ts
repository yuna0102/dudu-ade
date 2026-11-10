import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { agentBucket, type BoardAgentBucket } from './board-agent-labels'
import type { BoardLayout, BoardLink } from './board-layout-state'
import {
  linkFingerprint,
  nudgeMessage,
  ruleMessages,
  sendToCard,
  shouldNudge,
  type LinkEnd
} from './board-link-send'
import type { BoardTerminal } from './board-terminal-listing'
import { boardTerminalTitle } from './BoardTerminalCard'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { useDuduAdeStore } from './dudu-ade-store'
import type { BoardTerminalMeta } from './use-board-terminals'

const end = (terminal: BoardTerminal, names: BoardLayout['names']): LinkEnd => ({
  // The recorded role name: a title can be whatever the agent last set it to.
  name: names?.[terminal.key] ?? boardTerminalTitle(terminal),
  handle: terminal.handle,
  isChat: terminal.chat !== undefined,
  chatSessionId: terminal.chat?.sessionId
})

/** Tells both windows a link's rule and reminds them when it finishes. The windows decide and hand over themselves. */
export function useBoardLinkRules(args: {
  board: BoardLayout
  terminalsByKey: Map<string, BoardTerminal>
  meta: Map<string, BoardTerminalMeta>
}): { applyLink: (link: BoardLink) => void } {
  const { board, terminalsByKey, meta } = args
  // A window that was just told something will work and finish on that; this finish is not its own work.
  const echoes = useRef(new Set<string>())
  const lastNudge = useRef(new Map<string, number>())

  const applyLink = useCallback(
    (link: BoardLink): void => {
      const names = useDuduAdeStore.getState().board.names
      const from = terminalsByKey.get(link.from)
      const to = terminalsByKey.get(link.to)
      if (!from || !to) {
        toast(DUDU_ADE_COPY.linkEndsOffBoard)
        return
      }
      const messages = ruleMessages(
        link,
        end(from, names),
        end(to, names),
        link.appliedFingerprint !== undefined
      )
      if (!messages) {
        toast(DUDU_ADE_COPY.linkRuleEmpty)
        return
      }
      echoes.current.add(link.from)
      echoes.current.add(link.to)
      void Promise.all([
        sendToCard(from, messages.toSender),
        sendToCard(to, messages.toReceiver, from.handle)
      ])
        .then(([sender, receiver]) => {
          if (!sender || !receiver) {
            toast(DUDU_ADE_COPY.linkSendFailed)
            return
          }
          const fingerprint = linkFingerprint(link, names)
          useDuduAdeStore.getState().updateBoard((current) => ({
            links: current.links.map((entry) =>
              entry.id === link.id ? { ...entry, appliedFingerprint: fingerprint } : entry
            )
          }))
        })
        .catch(() => toast(DUDU_ADE_COPY.linkSendFailed))
    },
    [terminalsByKey]
  )

  const buckets = useRef(new Map<string, BoardAgentBucket>())
  useEffect(() => {
    const previous = buckets.current
    const next = new Map<string, BoardAgentBucket>()
    for (const [key, info] of meta) {
      next.set(key, agentBucket(info.status))
    }
    buckets.current = next
    const time = Date.now()
    const finished = (key: string): boolean =>
      previous.get(key) === 'working' && next.get(key) === 'waiting'
    const nudge = (link: BoardLink, senderKey: string, receiverKey: string): void => {
      const sender = terminalsByKey.get(senderKey)
      const receiver = terminalsByKey.get(receiverKey)
      const nudgeKey = `${link.id}:${senderKey}`
      if (
        !sender ||
        !receiver ||
        !shouldNudge({
          link,
          names: board.names,
          before: previous.get(senderKey),
          now: next.get(senderKey),
          echoPending: echoes.current.has(senderKey),
          lastNudgeAt: lastNudge.current.get(nudgeKey),
          time
        })
      ) {
        return
      }
      lastNudge.current.set(nudgeKey, time)
      echoes.current.add(senderKey)
      void sendToCard(
        sender,
        nudgeMessage(link.rule ?? '', end(sender, board.names), end(receiver, board.names))
      ).catch(() => undefined)
    }
    const consumed = [...echoes.current].filter(finished)
    for (const link of board.links) {
      nudge(link, link.from, link.to)
      if (link.twoWay) {
        nudge(link, link.to, link.from)
      }
    }
    // After every link saw it: one echo covers all rules on that window.
    for (const key of consumed) {
      echoes.current.delete(key)
    }
  }, [meta, board.links, board.names, terminalsByKey])

  return { applyLink }
}
