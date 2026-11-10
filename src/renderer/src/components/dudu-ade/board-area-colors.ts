/** Middle tones: readable as a label and a border on the dark board, and as a faint tint behind cards. */
export const AREA_PALETTE: readonly { name: string; color: string }[] = [
  { name: '보라', color: '#8B6CF0' },
  { name: '파랑', color: '#4C8DFF' },
  { name: '청록', color: '#22B8CF' },
  { name: '초록', color: '#34C759' },
  { name: '연두', color: '#A3D93B' },
  { name: '노랑', color: '#F5C542' },
  { name: '주황', color: '#F5923E' },
  { name: '빨강', color: '#F0564F' },
  { name: '분홍', color: '#F472B6' },
  { name: '자주', color: '#C15BD8' },
  { name: '갈색', color: '#B98255' },
  { name: '회색', color: '#9AA0A6' }
]

export const RECENT_COLOR_LIMIT = 5

/** Frames add two alpha digits to the color, so only the full six-digit form works. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

/** The typed color in stored form, or null when it is not one. */
export function parseHexColor(typed: string): string | null {
  const color = typed.trim()
  return isHexColor(color) ? color.toUpperCase() : null
}

export function withRecentColor(recent: readonly string[], color: string): string[] {
  return [color, ...recent.filter((entry) => entry !== color)].slice(0, RECENT_COLOR_LIMIT)
}
