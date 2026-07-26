import * as monaco from 'monaco-editor'
import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

import ExternalDocumentDiffEditor from './ExternalDocumentDiffEditor.vue'

describe('ExternalDocumentDiffEditor', () => {
  it('采用左侧差异块后应用更新后的合并结果', async () => {
    const onApply = vi.fn()

    renderInBrowser(ExternalDocumentDiffEditor, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        path: '/game/scene/example.txt',
        kind: 'scene',
        localContent: 'before\nlocal\nafter',
        externalContent: 'before\nexternal\nafter',
        onApply,
      },
    })

    await expect.element(page.getByRole('status')).toHaveTextContent(
      'modals.externalDocumentChange.diff.changeStatus',
    )
    await page.getByRole('button', { name: 'modals.externalDocumentChange.diff.useLeft' }).click()
    await expect.element(page.getByRole('status')).toHaveTextContent(
      'modals.externalDocumentChange.diff.noDifferences',
    )

    await page.getByRole('button', { name: 'modals.externalDocumentChange.diff.applyResult' }).click()

    expect(onApply).toHaveBeenCalledWith('before\nlocal\nafter')
  })

  it('保留右侧差异块时继续导航且不修改合并结果', async () => {
    const onApply = vi.fn()

    renderInBrowser(ExternalDocumentDiffEditor, {
      browser: {
        i18nMode: 'lite',
        messages: {
          'zh-Hans': {
            modals: {
              externalDocumentChange: {
                diff: {
                  changeStatus: '{current}/{total}',
                },
              },
            },
          },
        },
      },
      props: {
        path: '/game/scene/example.txt',
        kind: 'scene',
        localContent: 'local one\nsame one\nsame two\nsame three\nlocal two',
        externalContent: 'external one\nsame one\nsame two\nsame three\nexternal two',
        onApply,
      },
    })

    await expect.element(page.getByRole('status')).toHaveTextContent('1/2')
    await page.getByRole('button', { name: 'modals.externalDocumentChange.diff.keepRight' }).click()
    await expect.element(page.getByRole('status')).toHaveTextContent('2/2')
    await page.getByRole('button', { name: 'modals.externalDocumentChange.diff.applyResult' }).click()

    expect(onApply).toHaveBeenCalledWith('external one\nsame one\nsame two\nsame three\nexternal two')
  })

  it('提交右侧手动编辑后的内容', async () => {
    const onApply = vi.fn()
    let editorHandle: {
      getModifiedEditor: () => monaco.editor.IStandaloneCodeEditor | undefined
    } | undefined

    const TestHarness = defineComponent(() => () => h(ExternalDocumentDiffEditor, {
      ref: (instance) => {
        editorHandle = instance as unknown as typeof editorHandle
      },
      path: '/game/scene/example.txt',
      kind: 'scene',
      localContent: 'local',
      externalContent: 'external',
      onApply,
    }))

    renderInBrowser(TestHarness, {
      browser: {
        i18nMode: 'lite',
      },
    })

    await expect.element(page.getByRole('status')).toHaveTextContent(
      'modals.externalDocumentChange.diff.changeStatus',
    )
    const resultModel = editorHandle?.getModifiedEditor()?.getModel()
    expect(resultModel).toBeDefined()
    resultModel?.setValue('manually merged')

    await page.getByRole('button', { name: 'modals.externalDocumentChange.diff.applyResult' }).click()

    expect(onApply).toHaveBeenCalledWith('manually merged')
  })

  it('纯空白变化也会作为差异块展示', async () => {
    renderInBrowser(ExternalDocumentDiffEditor, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        path: '/game/scene/example.txt',
        kind: 'scene',
        localContent: 'line ',
        externalContent: 'line',
      },
    })

    await expect.element(page.getByRole('status')).toHaveTextContent(
      'modals.externalDocumentChange.diff.changeStatus',
    )
  })
})
