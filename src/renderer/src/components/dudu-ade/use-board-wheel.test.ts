// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { resetClippedScroll } from './use-board-wheel'

function scrolled(overflow: string): HTMLElement {
  const element = document.createElement('div')
  element.style.overflowX = overflow
  element.style.overflowY = overflow
  document.body.appendChild(element)
  element.scrollTop = 40
  element.scrollLeft = 12
  return element
}

describe('resetClippedScroll', () => {
  it('undoes the scroll the browser applies to a clipped ancestor', () => {
    const element = scrolled('hidden')
    resetClippedScroll(element)
    expect([element.scrollTop, element.scrollLeft]).toEqual([0, 0])
  })

  it('keeps the vertical scroll of a list that clips only sideways', () => {
    const element = document.createElement('div')
    element.style.overflowX = 'hidden'
    element.style.overflowY = 'auto'
    document.body.appendChild(element)
    element.scrollTop = 40
    element.scrollLeft = 12
    resetClippedScroll(element)
    expect([element.scrollTop, element.scrollLeft]).toEqual([40, 0])
  })

  it('leaves real scrollers alone', () => {
    const element = scrolled('auto')
    resetClippedScroll(element)
    expect([element.scrollTop, element.scrollLeft]).toEqual([40, 12])
  })
})
