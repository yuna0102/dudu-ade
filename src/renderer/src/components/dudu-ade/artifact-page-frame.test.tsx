// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArtifactPageFrame } from './ArtifactPageFrame'
import { emptyBoardLayout } from './board-layout-state'
import { useDuduAdeStore } from './dudu-ade-store'
import type { CollectedAsset } from './dudu-ade-store-types'

const ID = 'QN8YPGsHi4VpXXtkT2mnyH'
const INDEX = `## 부스\n| 1106 | 앱 기획 | https://claude.ai/artifact/${ID} | \`pair/\` (index.html) | |\n`
const asset = (location: string): CollectedAsset => ({
  id: `html:${location}`,
  kind: 'html',
  location,
  firstSeenAt: 1,
  lastSeenAt: 1,
  source: {
    terminalTitle: 't',
    worktreeId: 'w',
    worktreePath: '/p',
    branch: 'b',
    tabId: 't',
    leafId: 'l'
  }
})

const pageUrl = vi.fn(async (_path: string, _allow?: unknown) => 'dudu-artifact://token/index.html')
const formInfo = vi.fn(async (_path: string, allow?: unknown) => ({
  hash: 'h1',
  ports: [8795],
  allowed: !!allow
}))

beforeEach(() => {
  const board = emptyBoardLayout()
  useDuduAdeStore.setState({
    board,
    workspaces: { activeId: board.id, boards: [board] },
    formAllowingAssetId: null,
    linkingAssetId: null
  } as never)
  vi.stubGlobal(
    'window',
    Object.assign(window, {
      api: {
        shell: {
          duduAdeArtifactPageUrl: pageUrl,
          duduAdeArtifactFormInfo: formInfo,
          duduAdeReadOutIndex: async () => ({ outRoot: '/o', text: INDEX }),
          duduAdeArtifactTwin: async () => null,
          openFilePath: vi.fn(),
          openUrl: vi.fn()
        },
        browser: { sessionResolvePartition: async () => null }
      }
    })
  )
})
afterEach(() => {
  cleanup()
  pageUrl.mockClear()
  formInfo.mockClear()
})

const frame = (): HTMLIFrameElement => document.querySelector('iframe') as HTMLIFrameElement

describe('a local page in a preview', () => {
  it('runs its scripts from the protocol, never from inline source, and blocks forms', async () => {
    render(<ArtifactPageFrame asset={asset('/p/x.html')} title="x" />)
    await waitFor(() => expect(frame()).toBeTruthy())
    expect(frame().getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame().getAttribute('src')).toBe('dudu-artifact://token/index.html')
    expect(frame().hasAttribute('srcdoc')).toBe(false)
    expect(screen.getByText('브라우저에서 열기')).toBeTruthy()
    expect(screen.queryByText('저장 허용됨')).toBeNull()
  })

  it('adds forms to the sandbox only for an allowed page, and says so', async () => {
    act(() =>
      useDuduAdeStore
        .getState()
        .setAssetMeta('html:/p/x.html', { formAllow: { hash: 'h1', ports: [8795] } })
    )
    render(<ArtifactPageFrame asset={asset('/p/x.html')} title="x" />)
    await waitFor(() => expect(frame()?.getAttribute('sandbox')).toBe('allow-scripts allow-forms'))
    expect(screen.getByText('저장 허용됨')).toBeTruthy()
    expect(pageUrl).toHaveBeenLastCalledWith('/p/x.html', { hash: 'h1', ports: [8795] })
  })

  it('drops forms again when the page changed, and asks for a new look', async () => {
    formInfo.mockImplementation(async () => ({ hash: 'h2', ports: [8795], allowed: false }))
    act(() =>
      useDuduAdeStore
        .getState()
        .setAssetMeta('html:/p/x.html', { formAllow: { hash: 'h1', ports: [8795] } })
    )
    render(<ArtifactPageFrame asset={asset('/p/x.html')} title="x" />)
    await waitFor(() => expect(screen.getByText(/내용이 바뀌어/)).toBeTruthy())
    expect(frame().getAttribute('sandbox')).toBe('allow-scripts')
    expect(screen.queryByText('저장 허용됨')).toBeNull()
  })

  it('shows the port to confirm, then keeps the page hash with the allowance', async () => {
    formInfo.mockImplementation(async () => ({ hash: 'h1', ports: [8795], allowed: false }))
    act(() => useDuduAdeStore.getState().startFormAllow('html:/p/x.html'))
    render(<ArtifactPageFrame asset={asset('/p/x.html')} title="x" />)
    await waitFor(() => expect(screen.getByText(/127\.0\.0\.1:8795/)).toBeTruthy())
    fireEvent.click(screen.getByText('허용'))
    expect(useDuduAdeStore.getState().board.assetMeta?.['html:/p/x.html']?.formAllow).toEqual({
      hash: 'h1',
      ports: [8795]
    })
    expect(useDuduAdeStore.getState().formAllowingAssetId).toBeNull()
  })

  it('offers nothing to allow for a page with no local form', async () => {
    formInfo.mockImplementation(async () => ({ hash: 'h1', ports: [], allowed: false }))
    act(() => useDuduAdeStore.getState().startFormAllow('html:/p/x.html'))
    render(<ArtifactPageFrame asset={asset('/p/x.html')} title="x" />)
    await waitFor(() => expect(screen.getByText(/보내는 폼이 없습니다/)).toBeTruthy())
    expect(screen.queryByText('허용')).toBeNull()
  })
})

describe('a page that is also published', () => {
  it('opens as the artifact first and switches to the local copy', async () => {
    render(<ArtifactPageFrame asset={asset('/o/pair/index.html')} title="앱 기획" />)
    await waitFor(() => expect(screen.getByText('로컬')).toBeTruthy())
    expect(frame()).toBeNull()
    fireEvent.click(screen.getByText('로컬'))
    await waitFor(() => expect(frame()).toBeTruthy())
    expect(frame().getAttribute('sandbox')).toBe('allow-scripts')
    fireEvent.click(screen.getByText('아티팩트'))
    await waitFor(() => expect(frame()).toBeNull())
  })
})
