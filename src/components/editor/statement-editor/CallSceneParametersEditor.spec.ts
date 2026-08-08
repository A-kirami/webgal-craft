import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserClickStub, createBrowserContainerStub, createBrowserInputStub, renderInBrowser } from '~/__tests__/browser-render'

import CallSceneParametersEditor from './CallSceneParametersEditor.vue'

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  Input: createBrowserInputStub('StubInput'),
  Label: createBrowserContainerStub('StubLabel', 'label'),
}

function renderEditor(surface: 'inline' | 'panel') {
  return renderInBrowser(CallSceneParametersEditor, {
    props: {
      surface,
      parameters: [{ key: 'enemy', value: 'slime' }],
    },
    global: {
      stubs: globalStubs,
    },
  })
}

describe('CallSceneParametersEditor', () => {
  it('inline 中使用等号连接场景参数的键和值', async () => {
    renderEditor('inline')

    await expect.element(page.getByText('=')).toBeInTheDocument()
    expect(document.querySelector('.i-lucide-arrow-right')).toBeNull()
  })

  it('panel 中复用样式数组的卡片和标签布局', () => {
    renderEditor('panel')

    const row = document.querySelector<HTMLElement>('[data-surface="panel"] > div')
    expect(row?.className).toContain('group-data-[surface=panel]:border')
    expect(row?.className).toContain('group-data-[surface=panel]:rounded-md')
    expect(row?.className).toContain('group-data-[surface=panel]:flex-col')
    expect(row?.className).toContain('group-data-[surface=panel]:items-stretch')
    expect(row?.querySelectorAll('label')).toHaveLength(2)
  })

  it('编辑键和值时保留其他参数并发出 arg 数组', async () => {
    const onUpdate = vi.fn()

    renderInBrowser(CallSceneParametersEditor, {
      props: {
        surface: 'inline',
        parameters: [
          { key: 'enemy', value: 'slime' },
          { key: 'hp', value: 100 },
        ],
        onUpdate,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByPlaceholder('edit.visualEditor.params.parameterKey').first().fill('boss')

    expect(onUpdate).toHaveBeenLastCalledWith([
      { key: 'boss', value: 'slime' },
      { key: 'hp', value: 100 },
    ])
  })
})
