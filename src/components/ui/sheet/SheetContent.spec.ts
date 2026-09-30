import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

import Sheet from './Sheet.vue'
import SheetContent from './SheetContent.vue'

interface SheetContentExposed {
  contentElement?: unknown
}

async function renderSheetContent(options: { mountOpen: boolean }) {
  const open = ref(options.mountOpen)
  const sheetContentRef = ref<SheetContentExposed>()

  const Harness = defineComponent({
    name: 'SheetContentHarness',
    setup() {
      return () => h(Sheet, { modal: false, open: open.value }, () => h(SheetContent, {
        ref: sheetContentRef,
        overlay: false,
      }, {
        default: () => h('div', 'sheet-content'),
      }))
    },
  })

  await renderInBrowser(Harness)

  return {
    open,
    readContentElement: () => sheetContentRef.value?.contentElement,
  }
}

describe('SheetContent', () => {
  it('挂载时即打开会暴露对话框内容元素', async () => {
    const { readContentElement } = await renderSheetContent({ mountOpen: true })

    await vi.waitFor(() => {
      expect(readContentElement()).toBeInstanceOf(HTMLElement)
    })

    const element = readContentElement() as HTMLElement
    expect(element.getAttribute('role')).toBe('dialog')
    expect(element.textContent).toContain('sheet-content')
  })

  it('挂载后再打开同样会暴露对话框内容元素', async () => {
    const { open, readContentElement } = await renderSheetContent({ mountOpen: false })

    expect(readContentElement()).toBeUndefined()

    open.value = true

    // 内容元素在本次提交之后才写回上下文，同步读到的仍是挂载前的值
    await vi.waitFor(() => {
      expect(readContentElement()).toBeInstanceOf(HTMLElement)
    })

    const element = readContentElement() as HTMLElement
    expect(element.getAttribute('role')).toBe('dialog')
    expect(element.textContent).toContain('sheet-content')
  })
})
