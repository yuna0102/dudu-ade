import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { parseOutIndex } from '../../shared/dudu-ade-out-index'
import { findArtifactTwin } from './artifact-twin'

describe('a copy of a published page', () => {
  const root = mkdtempSync(join(tmpdir(), 'dudu-twin-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  const put = (rel: string, text: string): string => {
    const path = join(root, rel)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
    return path
  }
  put('app/plan/index.html', '<p>plan</p>')
  const entries = parseOutIndex(
    '| 1106 | 앱 기획 | https://claude.ai/artifact/QN8YPGsHi4VpXXtkT2mnyH | `app/plan/` (index.html) | |'
  )

  it('is offered the row with the same name and the same content', async () => {
    const copy = put('ref/app-plan/index.html', '<p>plan</p>')
    expect(await findArtifactTwin(copy, root, entries)).toEqual({
      artifactUrl: 'https://claude.ai/artifact/QN8YPGsHi4VpXXtkT2mnyH',
      name: '앱 기획'
    })
  })

  it('is not offered when the content or the name differs, or for the page itself', async () => {
    expect(
      await findArtifactTwin(put('ref/b/index.html', '<p>edited</p>'), root, entries)
    ).toBeNull()
    expect(await findArtifactTwin(put('ref/c/other.html', '<p>plan</p>'), root, entries)).toBeNull()
    expect(await findArtifactTwin(join(root, 'app/plan/index.html'), root, entries)).toBeNull()
    expect(await findArtifactTwin(join(root, 'missing.html'), root, entries)).toBeNull()
  })
})
