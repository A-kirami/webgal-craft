import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { ref } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

import FlowchartEditor from './FlowchartEditor.vue'

import type { FlowchartWorkspace } from '~/features/editor/flowchart/useFlowchartWorkspace'

vi.mock('./FlowchartStage.vue', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    default: defineComponent({
      name: 'StubFlowchartStage',
      props: {
        workspace: {
          type: Object,
          required: true,
        },
      },
      setup() {
        return () => h('div', { 'data-testid': 'flowchart-stage-stub' }, 'flowchart canvas')
      },
    }),
  }
})

function createWorkspace(overrides: Partial<FlowchartWorkspace> = {}): FlowchartWorkspace {
  return {
    activeFlowchart: ref(undefined),
    activeFlowchartId: ref('main'),
    addNode: vi.fn(),
    addNodeFromScene: vi.fn(),
    bindScene: vi.fn(),
    canRedo: ref(false),
    canUndo: ref(false),
    connect: vi.fn(),
    createBranch: vi.fn(),
    deleteFlowchart: vi.fn(),
    deleteSelection: vi.fn(),
    dirty: ref(false),
    enableFlowchart: vi.fn(async () => undefined),
    errorMessage: ref(undefined),
    flowchartEnabled: ref(true),
    flowcharts: ref([]),
    flush: vi.fn(async () => undefined),
    isEnablingFlowchart: ref(false),
    moveNode: vi.fn(),
    redo: vi.fn(),
    reload: vi.fn(async () => undefined),
    renameFlowchart: vi.fn(),
    renameNode: vi.fn(),
    selectFlowchart: vi.fn(),
    status: ref('ready'),
    undo: vi.fn(),
    ...overrides,
  }
}

async function renderEditor(workspace: FlowchartWorkspace) {
  return await renderInBrowser(FlowchartEditor, {
    props: { workspace },
  })
}

describe('FlowchartEditor', () => {
  it('已就绪时渲染画布并隐藏其它状态', async () => {
    await renderEditor(createWorkspace())

    await expect.element(page.getByTestId('flowchart-stage-stub')).toBeVisible()
    expect(page.getByTestId('flowchart-disabled-overlay').elements()).toHaveLength(0)
    expect(page.getByTestId('flowchart-error-state').elements()).toHaveLength(0)
  })

  it('加载中时不显示未启用遮罩', async () => {
    await renderEditor(createWorkspace({
      flowchartEnabled: ref(false),
      status: ref('loading'),
    }))

    await expect.element(page.getByText('edit.flowchart.loading')).toBeVisible()
    expect(page.getByTestId('flowchart-disabled-overlay').elements()).toHaveLength(0)
  })

  it('游戏未启用流程图时展示遮罩，点击按钮直接写入配置', async () => {
    const enableFlowchart = vi.fn(async () => undefined)
    await renderEditor(createWorkspace({
      enableFlowchart,
      flowchartEnabled: ref(false),
      status: ref('idle'),
    }))

    await expect.element(page.getByTestId('flowchart-disabled-overlay')).toBeVisible()
    expect(page.getByTestId('flowchart-stage-stub').elements()).toHaveLength(0)

    await page.getByRole('button', { name: 'edit.flowchart.disabled.enable' }).click()
    expect(enableFlowchart).toHaveBeenCalledOnce()
  })

  it('加载失败时展示错误原因并支持重试', async () => {
    const reload = vi.fn(async () => undefined)
    await renderEditor(createWorkspace({
      errorMessage: ref('Unexpected token <'),
      reload,
      status: ref('error'),
    }))

    const errorState = await page.getByTestId('flowchart-error-state').element()
    expect(errorState.textContent).toContain('Unexpected token <')

    await page.getByRole('button', { name: 'edit.flowchart.retry' }).click()
    expect(reload).toHaveBeenCalledOnce()
  })
})
