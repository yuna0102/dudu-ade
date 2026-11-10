import { app, webContents as allWebContents, webFrameMain, type WebContents } from 'electron'
import { DUDU_ARTIFACT_SCHEME } from '../../shared/dudu-ade-artifact-scheme'
import { grantForToken } from './artifact-page-protocol'

export type FormVerdict = 'saved' | 'failed'
export type FormSavedEvent = { page: string; verdict: FormVerdict }

/**
 * Where a form post ended up: only an address on the page's own allowed local port counts. `saved=1` on a
 * good answer is a save; any other answer from that port is a failure to tell the user about. Anywhere else
 * (another port, another host) says nothing.
 */
export function judgeFormNavigation(
  url: string,
  status: number,
  formPorts: readonly number[]
): FormVerdict | null {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return null
  }
  const local = target.hostname === '127.0.0.1' || target.hostname === 'localhost'
  if (target.protocol !== 'http:' || !local || !formPorts.includes(Number(target.port))) {
    return null
  }
  return target.searchParams.get('saved') === '1' && status >= 200 && status < 300
    ? 'saved'
    : 'failed'
}

const tokenOfFrame = new Map<number, string>()

/** The frame is told apart by its tree node: it keeps that through a move to another origin, where its process changes. */
function watch(contents: WebContents, notify: (event: FormSavedEvent) => void): void {
  contents.on(
    'did-frame-navigate',
    (_event, url, status, _text, isMainFrame, processId, routingId) => {
      if (isMainFrame) {
        return
      }
      const node = webFrameMain.fromId(processId, routingId)?.frameTreeNodeId
      if (node === undefined) {
        return
      }
      if (url.startsWith(`${DUDU_ARTIFACT_SCHEME}://`)) {
        tokenOfFrame.set(node, new URL(url).hostname)
        return
      }
      const grant = grantForToken(tokenOfFrame.get(node) ?? '')
      const verdict = grant?.page ? judgeFormNavigation(url, status, grant.formPorts ?? []) : null
      if (grant?.page && verdict) {
        notify({ page: grant.page, verdict })
      }
    }
  )
}

/** Tells the app window when a preview's form post came back saved or failed. */
export function registerFormSavedWatch(): void {
  const notify = (event: FormSavedEvent): void => {
    for (const contents of allWebContents.getAllWebContents()) {
      if (!contents.isDestroyed() && contents.getType() === 'window') {
        contents.send('duduAde:formSaved', event)
      }
    }
  }
  allWebContents.getAllWebContents().forEach((contents) => watch(contents, notify))
  app.on('web-contents-created', (_event, contents) => watch(contents, notify))
}
