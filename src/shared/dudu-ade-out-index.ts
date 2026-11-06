export type OutIndexEntry = {
  /** MMDD as written in the table, for newest-first order. */
  date: string
  section: string
  name: string
  artifactUrl: string | null
  /** Path of a local HTML page relative to the _out folder, when the row names one. */
  localHtml: string | null
  /** Same, for a row whose only local page is a Markdown document. */
  localMarkdown: string | null
}

const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[\w-]+/
const HTML_FILE = /[\w.-]+\.html\b/

/** The row's local cell: a direct .html path, or a folder followed by "(page.html, ...)". Repo documents and other files have no preview. */
function localHtmlOf(cell: string): string | null {
  const path = /`([^`]+)`/.exec(cell)?.[1]?.trim()
  if (!path || path.includes('..') || path.startsWith('/') || path.startsWith('~')) {
    return null
  }
  if (path.endsWith('.html')) {
    return path
  }
  const page = path.endsWith('/')
    ? HTML_FILE.exec(cell.slice(cell.indexOf('`', cell.indexOf('`') + 1)))
    : null
  return page ? `${path}${page[0]}` : null
}

function localMarkdownOf(cell: string): string | null {
  const path = /`([^`]+)`/.exec(cell)?.[1]?.trim()
  return path &&
    path.endsWith('.md') &&
    !path.includes('..') &&
    !path.startsWith('/') &&
    !path.startsWith('~')
    ? path
    : null
}

/** Reads the results table in _out/INDEX.md, newest first; anything that is not a dated row is skipped. */
export function parseOutIndex(text: string): OutIndexEntry[] {
  const entries: OutIndexEntry[] = []
  let section = ''
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      section = line.slice(3).trim()
      continue
    }
    const cells = line.split('|').map((cell) => cell.trim())
    // A row splits into: '', date, name, artifact, local, memo, ''
    if (cells.length < 6 || !/^\d{4}$/.test(cells[1])) {
      continue
    }
    entries.push({
      date: cells[1],
      section,
      name: cells[2],
      artifactUrl: ARTIFACT_URL.exec(cells[3])?.[0] ?? null,
      localHtml: localHtmlOf(cells[4]),
      localMarkdown: localMarkdownOf(cells[4])
    })
  }
  return entries
    .filter((entry) => entry.artifactUrl || entry.localHtml || entry.localMarkdown)
    .sort((a, b) => Number(b.date) - Number(a.date))
}
