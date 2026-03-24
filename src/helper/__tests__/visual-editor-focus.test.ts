import { describe, expect, it } from 'vitest'

import { canRestoreVisualEditorCardFocus, findSelectedVisualEditorStatementCard } from '../visual-editor-focus'

describe('可视化编辑器焦点', () => {
  it('在文本输入控件处于焦点时不恢复卡片焦点', () => {
    expect(canRestoreVisualEditorCardFocus({ tagName: 'INPUT' })).toBe(false)
    expect(canRestoreVisualEditorCardFocus({ tagName: 'textarea' })).toBe(false)
    expect(canRestoreVisualEditorCardFocus({ isContentEditable: true, tagName: 'div' })).toBe(false)
  })

  it('在非文本编辑上下文中允许恢复卡片焦点', () => {
    expect(canRestoreVisualEditorCardFocus(undefined)).toBe(true)
    expect(canRestoreVisualEditorCardFocus({ tagName: 'BODY' })).toBe(true)
    expect(canRestoreVisualEditorCardFocus({ tagName: 'button' })).toBe(true)
  })

  it('定位当前选中的语句卡片', () => {
    const selectedCard = { id: 'selected' }
    const root = {
      querySelector(selector: string) {
        if (selector === '[role="option"][aria-selected="true"]') {
          return selectedCard
        }
        return
      },
    }

    expect(findSelectedVisualEditorStatementCard(root)).toBe(selectedCard)
  })

  it('没有选中语句卡片时返回 undefined', () => {
    const root = {
      querySelector() {
        // eslint-disable-next-line unicorn/no-null -- querySelector 未命中时按 DOM API 约定返回 null
        return null
      },
    }

    expect(findSelectedVisualEditorStatementCard(root)).toBeUndefined()
  })
})
