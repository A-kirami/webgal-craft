import { afterEach, describe, expect, it } from 'vitest'

import { createEffectEditorSheetAnchor } from '../useEffectEditorTour'

const createdElements: HTMLElement[] = []

function mountSheet(style: string): HTMLElement {
  const sheet = document.createElement('div')
  sheet.dataset.tour = 'effect-editor'
  sheet.style.cssText = style
  document.body.append(sheet)
  createdElements.push(sheet)
  return sheet
}

function createAnchor(): HTMLElement {
  const anchor = createEffectEditorSheetAnchor()
  expect(anchor).toBeDefined()
  createdElements.push(anchor!)
  return anchor!
}

afterEach(() => {
  while (createdElements.length > 0) {
    createdElements.pop()?.remove()
  }
})

describe('createEffectEditorSheetAnchor', () => {
  it('锚点定位在 Sheet 扣掉滑入位移后的最终落点', () => {
    mountSheet('position: fixed; left: 1000px; top: 50px; width: 432px; height: 600px; transform: translateX(300px);')

    const rect = createAnchor().getBoundingClientRect()

    expect(Math.round(rect.left)).toBe(1000)
    expect(Math.round(rect.top)).toBe(50)
    expect(Math.round(rect.width)).toBe(432)
    expect(Math.round(rect.height)).toBe(600)
  })

  it('Sheet 静止时锚点与 Sheet 位置一致', () => {
    mountSheet('position: fixed; left: 800px; top: 100px; width: 432px; height: 600px;')

    const rect = createAnchor().getBoundingClientRect()

    expect(Math.round(rect.left)).toBe(800)
    expect(Math.round(rect.top)).toBe(100)
  })

  it('找不到 Sheet 时返回 undefined', () => {
    expect(createEffectEditorSheetAnchor()).toBeUndefined()
  })
})
