import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { localPageCandidates, type OutIndexEntry } from '../../shared/dudu-ade-out-index'

// A page over this is no saved artifact; hashing it would only cost time.
const MAX_HASHED_BYTES = 64 * 1024 * 1024

async function hashOf(path: string): Promise<string | null> {
  const info = await stat(path).catch(() => null)
  if (!info?.isFile() || info.size > MAX_HASHED_BYTES) {
    return null
  }
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}

/**
 * A local copy of a published page (a `cp` into another folder) has another path than the results table lists.
 * A table row whose file has the same name and the same content is offered as its artifact. It is only a
 * suggestion: the caller asks the user before pairing.
 */
export async function findArtifactTwin(
  path: string,
  outRoot: string,
  entries: readonly OutIndexEntry[]
): Promise<{ artifactUrl: string; name: string } | null> {
  const mine = await hashOf(path)
  if (!mine) {
    return null
  }
  for (const entry of entries) {
    if (!entry.artifactUrl) {
      continue
    }
    for (const candidate of localPageCandidates(entry, outRoot)) {
      if (
        candidate !== path &&
        basename(candidate) === basename(path) &&
        (await hashOf(candidate)) === mine
      ) {
        return { artifactUrl: entry.artifactUrl, name: entry.name }
      }
    }
  }
  return null
}
