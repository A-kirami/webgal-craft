import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import { FLOWCHART_NODE_CONTEXT_KEY } from '~/features/editor/flowchart/flowchart-node-view'

import FlowchartNodeView from './FlowchartNodeView.vue'

import type { FlowchartNodeContext } from '~/features/editor/flowchart/flowchart-node-view'

const globalStubs = {
  Handle: defineComponent({
    name: 'StubHandle',
    setup() {
      return () => undefined
    },
  }),
  FilePicker: defineComponent({
    name: 'StubFilePicker',
    props: {
      modelValue: {
        type: String,
        default: '',
      },
      rootPath: {
        type: String,
        default: '',
      },
    },
    emits: ['update:modelValue'],
    setup(_, { emit, slots }) {
      return () => h('button', {
        'data-testid': 'stub-scene-picker',
        'type': 'button',
        'onClick': () => emit('update:modelValue', 'chapter/新场景.txt'),
      }, slots.trigger?.())
    },
  }),
}

function createContext(overrides: Partial<FlowchartNodeContext> = {}): FlowchartNodeContext {
  return {
    beginTitleEdit: vi.fn(),
    cancelTitleEdit: vi.fn(),
    commitTitle: vi.fn(),
    deleteNode: vi.fn(),
    isOnlySelectedNode: () => false,
    isSceneDropTarget: () => false,
    isTitleEditing: () => false,
    sceneRootPath: '/games/demo/game/scene',
    selectScene: vi.fn(),
    ...overrides,
  }
}

async function renderNode(options: {
  context: FlowchartNodeContext
  data?: { isRoot?: boolean, scene?: string, title?: string }
}) {
  return await renderInBrowser(FlowchartNodeView, {
    global: {
      stubs: globalStubs,
      provide: {
        [FLOWCHART_NODE_CONTEXT_KEY as symbol]: options.context,
      },
    },
    props: {
      connectable: true,
      data: {
        isRoot: options.data?.isRoot ?? false,
        scene: options.data?.scene,
        title: options.data?.title ?? '第一章',
      },
      dimensions: { height: 96, width: 224 },
      dragging: false,
      events: {},
      id: 'node-1',
      position: { x: 0, y: 0 },
      resizing: false,
      selected: false,
      type: 'flowchart',
      zIndex: 0,
    },
  })
}

describe('FlowchartNodeView', () => {
  it('根节点显示根节点标识', async () => {
    await renderNode({
      context: createContext(),
      data: { isRoot: true, title: '起点' },
    })

    await expect.element(page.getByText('edit.flowchart.node.rootBadge')).toBeVisible()
    expect(page.getByRole('button', { name: 'edit.flowchart.node.delete', exact: true }).elements()).toHaveLength(0)
  })

  it.each(['{Enter}', ' '])('标题可通过键盘 %s 开始编辑', async (key) => {
    const context = createContext()
    await renderNode({ context })

    await page.getByRole('button', { name: '第一章', exact: true }).click()
    await userEvent.keyboard(key)
    expect(context.beginTitleEdit).toHaveBeenCalledExactlyOnceWith('node-1')
  })

  it('清空标题后提交按取消处理，不写入空名称', async () => {
    const context = createContext({ isTitleEditing: () => true })

    await renderNode({ context })

    const input = page.getByRole('textbox', { name: 'edit.flowchart.node.titleInputLabel' })
    await input.fill(' '.repeat(3))
    await userEvent.keyboard('{Enter}')

    expect(context.commitTitle).not.toHaveBeenCalled()
    expect(context.cancelTitleEdit).toHaveBeenCalledOnce()
  })

  it('未绑定场景时显示提示，选择文件后交给会话绑定', async () => {
    const context = createContext()

    await renderNode({ context })

    await expect.element(page.getByText('edit.flowchart.node.unboundScene')).toBeVisible()

    await page.getByTestId('stub-scene-picker').click()
    expect(context.selectScene).toHaveBeenCalledWith('node-1', 'chapter/新场景.txt')
  })

  it('已绑定场景时显示场景文件名', async () => {
    await renderNode({
      context: createContext(),
      data: { scene: 'chapter/开场.txt', title: '开场' },
    })

    await expect.element(page.getByText('开场.txt')).toBeVisible()
    expect(page.getByText('edit.flowchart.node.unboundScene').elements()).toHaveLength(0)
  })
})
