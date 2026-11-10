import { afterEach, describe, expect, it, vi } from 'vitest'
import { deskFile, excludedDirs, isExcludedPath, outRoot } from './user-paths'

afterEach(() => vi.unstubAllEnvs())

describe('user paths', () => {
  it('defaults sit under the home folder and nothing is excluded', () => {
    vi.stubEnv('DUDU_ADE_OUT_DIR', '')
    vi.stubEnv('DUDU_ADE_DESK_FILE', '')
    vi.stubEnv('DUDU_ADE_EXCLUDE_DIRS', '')
    expect(outRoot('/h')).toBe('/h/dudu-ade')
    expect(deskFile('/h')).toBe('/h/.dudu-ade/desk.json')
    expect(excludedDirs('/h')).toEqual([])
  })

  it('environment variables win and ~ means the home folder', () => {
    vi.stubEnv('DUDU_ADE_OUT_DIR', '~/work/out')
    vi.stubEnv('DUDU_ADE_DESK_FILE', '/data/desk.json')
    vi.stubEnv('DUDU_ADE_EXCLUDE_DIRS', '~/a/, /b ,')
    expect(outRoot('/h')).toBe('/h/work/out')
    expect(deskFile('/h')).toBe('/data/desk.json')
    expect(excludedDirs('/h')).toEqual(['/h/a', '/b'])
  })

  it('matches an excluded folder and below, not a sibling with the same prefix', () => {
    expect(isExcludedPath('/b', ['/b'])).toBe(true)
    expect(isExcludedPath('/b/c.md', ['/b'])).toBe(true)
    expect(isExcludedPath('/b2/c.md', ['/b'])).toBe(false)
  })
})
