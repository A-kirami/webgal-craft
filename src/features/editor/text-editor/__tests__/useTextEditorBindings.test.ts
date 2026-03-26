import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import { renderToString } from 'vue/server-renderer'

const {
  getSceneSelectionMock,
  useEditSettingsStoreMock,
  useCommandPanelStoreMock,
} = vi.hoisted(() => ({
  getSceneSelectionMock: vi.fn(),
  useEditSettingsStoreMock: vi.fn(),
  useCommandPanelStoreMock: vi.fn(),
}))

vi.mock('~/stores/editor', () => ({
  useEditorStore: () => ({
    getSceneSelection: getSceneSelectionMock,
  }),
}))

vi.mock('~/stores/edit-settings', () => ({
  useEditSettingsStore: useEditSettingsStoreMock,
}))

vi.mock('~/stores/command-panel', () => ({
  useCommandPanelStore: useCommandPanelStoreMock,
}))

import { useCommandPanelBridgeProvider, useSidebarPanelProvider } from '~/features/editor/shared/useEditorPanelBindings'
import { useTextEditorBindings } from '~/features/editor/text-editor/useTextEditorBindings'

import type { SidebarPanelBinding } from '~/features/editor/shared/useEditorPanelBindings'
import type { TextProjectionState } from '~/stores/editor'

interface Harness {
  readSidebarBinding: () => SidebarPanelBinding | undefined
}

const mountedHarnesses: Harness[] = []

function createTextState(textContent: string): TextProjectionState {
  return {
    path: '/game/scene/example.txt',
    isDirty: false,
    projection: 'text',
    kind: 'scene',
    textContent,
    textSource: 'projection',
    syncError: undefined,
  }
}

async function mountHarness(textContent: string): Promise<Harness> {
  const state = ref(createTextState(textContent))
  let readSidebarBinding = () => undefined as SidebarPanelBinding | undefined

  const BindingConsumer = defineComponent({
    setup() {
      useTextEditorBindings({
        editorRef: shallowRef(),
        getState: () => state.value,
        isCurrentTextProjectionActive: () => true,
        formPanel: {
          handleFormUpdate: vi.fn(() => false),
        },
        textEditorHistory: {
          captureBeforeContentChange: vi.fn(),
          handleRedo: vi.fn(),
          handleUndo: vi.fn(),
        } as never,
      })

      return () => h('div')
    },
  })

  const app = createSSRApp(defineComponent({
    setup() {
      const sidebarPanel = useSidebarPanelProvider()
      useCommandPanelBridgeProvider()

      readSidebarBinding = () => sidebarPanel.activeBinding.value
      return () => h(BindingConsumer)
    },
  }))

  await renderToString(app)

  const harness: Harness = {
    readSidebarBinding,
  }

  mountedHarnesses.push(harness)
  return harness
}

async function flushBindingUpdates() {
  await nextTick()
  await Promise.resolve()
}

describe('useTextEditorBindings 行为', () => {
  afterEach(() => {
    getSceneSelectionMock.mockReset()
    useEditSettingsStoreMock.mockReset()
    useCommandPanelStoreMock.mockReset()
    mountedHarnesses.length = 0
  })

  it('文本模式辅助面板直接从文本投影构建当前语句快照', async () => {
    getSceneSelectionMock.mockReturnValue({
      lastLineNumber: 2,
      selectedStatementId: 2,
    })
    useEditSettingsStoreMock.mockReturnValue({
      commandInsertPosition: 'cursor',
    })
    useCommandPanelStoreMock.mockReturnValue({
      getInsertText: vi.fn(),
    })

    const harness = await mountHarness('Alice:第一句;\n接续第二句;')
    await flushBindingUpdates()

    const binding = harness.readSidebarBinding()
    expect(binding?.getEntry()).toMatchObject({
      id: 2,
      rawText: '接续第二句;',
    })
    expect(binding?.getPreviousSpeaker?.()).toBe('Alice')
    expect(binding?.getUpdateTarget?.()).toEqual({
      kind: 'line',
      lineNumber: 2,
    })
  })
})
