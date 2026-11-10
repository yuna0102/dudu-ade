import { describe, expect, it } from 'vitest'
import { parseOutIndex } from './dudu-ade-out-index'

const INDEX = `# 결과물 목록
- 아티팩트 전체: https://claude.ai/code/artifacts

## 스토어 앱 (loopit-app)
| 날짜 | 이름 | 아티팩트 | 로컬 | 메모 |
|---|---|---|---|---|
| 1030 | GPU 안내 | https://claude.ai/artifact/LP19Rh | \`loopit-app/1030-aws/\` (aws-guide.html) | 비공개 |
| 1104 | 설계 | 설계 https://claude.ai/artifact/ENZ79r | \`loopit-app/1104-about/\` (design3d.html, proto3d.html) | |
| 1104 | 점검 보고 | | \`loopit-app/1104-ux-qa/index.html\` | 로컬만 |
| 1103 | QA 문서만 | | \`loopit-app/1103-ui/QA.md\` | 로컬만 |
| 1105 | 레포 문서 | | repo \`loopit-app/apps/DECISIONS.md\` | |

## 부스
| 1018 | 시안 | https://claude.ai/code/artifact/ABz85q | | |
| 1001 | 위험 경로 | | \`../secret/page.html\` | |
`

describe('INDEX.md', () => {
  const entries = parseOutIndex(INDEX)

  const named = (name: string) => entries.find((entry) => entry.name === name)!

  it('keeps rows with a link, a local page or a markdown file, newest first', () => {
    expect(entries.map((entry) => entry.name)).toEqual([
      '레포 문서',
      '설계',
      '점검 보고',
      'QA 문서만',
      'GPU 안내',
      '시안'
    ])
  })

  it('finds the artifact link and the section', () => {
    expect(named('설계').artifactUrl).toBe('https://claude.ai/artifact/ENZ79r')
    expect(named('시안').artifactUrl).toBe('https://claude.ai/code/artifact/ABz85q')
    expect(named('시안').section).toBe('부스')
  })

  it('resolves a direct page and the first page named after a folder', () => {
    expect(named('점검 보고').localHtml).toBe('loopit-app/1104-ux-qa/index.html')
    expect(named('설계').localHtml).toBe('loopit-app/1104-about/design3d.html')
  })

  it('ignores paths that climb out of the folder', () => {
    expect(entries.some((entry) => entry.name === '위험 경로')).toBe(false)
  })

  it('survives empty or foreign text', () => {
    expect(parseOutIndex('')).toEqual([])
    expect(parseOutIndex('| a | b |\nhello')).toEqual([])
  })
})
