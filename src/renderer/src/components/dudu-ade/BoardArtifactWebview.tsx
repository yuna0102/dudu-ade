import { ExternalLink, Loader2, LogIn } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { moveFocusToRendererBeforeWebviewDetach } from '@/components/browser-pane/host-guest/webview-registry'
import { ORCA_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE } from '../../../../shared/browser-guest-web-preferences'
import { DUDU_ADE_COPY } from './dudu-ade-copy'

const STUCK_AFTER_MS = 15_000
/** A signed-out private artifact stays on the logo: a page with almost no text after this long has not opened. */
const OPENED_PAGE_MIN_CHARS = 40
const LOGIN_URL = 'https://claude.ai/login'
// An opened artifact draws inside its own frame, whose text this page cannot count.
const CONTENT_CHARS_SCRIPT = `document.querySelector('iframe') ? ${OPENED_PAGE_MIN_CHARS} : (document.body?.innerText.length ?? 0)`

/** Back on claude.ai past its login pages; a sign-in may pass through another site such as Google first. */
export function isSignedInPage(url: string): boolean {
  return url.startsWith('https://claude.ai/') && !isLoginPage(url)
}

export function isLoginPage(url: string): boolean {
  return /^https:\/\/claude\.ai\/(login|magic-link|oauth)/.test(url)
}

/** The address as it is: the embed form cannot show a login, so a private artifact would stay on the logo forever. */
export function artifactNeedsLogin(args: { url: string; bodyChars: number | null }): boolean {
  return (
    isLoginPage(args.url) || (args.bodyChars !== null && args.bodyChars < OPENED_PAGE_MIN_CHARS)
  )
}

/** A claude.ai page in a guest on the browser's lasting partition. The user signs in there; nothing here touches a password. */
export function BoardArtifactWebview({ url }: { url: string }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'login' | 'signing-in'>('loading')
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let webview: Electron.WebviewTag | null = null
    const check = (): void => {
      const guest = webview
      if (!guest || disposed || stateRef.current === 'signing-in') {
        return
      }
      void guest
        .executeJavaScript(CONTENT_CHARS_SCRIPT)
        .then((chars: number) => {
          if (!disposed && stateRef.current !== 'signing-in') {
            setState(
              artifactNeedsLogin({ url: guest.getURL(), bodyChars: chars }) ? 'login' : 'ready'
            )
          }
        })
        .catch(() => undefined)
    }
    const onNavigate = (event: Electron.DidNavigateEvent): void => {
      if (stateRef.current === 'signing-in') {
        // Signed in: claude.ai moved off its login pages, so go on to the artifact itself.
        if (isSignedInPage(event.url) && event.url !== url) {
          setState('loading')
          void webview?.loadURL(url)
          if (timer) {
            clearTimeout(timer)
          }
          timer = setTimeout(check, STUCK_AFTER_MS)
        }
      } else if (isLoginPage(event.url)) {
        setState('login')
      }
    }
    const onStop = (): void => {
      if (stateRef.current === 'loading') {
        setState('ready')
      }
    }
    void window.api.browser
      .sessionResolvePartition({ profileId: null })
      .then((partition) => {
        if (disposed || !partition || !containerRef.current) {
          return
        }
        const element = document.createElement('webview') as Electron.WebviewTag
        element.setAttribute('partition', partition)
        element.setAttribute('webpreferences', ORCA_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE)
        element.style.cssText = 'display:flex;width:100%;height:100%;border:none'
        element.addEventListener('did-navigate', onNavigate)
        element.addEventListener('did-stop-loading', onStop)
        containerRef.current.appendChild(element)
        element.setAttribute('src', url)
        webview = element
        webviewRef.current = element
      })
      .catch(() => undefined)
    timer = setTimeout(check, STUCK_AFTER_MS)
    return () => {
      disposed = true
      if (timer) {
        clearTimeout(timer)
      }
      if (webview) {
        webview.removeEventListener('did-navigate', onNavigate)
        webview.removeEventListener('did-stop-loading', onStop)
        moveFocusToRendererBeforeWebviewDetach(webview)
        webview.remove()
      }
      webviewRef.current = null
    }
  }, [url])

  return (
    <div ref={containerRef} className="relative flex min-h-0 flex-1 overflow-hidden bg-background">
      {state === 'loading' ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}
      {state === 'login' ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
          <p className="text-sm font-medium">{DUDU_ADE_COPY.artifactPrivate}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="xs"
              onClick={() => {
                setState('signing-in')
                void webviewRef.current?.loadURL(LOGIN_URL)
              }}
            >
              <LogIn />
              {DUDU_ADE_COPY.artifactLoginHere}
            </Button>
            <Button variant="ghost" size="xs" onClick={() => void window.api.shell.openUrl(url)}>
              <ExternalLink />
              {DUDU_ADE_COPY.artifactOpen}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
