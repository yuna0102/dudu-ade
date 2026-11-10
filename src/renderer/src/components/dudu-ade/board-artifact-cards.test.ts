import { parseOutIndex } from '../../../../shared/dudu-ade-out-index'
import { describe, expect, it } from 'vitest'
import { artifactChoices } from './board-artifact-choices'
import { markdownSyncAction } from './board-markdown-sync'
import type { CollectedAsset } from './dudu-ade-store-types'

const source = {
  terminalTitle: 'UX',
  worktreeId: 'wt',
  worktreePath: '/p',
  branch: 'b',
  tabId: 't',
  leafId: 'l'
}
const asset = (
  location: string,
  kind: CollectedAsset['kind'],
  firstSeenAt: number
): CollectedAsset & { name: string } => ({
  id: location,
  kind,
  location,
  firstSeenAt,
  lastSeenAt: firstSeenAt,
  source,
  name: location.split('/').pop() ?? location
})
const row = (date: string, name: string, url: string | null, localHtml: string | null = null) => ({
  date,
  name,
  section: '앱',
  artifactUrl: url,
  localHtml,
  localMarkdown: null,
  localFolder: null
})
const now = new Date(2026, 10, 5)

describe('artifact choices', () => {
  it('merges scanned links with INDEX rows, once each, keeping the title and who made it', () => {
    const url = 'https://claude.ai/artifact/AAA'
    const [only, ...rest] = artifactChoices(
      [asset(url, 'artifact-link', 1)],
      [row('1104', '앱 기획', url)],
      '/o',
      '',
      now
    )
    expect(rest).toEqual([])
    expect(only.title).toBe('앱 기획')
    expect(only.source).toEqual(source)
  })

  it('offers only links and pages, newest first, and treats a later month as last year', () => {
    const choices = artifactChoices(
      [
        asset('/p/a.png', 'image', Date.now()),
        asset('/p/b.html', 'html', new Date(2026, 10, 4).getTime())
      ],
      [
        row('1103', '어제 전', 'https://claude.ai/artifact/B'),
        row('1201', '작년 12월', 'https://claude.ai/artifact/C')
      ],
      '/o',
      '',
      now
    )
    expect(choices.map((choice) => choice.title)).toEqual(['b.html', '어제 전', '작년 12월'])
  })

  it('points a row at its page under the results folder and searches by name', () => {
    const index = [
      row('1104', '점검 보고', null, 'app/qa/index.html'),
      row('1103', '다른 것', 'https://claude.ai/artifact/D')
    ]
    const choices = artifactChoices([], index, '/o', '점검', now)
    expect(choices).toHaveLength(1)
    expect(choices[0].localHtml).toBe('/o/app/qa/index.html')
  })

  it('offers a row with only a Markdown file as a Markdown card, and links or pages win over it', () => {
    const onlyMd = { ...row('1104', '문서', null), localMarkdown: 'app/plan.md' }
    const both = {
      ...row('1103', '링크', 'https://claude.ai/artifact/E'),
      localMarkdown: 'app/x.md'
    }
    const choices = artifactChoices([], [onlyMd, both], '/o', '', now)
    expect(choices.map((choice) => choice.localMarkdown)).toEqual(['/o/app/plan.md', null])
    expect(
      parseOutIndex('## 앱\n| 1104 | 문서 | 없음 | `app/plan.md` | 메모 |\n')[0].localMarkdown
    ).toBe('app/plan.md')
  })
})

describe('markdown card and its file', () => {
  const ok = { status: 'ok' as const, mtime: 2 }

  it('reloads an outside change when nothing is unsaved', () => {
    expect(markdownSyncAction({ disk: ok, knownMtime: 1, dirty: false })).toBe('reload')
    expect(markdownSyncAction({ disk: ok, knownMtime: null, dirty: false })).toBe('reload')
  })

  it('stops with a conflict rather than overwrite either side', () => {
    expect(markdownSyncAction({ disk: ok, knownMtime: 1, dirty: true })).toBe('conflict')
  })

  it('does nothing when the file is as last seen', () => {
    expect(markdownSyncAction({ disk: ok, knownMtime: 2, dirty: true })).toBe('none')
  })

  it('reports a deleted or refused file', () => {
    expect(markdownSyncAction({ disk: { status: 'missing' }, knownMtime: 2, dirty: false })).toBe(
      'missing'
    )
    expect(markdownSyncAction({ disk: { status: 'denied' }, knownMtime: 2, dirty: true })).toBe(
      'denied'
    )
  })
})
