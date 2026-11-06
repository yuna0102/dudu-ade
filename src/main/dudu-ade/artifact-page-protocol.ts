import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ipcMain, net, protocol } from 'electron'
import { DUDU_ARTIFACT_SCHEME } from '../../shared/dudu-ade-artifact-scheme'

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

type PageGrant = { root: string; entry: string; folderAllowed: boolean }

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

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const grant = grants.get(url.hostname)
  const path = grant ? resolveGrantedPath(grant, url.pathname) : null
  const isFile = path
    ? await stat(path).then(
        (info) => info.isFile(),
        () => false
      )
    : false
  // The page itself stays sandboxed by the iframe; only a read of its own folder gets through here.
  if (!path || !isFile) {
    return new Response('Not found', { status: 404 })
  }
  const file = await net.fetch(pathToFileURL(path).toString())
  // A sandboxed page has an opaque origin, so its own relative fetch() counts as cross-origin. The token is the only way in.
  const headers = new Headers(file.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  return new Response(file.body, { status: file.status, headers })
}

export function installArtifactPageProtocol(): void {
  protocol.handle(DUDU_ARTIFACT_SCHEME, handleRequest)
}

export function registerArtifactPageHandlers(): void {
  ipcMain.handle('duduAde:artifactPageUrl', async (_event, page: unknown) => {
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
    const grant = grantForPage(page)
    // Lower-case: a standard scheme's host is case-folded by the URL parser, and a UUID stays valid.
    const token = tokenByPage.get(page) ?? randomUUID()
    tokenByPage.set(page, token)
    grants.set(token, grant)
    return `${DUDU_ARTIFACT_SCHEME}://${token}/${grant.entry.split(sep).map(encodeURIComponent).join('/')}`
  })
}
