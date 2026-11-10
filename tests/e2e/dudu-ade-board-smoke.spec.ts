// Board smoke in the real app on an isolated profile: what vitest cannot see (real layout, hit testing, IPC, protocol).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Locator, Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.describe.configure({ mode: 'serial' })

async function openBoard(page: Page): Promise<void> {
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  // The app stays up between tests, and clicking the open entry would close the board.
  const entry = page.locator('button[aria-current="page"]', { hasText: '보드' })
  if ((await entry.count()) === 0) {
    await page.getByRole('button', { name: '보드', exact: true }).first().click()
  }
}

const terminalCard = (page: Page): Locator =>
  page
    .locator('[data-board-card]')
    .filter({ has: page.locator('.xterm') })
    .first()

async function drag(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number
): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 })
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 })
  await page.mouse.up()
}

test('the board opens, shows a live terminal and stretches it down', async ({ orcaPage: page }) => {
  await openBoard(page)
  const card = terminalCard(page)
  await expect(card).toBeVisible({ timeout: 30_000 })
  const before = await card.boundingBox()
  expect(before).toBeTruthy()

  // The bottom edge handle, grabbed in the middle so the corner handle stays out of it.
  await drag(page, { x: before!.x + before!.width / 2, y: before!.y + before!.height - 2 }, 0, 160)

  await expect
    .poll(async () => (await card.boundingBox())?.height ?? 0)
    .toBeGreaterThan(before!.height + 60)
  const after = await card.boundingBox()
  expect(after!.width).toBeCloseTo(before!.width, 0)
  // The PTY follows on release: the terminal fills the taller card instead of leaving empty room or being cut off.
  await expect
    .poll(
      async () => {
        const screen = await card.locator('.xterm-screen').boundingBox()
        const box = await card.boundingBox()
        return screen && box ? screen.height / box.height : 0
      },
      { timeout: 15_000 }
    )
    .toBeGreaterThan(0.8)
  const fitted = (await card.locator('.xterm-screen').boundingBox())!
  const frame = (await card.boundingBox())!
  expect(fitted.y + fitted.height).toBeLessThanOrEqual(frame.y + frame.height)
  // The way back to the scaled preview appears only on a stretched card.
  await expect(card.getByRole('button', { name: '원래 미리보기로 되돌리기' })).toBeVisible()
  await card.getByRole('button', { name: '원래 미리보기로 되돌리기' }).click()
  await expect(card.getByRole('button', { name: '원래 미리보기로 되돌리기' })).toHaveCount(0)
  await expect(card.locator('.xterm')).toBeVisible()
})

test('a note lying over a terminal is the one that gets grabbed', async ({ orcaPage: page }) => {
  await openBoard(page)
  const card = terminalCard(page)
  await expect(card).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '추가', exact: true }).first().click()
  await page.getByRole('menuitem', { name: '스티커 메모' }).click()
  const note = page
    .locator('[data-board-card]')
    .filter({ has: page.locator('textarea:not(.xterm-helper-textarea)') })
    .first()
  await expect(note).toBeVisible()

  const noteHeader = note.locator('[data-board-card-header]')
  const headerBox = (await noteHeader.boundingBox())!
  const target = (await card.boundingBox())!
  await drag(
    page,
    { x: headerBox.x + 40, y: headerBox.y + headerBox.height / 2 },
    target.x + 60 - (headerBox.x + 40),
    target.y + 90 - (headerBox.y + headerBox.height / 2)
  )

  const noteBox = (await note.boundingBox())!
  const center = { x: noteBox.x + noteBox.width / 2, y: noteBox.y + noteBox.height / 2 }
  const cardBefore = (await card.boundingBox())!
  expect(center.x).toBeGreaterThan(cardBefore.x)
  expect(center.y).toBeGreaterThan(cardBefore.y)
  expect(center.y).toBeLessThan(cardBefore.y + cardBefore.height)

  // Hit test at the overlap, as a real click would see it.
  const hit = await page.evaluate(({ x, y }) => {
    const card = document.elementFromPoint(x, y)?.closest('[data-board-card]')
    return {
      hasTextarea: !!card?.querySelector('textarea:not(.xterm-helper-textarea)'),
      hasXterm: !!card?.querySelector('.xterm')
    }
  }, center)
  expect(hit).toEqual({ hasTextarea: true, hasXterm: false })

  const header = (await noteHeader.boundingBox())!
  await drag(page, { x: header.x + 40, y: header.y + header.height / 2 }, 30, 30)
  const moved = (await note.boundingBox())!
  expect(moved.x).toBeGreaterThan(noteBox.x + 10)
  const cardAfter = (await card.boundingBox())!
  expect(cardAfter.x).toBeCloseTo(cardBefore.x, 0)
  expect(cardAfter.y).toBeCloseTo(cardBefore.y, 0)
})

test('a split local page loads its files from its folder but cannot reach the app or leave it', async ({
  orcaPage: page
}) => {
  await waitForSessionReady(page)
  const dir = mkdtempSync(join(tmpdir(), 'dudu-artifact-'))
  try {
    mkdirSync(join(dir, 'page', 'css'), { recursive: true })
    writeFileSync(join(dir, 'secret.txt'), 'outside')
    writeFileSync(join(dir, 'page', 'data.json'), '{"loaded":true}')
    writeFileSync(join(dir, 'page', 'css', 'a.css'), 'body { color: rgb(1, 2, 3); }')
    writeFileSync(
      join(dir, 'page', 'index.html'),
      '<!doctype html><link rel="stylesheet" href="css/a.css"><body>hello</body>'
    )
    const url = await page.evaluate(
      (path) => window.api.shell.duduAdeArtifactPageUrl?.(path) ?? null,
      join(dir, 'page', 'index.html')
    )
    expect(url).toMatch(/^dudu-artifact:\/\//)
    await page.evaluate((src) => {
      const frame = document.createElement('iframe')
      frame.setAttribute('sandbox', 'allow-scripts')
      frame.src = src!
      frame.id = 'dudu-artifact-probe'
      document.body.append(frame)
    }, url)
    const frame = await expect
      .poll(
        () =>
          page.frames().find((candidate) => candidate.url().startsWith('dudu-artifact:')) ?? null
      )
      .not.toBeNull()
      .then(() => page.frames().find((candidate) => candidate.url().startsWith('dudu-artifact:'))!)
    await expect
      .poll(() => frame.evaluate(() => getComputedStyle(document.body).color))
      .toBe('rgb(1, 2, 3)')
    const probe = await frame.evaluate(async () => {
      const read = async (href: string): Promise<number | string> =>
        fetch(href).then(
          (response) => response.status,
          (error: Error) => error.name
        )
      let appReachable = true
      try {
        appReachable = !!(window.parent as unknown as { api?: unknown }).api
      } catch {
        appReachable = false
      }
      return {
        origin: self.origin,
        data: await read('data.json'),
        outside: await read('../secret.txt'),
        encoded: await read('%2e%2e/secret.txt'),
        appReachable
      }
    })
    expect(probe).toEqual({
      origin: 'null',
      data: 200,
      outside: 404,
      encoded: 404,
      appReachable: false
    })
  } finally {
    await page.evaluate(() => document.getElementById('dudu-artifact-probe')?.remove())
    rmSync(dir, { recursive: true, force: true })
  }
})

test('conversation history is asked of main without an error when nothing is running', async ({
  orcaPage: page
}) => {
  await waitForSessionReady(page)
  const answer = await page.evaluate(() =>
    window.api.shell.duduAdeTranscriptAssets?.({
      chats: [{ paneKey: 'tab:chat', providerSessionId: '../../../etc/passwd' }],
      seen: {}
    })
  )
  expect(Array.isArray(answer)).toBe(true)
  expect(answer?.some((entry) => entry.paneKey === 'tab:chat')).toBe(false)
})

test('a board arranged by hand opens the same after a restart, from the saved layout alone', async ({
  orcaPage: page
}) => {
  await openBoard(page)
  // Layout files go by window name, and this window has none until it is given one.
  await page.evaluate(() => {
    const store = (window as never as { __store: { getState: () => Record<string, never> } })
      .__store
    const state = store.getState() as unknown as {
      tabsByWorktree: Record<string, { id: string }[]>
      setTabCustomTitle: (id: string, title: string) => void
    }
    for (const tabs of Object.values(state.tabsByWorktree)) {
      for (const tab of tabs) {
        state.setTabCustomTitle(tab.id, '스모크 창')
      }
    }
  })
  const card = terminalCard(page)
  await expect(card).toBeVisible({ timeout: 30_000 })
  const header = card.locator('[data-board-card-header]')
  const start = await header.boundingBox()
  expect(start).toBeTruthy()
  await drag(page, { x: start!.x + 120, y: start!.y + start!.height / 2 }, 180, 90)

  type Saved = { version: number; cards: { name: string; geometry: { x: number; y: number } }[] }
  const readSaved = async (): Promise<Saved | null> =>
    page.evaluate(async () => {
      const text = await (
        window as never as {
          api: { shell: { duduAdeReadBoardLayout: () => Promise<string | null> } }
        }
      ).api.shell.duduAdeReadBoardLayout()
      return text ? (JSON.parse(text) as Saved) : null
    })
  const before = await card.boundingBox()
  // Saving is by itself: nothing is pressed.
  await expect
    .poll(
      async () => (await readSaved())?.cards.some((entry) => entry.name === '스모크 창') ?? false,
      {
        timeout: 30_000
      }
    )
    .toBe(true)
  const saved = (await readSaved())!
  expect(saved.version).toBe(2)
  const place = saved.cards.find((entry) => entry.name === '스모크 창')!.geometry

  // The app's own copy goes too, so only the file can bring the place back, as after losing app data.
  await page.evaluate(() => {
    const realSet = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string): void {
      if (!key.startsWith('dudu-ade:boards')) {
        realSet.call(this, key, value)
      }
    }
    localStorage.removeItem('dudu-ade:boards:v2')
  })
  await page.reload()
  await openBoard(page)
  const reopened = terminalCard(page)
  await expect(reopened).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const raw = await (
            window as never as {
              api: { shell: { duduAdeReadBoardLayout: () => Promise<string | null> } }
            }
          ).api.shell.duduAdeReadBoardLayout()
          return raw ? (JSON.parse(raw) as { source: string }).source : null
        }),
      { timeout: 5_000 }
    )
    .toBeTruthy()
  // The browser rounds style values, so a place matches within a pixel.
  const offBy = async (side: 'left' | 'top', want: number): Promise<number> =>
    Math.abs(
      Number.parseFloat(
        await reopened.evaluate((element, name) => (element as HTMLElement).style[name], side)
      ) - want
    )
  await expect.poll(() => offBy('left', place.x), { timeout: 30_000 }).toBeLessThan(1)
  expect(await offBy('top', place.y)).toBeLessThan(1)
  expect(before).toBeTruthy()
})
