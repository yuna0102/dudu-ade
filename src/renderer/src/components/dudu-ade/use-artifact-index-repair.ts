import { useEffect, useMemo, useState } from 'react'
import { parseOutIndex, type OutIndexEntry } from '../../../../shared/dudu-ade-out-index'
import { artifactNoteRepair } from './board-artifact-repair'
import type { BoardNote } from './board-layout-state'
import { useDuduAdeStore } from './dudu-ade-store'

/** Corrects artifact cards and collected links from the results table: full address, readable title, local page. */
export function useArtifactIndexRepair(notes: Readonly<Record<string, BoardNote>>): void {
  const [index, setIndex] = useState<{ outRoot: string; entries: OutIndexEntry[] } | null>(null)
  useEffect(() => {
    void window.api.shell
      .duduAdeReadOutIndex?.()
      .then(({ outRoot, text }) => setIndex({ outRoot, entries: parseOutIndex(text) }))
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    if (index) {
      useDuduAdeStore
        .getState()
        .repairAssetLinks(index.entries.flatMap((entry) => entry.artifactUrl ?? []))
    }
  }, [index])
  const artifacts = useMemo(
    () => Object.entries(notes).filter(([, note]) => note.kind === 'artifact'),
    [notes]
  )
  useEffect(() => {
    if (!index) {
      return
    }
    let cancelled = false
    void (async () => {
      for (const [key, note] of artifacts) {
        const repair = artifactNoteRepair(note, index.entries, index.outRoot)
        if (!repair) {
          continue
        }
        let localHtml: string | undefined
        for (const page of repair.pages) {
          // The one that can actually be served: a folder may hold no index.html.
          if (await window.api.shell.duduAdeArtifactPageUrl?.(page).catch(() => null)) {
            localHtml = page
            break
          }
        }
        const { pages: _pages, ...fields } = repair
        if (!cancelled && (Object.keys(fields).length > 0 || localHtml)) {
          useDuduAdeStore
            .getState()
            .updateNote(key, { ...fields, ...(localHtml ? { localHtml } : {}) })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [artifacts, index])
}
