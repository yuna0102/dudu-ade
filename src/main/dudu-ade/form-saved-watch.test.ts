import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { on: vi.fn() }, webContents: {}, webFrameMain: {} }))
vi.mock('./artifact-page-protocol', () => ({ grantForToken: vi.fn() }))

import { judgeFormNavigation } from './form-saved-watch'

describe('where a form post ended up', () => {
  const ports = [8795]

  it('is a save only for saved=1 on a good answer from the allowed port', () => {
    expect(
      judgeFormNavigation('http://127.0.0.1:8795/loopit-app/1106-decisions/?saved=1', 200, ports)
    ).toBe('saved')
    expect(judgeFormNavigation('http://localhost:8795/x/?saved=1&a=2', 200, ports)).toBe('saved')
  })

  it('is a failure for any other answer from the allowed port', () => {
    expect(judgeFormNavigation('http://127.0.0.1:8795/x/', 200, ports)).toBe('failed')
    expect(judgeFormNavigation('http://127.0.0.1:8795/x/?saved=0', 200, ports)).toBe('failed')
    expect(judgeFormNavigation('http://127.0.0.1:8795/x/?saved=1', 500, ports)).toBe('failed')
    expect(judgeFormNavigation('http://127.0.0.1:8795/x/?saved=1', -1, ports)).toBe('failed')
  })

  it('says nothing for another port, host, scheme or an unallowed page', () => {
    expect(judgeFormNavigation('http://127.0.0.1:9000/x/?saved=1', 200, ports)).toBeNull()
    expect(
      judgeFormNavigation('http://127.0.0.1.evil.example:8795/?saved=1', 200, ports)
    ).toBeNull()
    expect(judgeFormNavigation('https://127.0.0.1:8795/?saved=1', 200, ports)).toBeNull()
    expect(judgeFormNavigation('http://example.com:8795/?saved=1', 200, ports)).toBeNull()
    expect(judgeFormNavigation('http://127.0.0.1:8795/?saved=1', 200, [])).toBeNull()
    expect(judgeFormNavigation('not a url', 200, ports)).toBeNull()
  })
})
