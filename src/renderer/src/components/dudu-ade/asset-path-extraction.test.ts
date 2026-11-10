import { describe, expect, it } from 'vitest'
import { extractAssetReferences, homeDirFromPath, joinWrappedRows } from './asset-path-extraction'

const context = { baseDir: '/Users/me/projects/app', homeDir: '/Users/me' }

describe('extractAssetReferences', () => {
  it('finds absolute, home and relative asset paths with their kinds', () => {
    const found = extractAssetReferences(
      [
        'Saved /Users/me/_out/0301-feed/cover.png and ~/docs/plan.md',
        'Wrote ./reports/summary.pdf, then "../site/index.html".'
      ],
      context
    )
    expect(found).toEqual([
      { kind: 'image', location: '/Users/me/_out/0301-feed/cover.png' },
      { kind: 'markdown', location: '/Users/me/docs/plan.md' },
      { kind: 'pdf', location: '/Users/me/projects/app/reports/summary.pdf' },
      { kind: 'html', location: '/Users/me/projects/site/index.html' }
    ])
  })

  it('collects claude.ai artifact links but not paths inside web URLs', () => {
    const found = extractAssetReferences(
      ['Published https://claude.ai/code/artifact/abc-123 see https://example.com/a/b.png'],
      context
    )
    expect(found).toEqual([
      { kind: 'artifact-link', location: 'https://claude.ai/code/artifact/abc-123' }
    ])
  })

  it('ignores untracked extensions and dedupes repeats', () => {
    const found = extractAssetReferences(['/tmp/a.txt /tmp/b.png', 'again /tmp/b.png'], context)
    expect(found).toEqual([{ kind: 'image', location: '/tmp/b.png' }])
  })
})

describe('joinWrappedRows', () => {
  it('joins soft-wrapped continuation rows', () => {
    expect(
      joinWrappedRows(
        ['saved /Users/me/lo', 'ng/file.png', 'next'],
        [{ wrapped: false }, { wrapped: true }, { wrapped: false }]
      )
    ).toEqual(['saved /Users/me/long/file.png', 'next'])
  })
})

describe('homeDirFromPath', () => {
  it('derives the macOS home root', () => {
    expect(homeDirFromPath('/Users/me/projects/app')).toBe('/Users/me')
    expect(homeDirFromPath('/opt/work')).toBeNull()
  })
})
