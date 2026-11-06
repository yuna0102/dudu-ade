import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, net: {}, protocol: {} }))

import { grantForPage, resolveGrantedPath, withTextCharset } from './artifact-page-protocol'

describe('artifact page paths', () => {
  const grant = grantForPage('/h/out/page/index.html', '/h')

  it('serves the page and files under its folder, decoded', () => {
    expect(resolveGrantedPath(grant, '/')).toBe('/h/out/page/index.html')
    expect(resolveGrantedPath(grant, '/index.html')).toBe('/h/out/page/index.html')
    expect(resolveGrantedPath(grant, '/assets/a%20b.css')).toBe('/h/out/page/assets/a b.css')
  })

  it('refuses leaving the folder, however it is spelled', () => {
    expect(resolveGrantedPath(grant, '/../secret.txt')).toBeNull()
    expect(resolveGrantedPath(grant, '/%2e%2e/secret.txt')).toBeNull()
    expect(resolveGrantedPath(grant, '/assets/..%2f..%2fsecret.txt')).toBeNull()
    expect(resolveGrantedPath(grant, '/%E0%A4%A')).toBeNull()
  })

  it('gives a page in the home folder or above only itself', () => {
    for (const page of ['/h/index.html', '/index.html']) {
      const home = grantForPage(page, '/h')
      expect(resolveGrantedPath(home, '/index.html')).toBe(page)
      expect(resolveGrantedPath(home, '/.ssh/id_rsa')).toBeNull()
    }
  })
})

describe('artifact page charset', () => {
  it('adds utf-8 to text types that have none, and leaves the rest alone', () => {
    expect(withTextCharset(new Headers({ 'content-type': 'text/html' })).get('content-type')).toBe(
      'text/html; charset=utf-8'
    )
    expect(withTextCharset(new Headers({ 'content-type': 'text/css' })).get('content-type')).toBe(
      'text/css; charset=utf-8'
    )
    expect(
      withTextCharset(new Headers({ 'content-type': 'text/html; charset=euc-kr' })).get(
        'content-type'
      )
    ).toBe('text/html; charset=euc-kr')
    expect(withTextCharset(new Headers({ 'content-type': 'image/png' })).get('content-type')).toBe(
      'image/png'
    )
    expect(withTextCharset(new Headers()).get('content-type')).toBeNull()
  })
})
