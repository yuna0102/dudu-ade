import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, net: {}, protocol: {} }))

import {
  allowedFormPorts,
  formActionPorts,
  grantForPage,
  pageContentHash,
  pageSecurityPolicy,
  realPathAllowed,
  resolveGrantedPath,
  withStorageShim,
  withTextCharset
} from './artifact-page-protocol'

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

describe('links inside a page folder', () => {
  const base = mkdtempSync(join(tmpdir(), 'dudu-links-'))
  const home = join(base, 'home')
  const page = join(home, 'out', 'page')
  const put = (path: string, text: string): void => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
  }
  put(join(page, 'index.html'), '<body>x</body>')
  put(join(page, 'own', 'a.png'), 'own')
  put(join(home, 'projects', 'app', 'img', 'a.png'), 'img')
  put(join(home, 'projects', 'app', 'fonts', 'f.woff2'), 'font')
  put(join(home, '.ssh', 'id_rsa'), 'secret')
  put(join(home, 'projects', '.git', 'config'), 'hidden below')
  put(join(base, 'elsewhere', 'x.png'), 'outside home')
  symlinkSync(join(home, 'projects', 'app', 'img'), join(page, 'img'))
  symlinkSync(join(home, 'projects', 'app', 'fonts'), join(page, 'fonts'))
  symlinkSync(join(home, '.ssh'), join(page, 'keys'))
  symlinkSync(join(home, 'projects', '.git'), join(page, 'repo'))
  symlinkSync(join(base, 'elsewhere'), join(page, 'away'))
  symlinkSync(join(home, '.ssh', 'id_rsa'), join(page, 'img.txt'))
  const grant = grantForPage(join(page, 'index.html'), home)
  const check = async (urlPath: string): Promise<string | null> => {
    const full = resolveGrantedPath(grant, urlPath)
    return full ? realPathAllowed(grant, full, home) : null
  }
  afterAll(() => rmSync(base, { recursive: true, force: true }))

  it('serves its own files and links to non-hidden folders under home', async () => {
    expect(await check('/own/a.png')).toBe(realpathSync(join(page, 'own', 'a.png')))
    expect(await check('/img/a.png')).toBe(
      realpathSync(join(home, 'projects', 'app', 'img', 'a.png'))
    )
    expect(await check('/fonts/f.woff2')).toBe(
      realpathSync(join(home, 'projects', 'app', 'fonts', 'f.woff2'))
    )
  })

  it('refuses links into hidden folders, out of home, or to a hidden file, and missing files', async () => {
    expect(await check('/keys/id_rsa')).toBeNull()
    expect(await check('/img.txt')).toBeNull()
    expect(await check('/repo/config')).toBeNull()
    expect(await check('/away/x.png')).toBeNull()
    expect(await check('/own/missing.png')).toBeNull()
  })

  it('still refuses a dotted path that never leaves the page folder', async () => {
    expect(await check('/img/../../../.ssh/id_rsa')).toBeNull()
  })
})

describe('storage for sandboxed pages', () => {
  it('goes first in the head, after the doctype, and only once', () => {
    const out = withStorageShim(
      '<!doctype html><html><head><title>t</title></head><body></body></html>'
    )
    expect(out.startsWith('<!doctype html><html><head><script>')).toBe(true)
    expect(out.match(/<script>/g)).toHaveLength(1)
    expect(out).toContain('<title>t</title>')
  })

  it('falls back to after html, after the doctype, or the very start', () => {
    expect(withStorageShim('<html lang="ko"><body></body></html>')).toMatch(
      /^<html lang="ko"><script>/
    )
    expect(withStorageShim('<!DOCTYPE html><p>x</p>')).toMatch(/^<!DOCTYPE html><script>/)
    expect(withStorageShim('<p>x</p>')).toMatch(/^<script>/)
  })

  it('gives a page whose storage throws a working store, and leaves a working one alone', () => {
    const script = /<script>([^]*)<\/script>/.exec(withStorageShim('<p></p>'))![1]
    const sandboxed = {} as Record<string, unknown>
    Object.defineProperty(sandboxed, 'localStorage', {
      get() {
        throw new Error('SecurityError')
      },
      configurable: true
    })
    new Function('window', script)(sandboxed)
    const store = sandboxed.localStorage as Storage
    store.setItem('a', '1')
    expect([store.getItem('a'), store.getItem('b'), store.length]).toEqual(['1', null, 1])
    store.removeItem('a')
    expect(store.length).toBe(0)
    const real = { localStorage: 'real' } as Record<string, unknown>
    new Function('window', script)(real)
    expect(real.localStorage).toBe('real')
  })
})

describe('form posts from a page', () => {
  const form = (action: string): string =>
    `<form method="post" action="${action}"><button>저장</button></form>`

  it('reads the local ports a page posts to, and nothing else', () => {
    expect(formActionPorts(form('http://127.0.0.1:8795/a/save'))).toEqual([8795])
    expect(
      formActionPorts(`${form('http://localhost:9000/x')}${form('http://127.0.0.1:9000/y')}`)
    ).toEqual([9000])
    expect(formActionPorts(form('https://evil.example/save'))).toEqual([])
    expect(formActionPorts(form('http://127.0.0.1.evil.example:80/save'))).toEqual([])
    expect(formActionPorts(form('http://127.0.0.1:99999/save'))).toEqual([])
    expect(formActionPorts('<form action="/rel"></form>')).toEqual([])
  })

  it('blocks posts and local requests by default, and opens only the allowed ports', () => {
    const none = pageSecurityPolicy()
    expect(none).toContain("form-action 'none'")
    expect(none).not.toContain('127.0.0.1')
    const allowed = pageSecurityPolicy([8795])
    expect(allowed).toContain('form-action http://127.0.0.1:8795 http://localhost:8795;')
    expect(allowed).toContain('connect-src')
    expect(allowed).not.toMatch(/:(?!8795)\d{4}/)
    expect(allowed).not.toContain("'none'")
  })

  const dir = mkdtempSync(join(tmpdir(), 'dudu-form-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const page = join(dir, 'decisions.html')

  it('lets the allowed port through only while the page is the file that was looked at', async () => {
    writeFileSync(page, form('http://127.0.0.1:8795/a/save'))
    const hash = (await pageContentHash(page))!
    expect(await allowedFormPorts(page, { hash, ports: [8795] })).toEqual([8795])
    // A port the page does not post to is not opened, and an unknown allowance opens nothing.
    expect(await allowedFormPorts(page, { hash, ports: [8795, 1234] })).toEqual([8795])
    expect(await allowedFormPorts(page, undefined)).toEqual([])
    expect(await allowedFormPorts(page, { hash: 'x', ports: [8795] })).toEqual([])
    expect(await allowedFormPorts(page, { hash, ports: 'all' })).toEqual([])
    // Edited: the same allowance no longer holds.
    writeFileSync(page, `${form('http://127.0.0.1:8795/a/save')}<!-- changed -->`)
    expect(await allowedFormPorts(page, { hash, ports: [8795] })).toEqual([])
  })
})
