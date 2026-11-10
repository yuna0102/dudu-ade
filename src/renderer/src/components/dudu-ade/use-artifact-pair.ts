import { useEffect, useState } from 'react'
import {
  artifactUrlForLocalPage,
  parseOutIndex,
  type OutIndexEntry
} from '../../../../shared/dudu-ade-out-index'

let indexRead: Promise<{ outRoot: string; entries: OutIndexEntry[] }> | null = null

/** The results table is read once per run; a page it lists is paired with its artifact from then on. */
function readIndex(): Promise<{ outRoot: string; entries: OutIndexEntry[] }> {
  indexRead ??= (
    window.api.shell.duduAdeReadOutIndex?.() ?? Promise.resolve({ outRoot: '', text: '' })
  )
    .then(({ outRoot, text }) => ({ outRoot, entries: parseOutIndex(text) }))
    .catch(() => ({ outRoot: '', entries: [] }))
  return indexRead
}

/**
 * The artifact page of a local page. `listed` is the table's own pairing. `twin` is only a suggestion, for a
 * copy whose path the table does not know but whose name and content match a listed page.
 */
export function useArtifactPair(
  path: string,
  skipTwin: boolean
): { listed: string | null; twin: { artifactUrl: string; name: string } | null } {
  const [listed, setListed] = useState<string | null>(null)
  const [twin, setTwin] = useState<{ artifactUrl: string; name: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    setListed(null)
    setTwin(null)
    void readIndex().then(({ outRoot, entries }) => {
      const found = outRoot ? artifactUrlForLocalPage(path, outRoot, entries) : null
      if (cancelled) {
        return
      }
      setListed(found)
      if (!found && !skipTwin) {
        void window.api.shell
          .duduAdeArtifactTwin?.(path)
          .then((next) => !cancelled && setTwin(next))
          .catch(() => undefined)
      }
    })
    return () => {
      cancelled = true
    }
  }, [path, skipTwin])
  return { listed, twin }
}
