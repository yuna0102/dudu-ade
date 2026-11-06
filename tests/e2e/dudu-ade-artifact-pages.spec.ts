// Local HTML previews in the real app on an isolated profile: scripts run, links to files elsewhere under home
// load, forms post only where the user allowed, and the saved viewers draw their data. Nothing leaves the machine.

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ElectronApplication, Frame, Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.describe.configure({ mode: 'serial' })

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

async function pageUrl(
  page: Page,
  path: string,
  allow?: { hash: string; ports: number[] }
): Promise<string> {
  const url = await page.evaluate(
    ([file, formAllow]) =>
      window.api.shell.duduAdeArtifactPageUrl?.(file as string, formAllow as never) ?? null,
    [path, allow] as const
  )
  expect(url).toMatch(/^dudu-artifact:\/\//)
  return url!
}

async function openFrame(page: Page, src: string, sandbox: string): Promise<Frame> {
  await page.evaluate(
    ([url, flags]) => {
      document.getElementById('probe')?.remove()
      const frame = document.createElement('iframe')
      frame.id = 'probe'
      frame.setAttribute('sandbox', flags)
      frame.src = url
      document.body.append(frame)
    },
    [src, sandbox] as const
  )
  await expect
    .poll(() => page.frames().some((candidate) => candidate.url().startsWith('dudu-artifact:')))
    .toBe(true)
  return page.frames().find((candidate) => candidate.url().startsWith('dudu-artifact:'))!
}

const closeFrame = (page: Page): Promise<void> =>
  page.evaluate(() => document.getElementById('probe')?.remove())

async function openBoard(page: Page): Promise<void> {
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  const entry = page.locator('button[aria-current="page"]', { hasText: '보드' })
  if ((await entry.count()) === 0) {
    await page.getByRole('button', { name: '보드', exact: true }).first().click()
  }
}

test('a page with a script and a storage call draws its card in the large preview', async ({
  orcaPage: page
}) => {
  const dir = mkdtempSync(join(tmpdir(), 'dudu-script-'))
  try {
    const file = join(dir, 'script-render.html')
    // The same shape as the saved decision page: one inline script, storage touched without a guard.
    writeFileSync(
      file,
      `<!doctype html><meta charset="utf-8"><body><div id="root"></div><script>
        localStorage.setItem('seen', '1');
        document.getElementById('root').innerHTML = '<section class="card">결정이 필요한 항목 ' + localStorage.getItem('seen') + '</section>';
      </script></body>`
    )
    await waitForSessionReady(page)
    await page.evaluate(
      ([path]) => {
        const source = {
          terminalTitle: '시험',
          worktreeId: 'w',
          worktreePath: '/p',
          branch: 'b',
          tabId: 't',
          leafId: 'l'
        }
        localStorage.setItem(
          'dudu-ade:assets:v1',
          JSON.stringify([
            {
              id: `html:${path}`,
              kind: 'html',
              location: path,
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
              source
            }
          ])
        )
        localStorage.setItem(
          'dudu-ade:dock:v1',
          JSON.stringify({ open: true, width: 360, pinnedIds: [], seenAt: Date.now() })
        )
      },
      [file] as const
    )
    await page.reload()
    await openBoard(page)
    await page.getByText('script-render.html').first().click()
    await expect
      .poll(
        async () => {
          const frame = page
            .frames()
            .find((candidate) => candidate.url().startsWith('dudu-artifact:'))
          return frame
            ? ((await frame
                .locator('.card')
                .textContent()
                .catch(() => '')) ?? '')
            : ''
        },
        { timeout: 30_000 }
      )
      .toContain('결정이 필요한 항목 1')
    // The frame is the scripted kind, with no inline copy of the source.
    const sandbox = await page.locator('iframe[sandbox]').first().getAttribute('sandbox')
    expect(sandbox).toBe('allow-scripts')
    expect(await page.locator('iframe[srcdoc]').count()).toBe(0)
    await expect(page.getByRole('button', { name: '브라우저에서 열기' }).first()).toBeVisible()
  } finally {
    await page.evaluate(() => {
      localStorage.removeItem('dudu-ade:assets:v1')
      localStorage.removeItem('dudu-ade:dock:v1')
    })
    rmSync(dir, { recursive: true, force: true })
  }
})

// The app runs with a disposable HOME, and the link rule is about that home.
const appHome = (app: ElectronApplication): Promise<string> =>
  app.evaluate(({ app: electron }) => electron.getPath('home'))

test('files reached through links load when they sit under home in a visible folder, and not otherwise', async ({
  orcaPage: page,
  electronApp
}) => {
  await waitForSessionReady(page)
  const base = mkdtempSync(join(await appHome(electronApp), 'dudu-e2e-links-'))
  const outside = mkdtempSync(join(tmpdir(), 'dudu-e2e-outside-'))
  try {
    mkdirSync(join(base, 'page'), { recursive: true })
    mkdirSync(join(base, 'shared', 'img'), { recursive: true })
    mkdirSync(join(base, 'shared', 'data'), { recursive: true })
    mkdirSync(join(base, '.hidden'), { recursive: true })
    writeFileSync(join(base, 'shared', 'img', 'a.png'), ONE_PIXEL_PNG)
    writeFileSync(join(base, 'shared', 'img', 's.css'), '.x{background:url(a.png)}')
    writeFileSync(join(base, 'shared', 'data', 'dyn.js'), 'window.__dyn = 7;')
    writeFileSync(join(base, 'shared', 'data', 'mod.js'), 'export default 9;')
    writeFileSync(join(base, '.hidden', 'a.png'), ONE_PIXEL_PNG)
    writeFileSync(join(outside, 'a.png'), ONE_PIXEL_PNG)
    symlinkSync(join(base, 'shared', 'img'), join(base, 'page', 'img'))
    symlinkSync(join(base, 'shared', 'data'), join(base, 'page', 'data'))
    symlinkSync(join(base, '.hidden'), join(base, 'page', 'secret'))
    symlinkSync(outside, join(base, 'page', 'away'))
    writeFileSync(
      join(base, 'page', 'index.html'),
      `<!doctype html><meta charset="utf-8"><body><script>
        const size = (src) => new Promise((done) => { const i = new Image(); i.onload = () => done(i.naturalWidth); i.onerror = () => done(0); i.src = src });
        const status = (src) => fetch(src).then((r) => r.status, () => 'error');
        const dynamic = () => new Promise((done) => { const s = document.createElement('script'); s.src = 'data/dyn.js'; s.onload = () => done(window.__dyn); s.onerror = () => done(0); document.body.append(s) });
        (async () => {
          window.__probe = {
            linked: await size('img/a.png'),
            hidden: await size('secret/a.png'),
            away: await size('away/a.png'),
            css: await status('img/s.css'),
            fetched: await status('img/a.png'),
            dynamic: await dynamic(),
            module: await import('./data/mod.js').then((m) => m.default, () => 0)
          };
        })();
      </script></body>`
    )
    const frame = await openFrame(
      page,
      await pageUrl(page, join(base, 'page', 'index.html')),
      'allow-scripts'
    )
    await expect
      .poll(
        () => frame.evaluate(() => (window as never as { __probe?: unknown }).__probe ?? null),
        {
          timeout: 30_000
        }
      )
      .not.toBeNull()
    expect(await frame.evaluate(() => (window as never as { __probe: unknown }).__probe)).toEqual({
      linked: 1,
      hidden: 0,
      away: 0,
      css: 200,
      fetched: 200,
      dynamic: 7,
      module: 9
    })
  } finally {
    await closeFrame(page)
    rmSync(base, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

test('a form posts only from a page the user allowed, to its port, while the page is unchanged', async ({
  orcaPage: page
}) => {
  await waitForSessionReady(page)
  const received: string[] = []
  const server = createServer((request: IncomingMessage, response) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      if (request.method === 'POST') {
        received.push(`${request.method} ${request.url} ${body}`)
      }
      response.setHeader('content-type', 'text/html; charset=utf-8')
      if (request.method === 'POST' && body.includes('answer=fail')) {
        response.statusCode = 500
        response.end('<!doctype html><body>오류</body>')
      } else if (request.method === 'POST') {
        // The usual shape of a save: write, then go to the page's saved address.
        response.statusCode = 303
        response.setHeader('location', '/decisions/?saved=1')
        response.end()
      } else {
        response.end('<!doctype html><body id="saved">저장했습니다</body>')
      }
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  const dir = mkdtempSync(join(tmpdir(), 'dudu-form-'))
  const file = join(dir, 'decisions.html')
  const html = (extra = ''): string =>
    `<!doctype html><meta charset="utf-8"><body><form id="f" method="post" action="http://127.0.0.1:${port}/decisions/save"><input name="answer" value="예"><button id="go">저장</button></form>${extra}</body>`
  try {
    writeFileSync(file, html())
    const submit = async (frame: Frame): Promise<void> => {
      await frame.evaluate(() => (document.getElementById('f') as HTMLFormElement).requestSubmit())
    }

    // Default: forms blocked by the frame, and a script's own request to the local server by the page policy.
    let frame = await openFrame(page, await pageUrl(page, file), 'allow-scripts')
    await submit(frame)
    const scripted = await frame.evaluate(
      (target) =>
        fetch(target, { method: 'POST', mode: 'no-cors', body: 'x' }).then(
          () => 'sent',
          () => 'blocked'
        ),
      `http://127.0.0.1:${port}/decisions/save`
    )
    await page.waitForTimeout(1000)
    expect(scripted).toBe('blocked')
    expect(received).toEqual([])
    await closeFrame(page)

    // Allowed: the port shown to the user, the page's hash kept, the frame given forms.
    const info = await page.evaluate(
      (path) => window.api.shell.duduAdeArtifactFormInfo?.(path) ?? null,
      file
    )
    expect(info?.ports).toEqual([port])
    const allow = { hash: info!.hash, ports: info!.ports }
    await page.evaluate(() => {
      const heard: unknown[] = []
      ;(window as never as { __saved: unknown[] }).__saved = heard
      window.api.shell.onDuduAdeFormSaved?.((event) => heard.push(event))
    })
    const heard = (): Promise<unknown[]> =>
      page.evaluate(() => (window as never as { __saved: unknown[] }).__saved)
    frame = await openFrame(page, await pageUrl(page, file, allow), 'allow-scripts allow-forms')
    await submit(frame)
    await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1)
    expect(received[0]).toBe(`POST /decisions/save answer=%EC%98%88`)
    // The app hears of it from the frame's move to the saved address, and from nowhere else.
    await expect.poll(heard, { timeout: 15_000 }).toEqual([{ page: file, verdict: 'saved' }])
    await closeFrame(page)

    // A failed save is reported as one, and is not a save.
    frame = await openFrame(page, await pageUrl(page, file, allow), 'allow-scripts allow-forms')
    await frame.evaluate(() => {
      ;(document.querySelector('input[name=answer]') as HTMLInputElement).value = 'fail'
    })
    await submit(frame)
    await expect.poll(heard, { timeout: 15_000 }).toEqual([
      { page: file, verdict: 'saved' },
      { page: file, verdict: 'failed' }
    ])
    await closeFrame(page)
    received.length = 0

    // Edited: the same allowance holds for nothing, even with forms in the frame.
    writeFileSync(file, html('<!-- edited -->'))
    frame = await openFrame(page, await pageUrl(page, file, allow), 'allow-scripts allow-forms')
    await submit(frame)
    await page.waitForTimeout(1000)
    expect(received).toHaveLength(0)
    const after = await page.evaluate(
      ([path, formAllow]) =>
        window.api.shell.duduAdeArtifactFormInfo?.(path as string, formAllow as never) ?? null,
      [file, allow] as const
    )
    expect(after?.allowed).toBe(false)
  } finally {
    await closeFrame(page)
    await new Promise<void>((done) => server.close(() => done()))
    rmSync(dir, { recursive: true, force: true })
  }
})

// The saved viewers: a page, a link to a data folder of ~130 MB, and models' files added by script. The data is copied
// under the app's disposable home (the real folder is outside it) and read only there; nothing is sent anywhere.
const REAL_OUT = join(homedir(), 'projects/_out/loopit-app')
const VIEWERS = [
  join(REAL_OUT, '1106-decisions/ref/matting-viewer/viewer.html'),
  join(REAL_OUT, '1027-flow-test/02_viewer.html')
]
const REAL_DATA = join(REAL_OUT, '1027-flow-test/out/02_matting/viewer')

for (const viewer of VIEWERS) {
  test(`the saved viewer ${viewer.split('/').slice(-2).join('/')} draws its data`, async ({
    orcaPage: page,
    electronApp
  }) => {
    test.skip(
      !existsSync(viewer) || !existsSync(REAL_DATA),
      'the viewer files are not on this machine'
    )
    test.setTimeout(300_000)
    await waitForSessionReady(page)
    const base = mkdtempSync(join(await appHome(electronApp), 'dudu-e2e-viewer-'))
    try {
      mkdirSync(join(base, 'data', 'out', '02_matting'), { recursive: true })
      mkdirSync(join(base, 'page'), { recursive: true })
      cpSync(realpathSync(REAL_DATA), join(base, 'data', 'out', '02_matting', 'viewer'), {
        recursive: true
      })
      cpSync(viewer, join(base, 'page', 'viewer.html'))
      // As the real folders are: the page folder reaches its data through a link named out.
      symlinkSync(join(base, 'data', 'out'), join(base, 'page', 'out'))
      const frame = await openFrame(
        page,
        await pageUrl(page, join(base, 'page', 'viewer.html')),
        'allow-scripts'
      )
      // The loading note is removed once the base data and every model file have come in.
      await expect
        .poll(() => frame.evaluate(() => document.getElementById('loading') === null), {
          timeout: 240_000,
          intervals: [1000]
        })
        .toBe(true)
      expect(
        await frame.evaluate(
          () =>
            Object.keys((window as never as { VIEWER_MASKS?: object }).VIEWER_MASKS ?? {}).length
        )
      ).toBeGreaterThan(0)
    } finally {
      await closeFrame(page)
      rmSync(base, { recursive: true, force: true })
    }
  })
}
