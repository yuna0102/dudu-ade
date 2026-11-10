import { assetKindForPath } from './dudu-ade-asset-kinds'

const HEREDOC = /<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1[^\n]*\n[^]*?\n\s*\2(?=\s|$)/g

/** Splits one command line into words, keeping quoted text together and dropping the quotes. */
function words(segment: string): string[] {
  const out: string[] = []
  const pattern = /'([^']*)'|"((?:\\.|[^"\\])*)"|(\S+)/g
  for (let match = pattern.exec(segment); match; match = pattern.exec(segment)) {
    out.push(match[1] ?? match[2]?.replace(/\\(.)/g, '$1') ?? match[3])
  }
  return out
}

function resolvePath(raw: string, cwd: string, home: string): string | null {
  const text = raw.replace(/^\$\{?HOME\}?(?=\/|$)/, home).replace(/^~(?=\/|$)/, home)
  // A path built from a variable or a pattern is not a file this can name.
  if (!text || /[*?[\]{}`]/.test(text) || text.includes('$')) {
    return null
  }
  const joined = text.startsWith('/') ? text : `${cwd}/${text}`
  const parts: string[] = []
  for (const part of joined.split('/')) {
    if (part === '..') {
      parts.pop()
    } else if (part && part !== '.') {
      parts.push(part)
    }
  }
  return `/${parts.join('/')}`
}

/**
 * Files a shell command wrote, as far as its text says: the target of `>`, `>>` and `tee`, and the end of `cp`
 * and `mv`. Only paths of a kind the board shows, so a script's log or a source file is never taken. A
 * command run from elsewhere with `cd` is followed. This reads text only: whether the command worked is for
 * the caller to check against the file.
 */
export function bashOutputPaths(command: string, cwd: string, home: string): string[] {
  const found = new Set<string>()
  let dir = cwd
  const take = (raw: string | undefined): void => {
    const path = raw ? resolvePath(raw, dir, home) : null
    if (path && assetKindForPath(path)) {
      found.add(path)
    }
  }
  const text = command.replace(HEREDOC, ' ')
  for (const segment of text.split(/&&|\|\||;|\n|\|/)) {
    const list = words(segment.trim())
    const redirect = /^(?:\d*|&)>>?$/
    for (let index = 0; index < list.length; index += 1) {
      const word = list[index]
      if (redirect.test(word)) {
        take(list[index + 1])
      } else if (/^(?:\d*|&)>>?./.test(word) && !word.includes('>&')) {
        take(word.replace(/^(?:\d*|&)>>?/, ''))
      }
    }
    const args = list.filter((word) => !/^(?:\d*|&)>>?/.test(word))
    const name = args[0]?.split('/').pop()
    const operands = args.slice(1).filter((word) => !word.startsWith('-'))
    if (name === 'cd' && operands[0]) {
      dir = resolvePath(operands[0], dir, home) ?? dir
    } else if (name === 'tee') {
      operands.forEach(take)
    } else if ((name === 'cp' || name === 'mv') && operands.length >= 2) {
      const target = operands.at(-1) ?? ''
      if (assetKindForPath(target)) {
        take(target)
      } else {
        // A folder as the target: each source of a shown kind lands in it under its own name.
        for (const source of operands.slice(0, -1)) {
          const base = source.split('/').pop() ?? ''
          if (assetKindForPath(base)) {
            take(`${target.replace(/\/$/, '')}/${base}`)
          }
        }
      }
    }
  }
  return [...found]
}
