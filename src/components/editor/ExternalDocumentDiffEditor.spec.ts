import * as monaco from 'monaco-editor'
import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import { LEGACY_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { LEGACY_WEBGAL_SCRIPT_LANGUAGE_ID } from '~/features/editor/text-editor/text-editor-language'

import ExternalDocumentDiffEditor from './ExternalDocumentDiffEditor.vue'

describe('ExternalDocumentDiffEditor', () => {
  it('旧运行时的场景差异编辑器使用不含 return 的语法高亮', async () => {
    let editorHandle: {
      getModifiedEditor: () => monaco.editor.IStandaloneCodeEditor | undefined
    } | undefined

    const TestHarness = defineComponent(() => () => h(ExternalDocumentDiffEditor, {
      ref: (instance) => {
        editorHandle = instance as unknown as typeof editorHandle
      },
      path: '/game/scene/example.txt',
      kind: 'scene',
      localContent: 'return;',
      externalContent: 'return;',
      runtimeCapabilities: LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    }))

    renderInBrowser(TestHarness, {
      browser: { i18nMode: 'lite' },
    })

    await expect.poll(() => editorHandle?.getModifiedEditor()?.getModel()?.getLanguageId())
      .toBe(LEGACY_WEBGAL_SCRIPT_LANGUAGE_ID)
  })

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

  it('采用当前差异块后继续审阅最近的剩余差异块', async () => {
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
        localContent: 'local one\nsame one\nsame two\nsame three\nlocal two\nsame four\nsame five\nsame six\nlocal three',
        externalContent: 'external one\nsame one\nsame two\nsame three\nexternal two\nsame four\nsame five\nsame six\nexternal three',
      },
    })

    await expect.element(page.getByRole('status')).toHaveTextContent('1/3')
    await page.getByRole('button', { name: 'modals.externalDocumentChange.diff.nextChange' }).click()
    await page.getByRole('button', { name: 'modals.externalDocumentChange.diff.nextChange' }).click()
    await expect.element(page.getByRole('status')).toHaveTextContent('3/3')

    await page.getByRole('button', { name: 'modals.externalDocumentChange.diff.useLeft' }).click()

    await expect.element(page.getByRole('status')).toHaveTextContent('2/2')
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
      localContent: 'local one\nsame one\nsame two\nsame three\nlocal two',
      externalContent: 'external one\nsame one\nsame two\nsame three\nexternal two',
      onApply,
    }))

    renderInBrowser(TestHarness, {
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
    })

    await expect.element(page.getByRole('status')).toHaveTextContent('1/2')
    await page.getByRole('button', { name: 'modals.externalDocumentChange.diff.nextChange' }).click()
    await expect.element(page.getByRole('status')).toHaveTextContent('2/2')

    const resultModel = editorHandle?.getModifiedEditor()?.getModel()
    expect(resultModel).toBeDefined()
    resultModel?.applyEdits([{
      range: new monaco.Range(5, 1, 5, resultModel.getLineMaxColumn(5)),
      text: 'manually merged',
    }])

    await expect.element(page.getByRole('status')).toHaveTextContent('2/2')

    await page.getByRole('button', { name: 'modals.externalDocumentChange.diff.applyResult' }).click()

    expect(onApply).toHaveBeenCalledWith(
      'external one\nsame one\nsame two\nsame three\nmanually merged',
    )
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
