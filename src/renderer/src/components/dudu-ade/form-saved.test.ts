// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyFormSaved } from './form-saved'
import { emptyBoardLayout } from './board-layout-state'
import { useDuduAdeStore } from './dudu-ade-store'

const PAGE = '/o/decisions/index.html'

describe('a saved form in a preview', () => {
  const notify = { success: vi.fn(), error: vi.fn() }
  beforeEach(() => {
    notify.success.mockClear()
    notify.error.mockClear()
    const board = emptyBoardLayout()
    useDuduAdeStore.setState({
      board,
      workspaces: { activeId: board.id, boards: [board] },
      assets: [
        {
          id: `html:${PAGE}`,
          kind: 'html',
          location: PAGE,
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
        }
      ],
      previewAssetId: `html:${PAGE}`,
      pageResets: {}
    } as never)
  })

  it('says it was sent, closes the large preview and puts the card back on its page', () => {
    applyFormSaved({ page: PAGE, verdict: 'saved' }, notify as never)
    expect(notify.success).toHaveBeenCalledWith('응답이 전송되었습니다!')
    expect(useDuduAdeStore.getState().previewAssetId).toBeNull()
    expect(useDuduAdeStore.getState().pageResets[PAGE]).toBe(1)
  })

  it('leaves another page open', () => {
    applyFormSaved({ page: '/o/other.html', verdict: 'saved' }, notify as never)
    expect(useDuduAdeStore.getState().previewAssetId).toBe(`html:${PAGE}`)
    expect(useDuduAdeStore.getState().pageResets['/o/other.html']).toBe(1)
  })

  it('tells of a failure and closes nothing', () => {
    applyFormSaved({ page: PAGE, verdict: 'failed' }, notify as never)
    expect(notify.error).toHaveBeenCalledWith('저장에 실패했습니다')
    expect(notify.success).not.toHaveBeenCalled()
    expect(useDuduAdeStore.getState().previewAssetId).toBe(`html:${PAGE}`)
    expect(useDuduAdeStore.getState().pageResets[PAGE]).toBeUndefined()
  })
})
