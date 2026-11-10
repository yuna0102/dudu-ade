import type { BoardLink } from './board-layout-state'

type LinkRule = Pick<BoardLink, 'from' | 'to' | 'rule' | 'twoWay' | 'trigger'>
type Names = Readonly<Record<string, string>> | undefined

/**
 * What the windows were last told, by window name. Keys and handles change on every restart, so they stay
 * out: a reopened window still counts as told, and only a changed rule, partner, direction or trigger does not.
 */
export function linkFingerprint(link: LinkRule, names?: Names): string {
  return JSON.stringify([
    names?.[link.from] ?? link.from,
    names?.[link.to] ?? link.to,
    link.rule?.trim() ?? '',
    link.twoWay === true,
    link.trigger ?? 'manual'
  ])
}

export function isLinkApplied(link: BoardLink, names?: Names): boolean {
  return Boolean(link.rule?.trim()) && link.appliedFingerprint === linkFingerprint(link, names)
}

/**
 * Fingerprints saved before names were used held card keys. One whose rule and direction still match was
 * applied, so it is rewritten by name instead of asking to send the same rule again. Waits for both names.
 */
export function migrateLinkFingerprints<T extends BoardLink>(
  links: readonly T[],
  names: Names
): readonly T[] {
  let changed = false
  const next = links.map((link) => {
    if (!link.appliedFingerprint || !names?.[link.from] || !names[link.to]) {
      return link
    }
    let saved: unknown
    try {
      saved = JSON.parse(link.appliedFingerprint)
    } catch {
      return link
    }
    if (!Array.isArray(saved) || saved.length !== 4) {
      return link
    }
    const same = saved[2] === (link.rule?.trim() ?? '') && saved[3] === (link.twoWay === true)
    changed = true
    const { appliedFingerprint: _old, ...rest } = link
    return (same ? { ...link, appliedFingerprint: linkFingerprint(link, names) } : rest) as T
  })
  return changed ? next : links
}
