import { createHash, randomUUID } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ipcMain, net, protocol } from 'electron'
import { DUDU_ARTIFACT_SCHEME } from '../../shared/dudu-ade-artifact-scheme'
import { parseOutIndex } from '../../shared/dudu-ade-out-index'
import { findArtifactTwin } from './artifact-twin'

export const DUDU_ARTIFACT_CUSTOM_SCHEME: Electron.CustomScheme = {
  scheme: DUDU_ARTIFACT_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true
  }
}

type PageGrant = {
  root: string
  entry: string
  folderAllowed: boolean
  formPorts?: number[]
  /** The page file this grant was made for. */
  page?: string
}

const grants = new Map<string, PageGrant>()
const tokenByPage = new Map<string, string>()

/** A page straight in the home folder (or above) gets only itself, not everything beside it. */
export function grantForPage(page: string, home = homedir()): PageGrant {
  const root = dirname(page)
  return {
    root,
    entry: relative(root, page),
    // Only a folder below home: from home or above, relative() does not climb.
    folderAllowed: relative(root, home).startsWith('..')
  }
}

/** The file a request may read, or null when it leaves the folder its page was granted. */
export function resolveGrantedPath(grant: PageGrant, urlPath: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const wanted = decoded.replace(/^\/+/, '') || grant.entry
  const full = join(grant.root, wanted)
  const inside = relative(grant.root, full)
  if (inside.startsWith('..') || inside === '' || inside.startsWith(sep)) {
    return null
  }
  return grant.folderAllowed || inside === grant.entry ? full : null
}

/**
 * Where a request really lands once links are followed. Inside the page's own folder is always fine. A link
 * that leads out (a folder of images kept elsewhere) is served only when the target is under the home folder
 * and no folder on the way is hidden (.ssh, .aws, .claude): a link must not turn a page into a way to read secrets.
 */
export async function realPathAllowed(
  grant: PageGrant,
  full: string,
  home = homedir()
): Promise<string | null> {
  const real = await realpath(full).catch(() => null)
  if (!real) {
    return null
  }
  const realRoot = await realpath(grant.root).catch(() => grant.root)
  const within = relative(realRoot, real)
  if (within !== '' && !within.startsWith('..') && !isAbsolute(within)) {
    return real
  }
  const realHome = await realpath(home).catch(() => home)
  const fromHome = relative(realHome, real)
  if (fromHome === '' || fromHome.startsWith('..') || isAbsolute(fromHome)) {
    return null
  }
  return fromHome.split(sep).some((part) => part.startsWith('.')) ? null : real
}

// A sandboxed page without same-origin has no storage, and reading localStorage throws, which breaks many pages
// that only wanted to remember a choice. This gives such a page a store that lasts as long as the page is open.
const STORAGE_SHIM = `<script>(function(){function make(){var d=new Map();var api={getItem:function(k){k=String(k);return d.has(k)?d.get(k):null},setItem:function(k,v){d.set(String(k),String(v))},removeItem:function(k){d.delete(String(k))},clear:function(){d.clear()},key:function(i){var a=Array.from(d.keys());return i<a.length?a[i]:null},get length(){return d.size}};return new Proxy(api,{get:function(t,p){return p in t?t[p]:(typeof p==='string'&&d.has(p)?d.get(p):undefined)},set:function(t,p,v){if(typeof p==='string'){d.set(p,String(v))}return true},deleteProperty:function(t,p){d.delete(p);return true}})}['localStorage','sessionStorage'].forEach(function(n){try{void window[n]}catch(e){try{Object.defineProperty(window,n,{value:make(),configurable:true})}catch(e2){}}})})()</script>`

/** Puts the storage shim first in the page's head (before any script, but after a doctype so the page keeps standards mode). */
export function withStorageShim(html: string): string {
  const open = /<head(?:\s[^>]*)?>/i.exec(html) ?? /<html(?:\s[^>]*)?>/i.exec(html)
  if (open) {
    const at = open.index + open[0].length
    return `${html.slice(0, at)}${STORAGE_SHIM}${html.slice(at)}`
  }
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)
  const at = doctype ? doctype[0].length : 0
  return `${html.slice(0, at)}${STORAGE_SHIM}${html.slice(at)}`
}

const MAX_FORM_PORTS = 4
// A page over this is no decision form; hashing it would only cost time.
const MAX_HASHED_PAGE_BYTES = 64 * 1024 * 1024
const LOCAL_FORM_ACTION =
  /<form\b[^>]*?\saction\s*=\s*["']?https?:\/\/(?:127\.0\.0\.1|localhost):(\d{1,5})(?=[/"'\s>?#])/gi

/** Ports of the local servers a page's forms post to, as its own markup says. */
export function formActionPorts(html: string): number[] {
  const ports = new Set<number>()
  for (const match of html.matchAll(LOCAL_FORM_ACTION)) {
    const port = Number(match[1])
    if (port >= 1 && port <= 65535) {
      ports.add(port)
    }
  }
  return [...ports].slice(0, MAX_FORM_PORTS)
}

/**
 * What a page's documents may send: nowhere by default (no form post, and no script request to a local
 * server, which would reach an agent window just as a form does), or only to the ports the user allowed for
 * this exact page. Requests to https stay open for pages that load data.
 */
export function pageSecurityPolicy(formPorts: readonly number[] = []): string {
  const local = formPorts.flatMap((port) => [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`
  ])
  const forms = local.length > 0 ? local.join(' ') : "'none'"
  return `form-action ${forms}; connect-src 'self' https: data: blob:${local.length > 0 ? ` ${local.join(' ')}` : ''}`
}

export async function pageContentHash(path: string): Promise<string | null> {
  const info = await stat(path).catch(() => null)
  if (!info?.isFile() || info.size > MAX_HASHED_PAGE_BYTES) {
    return null
  }
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}

export type FormAllowance = { hash: string; ports: number[] }

/**
 * The ports a page may post to: those the user allowed, and only while the page is the same file as when they
 * allowed it. An edited page needs a new look, so a changed hash allows nothing.
 */
export async function allowedFormPorts(path: string, allow: unknown): Promise<number[]> {
  const given = allow as Partial<FormAllowance> | null | undefined
  if (
    !given ||
    typeof given.hash !== 'string' ||
    !Array.isArray(given.ports) ||
    (await pageContentHash(path)) !== given.hash
  ) {
    return []
  }
  const wanted = await readFile(path, 'utf8').then(formActionPorts, () => [] as number[])
  // Never wider than the page's own forms: a port the page does not post to is not worth opening.
  return given.ports
    .filter((port): port is number => wanted.includes(port))
    .slice(0, MAX_FORM_PORTS)
}

/** Saved artifact pages carry no charset (claude.ai adds it on its side), and a file URL answers without one, so Korean text came out as Latin-1 mojibake. */
export function withTextCharset(headers: Headers): Headers {
  const type = headers.get('content-type') ?? ''
  if (/^text\/(html|css|plain|xml)\b/i.test(type) && !/charset=/i.test(type)) {
    headers.set('content-type', `${type.split(';')[0].trim()}; charset=utf-8`)
  }
  return headers
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const grant = grants.get(url.hostname)
  const path = grant ? resolveGrantedPath(grant, url.pathname) : null
  const real = grant && path ? await realPathAllowed(grant, path) : null
  const isFile = real
    ? await stat(real).then(
        (info) => info.isFile(),
        () => false
      )
    : false
  // The page itself stays sandboxed by the iframe; only a read of its own folder gets through here.
  if (!real || !isFile) {
    return new Response('Not found', { status: 404 })
  }
  const file = await net.fetch(pathToFileURL(real).toString())
  // A sandboxed page has an opaque origin, so its own relative fetch() counts as cross-origin. The token is the only way in.
  const headers = withTextCharset(new Headers(file.headers))
  headers.set('Access-Control-Allow-Origin', '*')
  if (/\.html?$/i.test(real)) {
    const page = withStorageShim(await readFile(real, 'utf8'))
    headers.delete('content-length')
    headers.set('Content-Security-Policy', pageSecurityPolicy(grant?.formPorts))
    return new Response(page, { status: file.status, headers })
  }
  return new Response(file.body, { status: file.status, headers })
}

/** The grant a page's host name stands for, as it is now (the user's allowance included). */
export function grantForToken(token: string): PageGrant | undefined {
  return grants.get(token)
}

export function installArtifactPageProtocol(): void {
  protocol.handle(DUDU_ARTIFACT_SCHEME, handleRequest)
}

export function registerArtifactPageHandlers(): void {
  ipcMain.handle('duduAde:artifactTwin', async (_event, page: unknown) => {
    if (typeof page !== 'string' || !page.startsWith('/') || !/\.html?$/i.test(page)) {
      return null
    }
    const outRoot = join(homedir(), 'projects', '_out')
    const text = await readFile(join(outRoot, 'INDEX.md'), 'utf8').catch(() => '')
    return findArtifactTwin(page, outRoot, parseOutIndex(text))
  })
  ipcMain.handle('duduAde:artifactFormInfo', async (_event, page: unknown, allow: unknown) => {
    if (typeof page !== 'string' || !page.startsWith('/') || !/\.html?$/i.test(page)) {
      return null
    }
    const hash = await pageContentHash(page)
    if (!hash) {
      return null
    }
    const ports = await readFile(page, 'utf8').then(formActionPorts, () => [] as number[])
    return { hash, ports, allowed: (await allowedFormPorts(page, allow)).length > 0 }
  })
  ipcMain.handle('duduAde:artifactPageUrl', async (_event, page: unknown, allow: unknown) => {
    if (typeof page !== 'string' || !page.startsWith('/') || !/\.html?$/i.test(page)) {
      return null
    }
    const isFile = await stat(page).then(
      (info) => info.isFile(),
      () => false
    )
    if (!isFile) {
      return null
    }
    const grant = { ...grantForPage(page), formPorts: await allowedFormPorts(page, allow), page }
    // Lower-case: a standard scheme's host is case-folded by the URL parser, and a UUID stays valid.
    const token = tokenByPage.get(page) ?? randomUUID()
    tokenByPage.set(page, token)
    grants.set(token, grant)
    return `${DUDU_ARTIFACT_SCHEME}://${token}/${grant.entry.split(sep).map(encodeURIComponent).join('/')}`
  })
}
