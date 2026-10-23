import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h, reactive, ref } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import { useDragSession } from '~/composables/useDragSession'
import { useDroppableRegistry } from '~/composables/useDroppableRegistry'
import { AbsPath } from '~/domain/path'
import { writeFlowchartFile } from '~/features/editor/flowchart/flowchart-file'
import { useFlowchartWorkspace } from '~/features/editor/flowchart/useFlowchartWorkspace'
import { resetAllTourProgress } from '~/features/onboarding/tour-state'
import { TOUR_PERSISTENCE } from '~/features/onboarding/tour-version'

import FlowchartStage from './FlowchartStage.vue'
// @unocss-safelist h-full w-full
import 'virtual:uno.css'
import '~/styles/theme.css'

import type { DragPayload, DragPosition, FileSystemDragPayload } from '~/types/drag-drop'

const { useWorkspaceStoreMock, useModalStoreMock } = vi.hoisted(() => ({
  useWorkspaceStoreMock: Object.assign(vi.fn(), { $id: 'workspace' as const }),
  useModalStoreMock: Object.assign(vi.fn(), { $id: 'modal' as const }),
}))

vi.mock(import('~/stores/workspace'), () => ({ useWorkspaceStore: useWorkspaceStoreMock }))
vi.mock(import('~/stores/modal'), () => ({ useModalStore: useModalStoreMock }))

vi.mock(import('~/services/config-manager'), () => ({
  configManager: {
    getConfig: vi.fn(async () => ({ entries: [{ key: 'Enable_flowchart', value: 'true' }], unmanagedLineCount: 0 })),
    onConfigChanged: vi.fn(() => ({ off: vi.fn() })),
    setConfig: vi.fn(),
    updateConfigEntry: vi.fn(),
  },
}))

vi.mock(import('~/features/editor/flowchart/flowchart-file'), () => ({
  readFlowchartFile: vi.fn(async () => JSON.stringify({
    flowcharts: [
      {
        id: 'main',
        name: 'Main',
        nodes: [
          { id: 'root', position: { x: 0, y: 0 }, data: { label: 'Root', isRoot: true } },
          { id: 'next', position: { x: 1000, y: 500 }, data: { label: 'Next' } },
        ],
        edges: [{ id: 'root-next', source: 'root', target: 'next' }],
      },
      {
        id: 'branch',
        name: 'Branch',
        nodes: [{ id: 'branch-root', position: { x: 0, y: 0 }, data: { label: 'Branch root', isRoot: true } }],
        edges: [],
      },
    ],
  })),
  writeFlowchartFile: vi.fn(),
}))

const modalState = reactive({ hasOpenModal: false })

const SceneDockStub = defineComponent({
  setup(_, { expose }) {
    const expanded = ref(false)
    expose({ expand: () => {
      expanded.value = true
    } })
    return () => h('div', {
      'data-tour': 'flowchart-scenes',
      'data-expanded': expanded.value,
      'style': { width: '300px', height: expanded.value ? '240px' : '36px' },
    }, 'Scenes')
  },
})

async function renderStage({ width: initialWidth = 800, height: initialHeight = 600 } = {}) {
  const width = ref(initialWidth)
  const height = ref(initialHeight)
  const Harness = defineComponent({
    setup() {
      const workspace = useFlowchartWorkspace({ gamePath: AbsPath.from('/games/demo') })
      return () => h('div', { style: { width: `${width.value}px`, height: `${height.value}px` } }, [
        workspace.status.value === 'ready' ? h(FlowchartStage, { workspace }) : undefined,
      ])
    },
  })
  const rendered = await renderInBrowser(Harness, {
    global: {
      stubs: {
        FlowchartSceneDock: SceneDockStub,
        FilePicker: defineComponent({ setup: (_, { slots }) => () => h('div', slots.trigger?.()) }),
      },
    },
  })
  await expect.element(page.getByTestId('flowchart-canvas')).toBeVisible()
  await vi.waitFor(() => expect(rendered.container.querySelectorAll('.vue-flow__node')).toHaveLength(2))
  await vi.waitFor(() => {
    const canvas = rendered.container.querySelector<HTMLElement>('[data-testid="flowchart-canvas"]')!.getBoundingClientRect()
    const nodes = [...rendered.container.querySelectorAll<HTMLElement>('.vue-flow__node')].map(node => node.getBoundingClientRect())
    const left = Math.min(...nodes.map(node => node.left))
    const right = Math.max(...nodes.map(node => node.right))
    expect((left + right) / 2).toBeCloseTo(canvas.left + canvas.width / 2, 0)
  })
  return { ...rendered, width, height }
}

function readZoom(container: HTMLElement): number {
  const pane = container.querySelector<HTMLElement>('.vue-flow__transformationpane')!
  return new DOMMatrix(getComputedStyle(pane).transform).a
}

async function expectTourStep(name: string, anchor: string) {
  await expect.element(page.getByText(`tour.flowchart.${name}.title`, { exact: true })).toBeVisible()
  // 等待卡片淡入结束，按常规浏览节奏验证完整引导流程。
  await expect.poll(() => document.querySelector('.driver-popover')!.getAnimations()
    .every(animation => animation.playState === 'finished')).toBe(true)
  expect(document.querySelector<HTMLElement>('.driver-active-element')?.dataset.tour).toBe(anchor)
}

function expectRootVisible(container: HTMLElement) {
  const root = container.querySelector<HTMLElement>('[data-flowchart-node-id="root"]')!.getBoundingClientRect()
  const canvas = container.querySelector<HTMLElement>('[data-testid="flowchart-canvas"]')!.getBoundingClientRect()
  expect(root.left).toBeGreaterThanOrEqual(canvas.left)
  expect(root.right).toBeLessThanOrEqual(canvas.right)
  expect(root.top).toBeGreaterThan(canvas.top + 40)
  expect(root.bottom).toBeLessThanOrEqual(canvas.bottom)
}

async function renderDropStage() {
  useWorkspaceStoreMock.mockReturnValue({ currentGame: { path: '/games/demo' } })
  const rendered = await renderStage({
    width: Math.min(800, globalThis.innerWidth - 32),
    height: Math.min(600, globalThis.innerHeight - 32),
  })
  const fit = await page.getByRole('button', { name: 'edit.flowchart.canvas.fitView', exact: true }).element() as HTMLElement
  fit.click()
  await vi.waitFor(() => expect(readZoom(rendered.container)).toBeLessThan(1))
  return rendered
}

function elementCenter(element: Element): DragPosition {
  const bounds = element.getBoundingClientRect()
  return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
}

function moveDragTo(position: DragPosition, payload: DragPayload) {
  useDragSession().updatePosition(position)
  useDroppableRegistry().updateHover(position, payload)
}

const scenePayload: FileSystemDragPayload = {
  isDir: false,
  path: '/games/demo/game/scene/chapter/opening.txt',
  source: 'file-tree',
  type: 'file-system-item',
}

describe('FlowchartStage', () => {
  beforeEach(() => {
    useWorkspaceStoreMock.mockReturnValue({ currentGame: undefined })
    modalState.hasOpenModal = false
    useModalStoreMock.mockReturnValue(modalState)
    localStorage.setItem(TOUR_PERSISTENCE.flowchart.storageKey, TOUR_PERSISTENCE.flowchart.version)
    vi.mocked(writeFlowchartFile).mockClear()
  })

  afterEach(() => {
    useDroppableRegistry().clearHover()
    useDragSession().cancel()
  })

  it('引导刚出现就跳过也会记录完成并清除高亮', async () => {
    localStorage.removeItem(TOUR_PERSISTENCE.flowchart.storageKey)
    // 在首个弹窗渲染的微任务中点击，避免挂载等待耗尽动画窗口。
    const observer = new MutationObserver(() => {
      const skip = document.querySelector<HTMLButtonElement>('.driver-popover-close-btn[aria-label="tour.common.skip"]')
      if (skip) {
        observer.disconnect()
        skip.click()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    try {
      await renderStage()
      await expect.poll(() => localStorage.getItem(TOUR_PERSISTENCE.flowchart.storageKey)).toBe(TOUR_PERSISTENCE.flowchart.version)
      expect(document.querySelector('.driver-popover')).toBeNull()
      expect(document.querySelector('.driver-active-element')).toBeNull()
    } finally {
      observer.disconnect()
    }
  })

  it('首次进入按六步介绍流程图，节点保持可见，完成后恢复视图且不修改数据', async () => {
    localStorage.removeItem(TOUR_PERSISTENCE.flowchart.storageKey)
    const { container } = await renderStage()
    const pane = container.querySelector<HTMLElement>('.vue-flow__transformationpane')!
    const originalTransform = pane.style.transform
    const next = page.getByRole('button', { name: 'tour.common.next', exact: true })
    await expectTourStep('manager', 'flowchart-manager')
    await next.click()
    await expectTourStep('addNode', 'flowchart-add-node')
    await next.click()
    await expectTourStep('node', 'flowchart-node')
    expectRootVisible(container)
    await page.getByRole('button', { name: 'tour.common.prev', exact: true }).click()
    await expectTourStep('addNode', 'flowchart-add-node')
    await next.click()
    await expectTourStep('node', 'flowchart-node')
    await next.click()
    await expectTourStep('scenes', 'flowchart-scenes')
    expect(container.querySelector<HTMLElement>('[data-tour="flowchart-scenes"]')?.dataset.expanded).toBe('true')
    await next.click()
    await expectTourStep('connect', 'flowchart-source')
    expectRootVisible(container)
    await next.click()
    await expectTourStep('canvas', 'flowchart-toolbar')
    await page.getByRole('button', { name: 'tour.common.done', exact: true }).click()

    await expect.poll(() => document.querySelector('.driver-popover')).toBeNull()
    await expect.poll(() => pane.style.transform).toBe(originalTransform)
    await expect.poll(() => localStorage.getItem(TOUR_PERSISTENCE.flowchart.storageKey)).toBe(TOUR_PERSISTENCE.flowchart.version)
    expect(container.querySelectorAll('[data-flowchart-node-id]')).toHaveLength(2)
    expect(container.querySelectorAll('.vue-flow__edge')).toHaveLength(1)
    expect(writeFlowchartFile).not.toHaveBeenCalled()
  })

  it('跳过后不再自动显示，重置引导进度后可以重看', async () => {
    localStorage.removeItem(TOUR_PERSISTENCE.flowchart.storageKey)
    await renderStage()
    await expectTourStep('manager', 'flowchart-manager')
    await page.getByRole('button', { name: 'tour.common.skip', exact: true }).click()
    await expect.poll(() => document.querySelector('.driver-popover')).toBeNull()
    await expect.poll(() => localStorage.getItem(TOUR_PERSISTENCE.flowchart.storageKey)).toBe(TOUR_PERSISTENCE.flowchart.version)

    modalState.hasOpenModal = true
    await nextTick()
    modalState.hasOpenModal = false
    await nextTick()
    expect(document.querySelector('.driver-popover')).toBeNull()

    resetAllTourProgress()
    await expectTourStep('manager', 'flowchart-manager')
    await page.getByRole('button', { name: 'tour.common.skip', exact: true }).click()
  })

  it('弹窗阻止引导启动，中断后不记录完成，关闭弹窗可重新触发', async () => {
    localStorage.removeItem(TOUR_PERSISTENCE.flowchart.storageKey)
    modalState.hasOpenModal = true
    await renderStage()
    expect(document.querySelector('.driver-popover')).toBeNull()
    modalState.hasOpenModal = false
    await expectTourStep('manager', 'flowchart-manager')
    modalState.hasOpenModal = true
    await expect.poll(() => document.querySelector('.driver-popover')).toBeNull()
    expect(localStorage.getItem(TOUR_PERSISTENCE.flowchart.storageKey)).not.toBe(TOUR_PERSISTENCE.flowchart.version)
    modalState.hasOpenModal = false
    await expectTourStep('manager', 'flowchart-manager')
    await page.getByRole('button', { name: 'tour.common.skip', exact: true }).click()
  })

  it('引导期间屏蔽删除快捷键，跳过节点介绍后恢复原缩放和平移', async () => {
    const { container } = await renderDropStage()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    const pane = container.querySelector<HTMLElement>('.vue-flow__transformationpane')!
    const originalTransform = pane.style.transform
    resetAllTourProgress()
    await expectTourStep('manager', 'flowchart-manager')
    await userEvent.keyboard('{Delete}')
    expect(container.querySelectorAll('[data-flowchart-node-id]')).toHaveLength(2)
    const next = page.getByRole('button', { name: 'tour.common.next', exact: true })
    await next.click()
    await expectTourStep('addNode', 'flowchart-add-node')
    await next.click()
    await expectTourStep('node', 'flowchart-node')
    expect(readZoom(container)).toBe(1)
    await page.getByRole('button', { name: 'tour.common.skip', exact: true }).click()
    await expect.poll(() => pane.style.transform).toBe(originalTransform)
    expect(container.querySelectorAll('.vue-flow__node.selected')).toHaveLength(1)
    await userEvent.keyboard('{Delete}')
    await expect.poll(() => container.querySelectorAll('[data-flowchart-node-id]').length).toBe(1)
  })

  it('离开流程页时移除引导，重新进入仍可触发未完成的引导', async () => {
    localStorage.removeItem(TOUR_PERSISTENCE.flowchart.storageKey)
    const rendered = await renderStage()
    await expectTourStep('manager', 'flowchart-manager')
    await rendered.unmount()
    expect(document.querySelector('.driver-popover')).toBeNull()
    expect(localStorage.getItem(TOUR_PERSISTENCE.flowchart.storageKey)).not.toBe(TOUR_PERSISTENCE.flowchart.version)
    await renderStage()
    await expectTourStep('manager', 'flowchart-manager')
    await page.getByRole('button', { name: 'tour.common.skip', exact: true }).click()
  })

  it('操作组位于卡片外侧右上方，跨过间隙仍显示，单选后持续显示', async () => {
    const { container } = await renderDropStage()
    const card = container.querySelector<HTMLElement>('[data-flowchart-node-id="next"]')!
    const actions = card.querySelector<HTMLElement>('[data-flowchart-node-actions]')!
    const outside = page.getByRole('button', { name: 'edit.flowchart.canvas.zoomIn', exact: true })
    await outside.hover()
    expect(getComputedStyle(actions).opacity).toBe('0')

    const title = page.getByRole('button', { name: 'Next', exact: true })
    await title.hover()
    expect(getComputedStyle(actions).opacity).toBe('1')
    const cardBounds = card.getBoundingClientRect()
    const bounds = actions.getBoundingClientRect()
    expect(bounds.bottom).toBeLessThanOrEqual(cardBounds.top + 1)
    expect(bounds.right).toBeCloseTo(cardBounds.right, 0)
    expect(bounds.left).toBeGreaterThan(cardBounds.left + cardBounds.width / 2)

    await page.elementLocator(actions).hover({ position: { x: bounds.width / 2, y: bounds.height - 1 } })
    expect(getComputedStyle(actions).opacity).toBe('1')
    const rename = page.elementLocator(actions).getByRole('button', { name: 'edit.flowchart.node.rename', exact: true })
    await rename.hover()
    expect(getComputedStyle(actions).opacity).toBe('1')

    await title.click()
    await outside.hover()
    expect(getComputedStyle(actions).opacity).toBe('1')
    expect(card.getBoundingClientRect().width).toBe(cardBounds.width)
    expect(card.getBoundingClientRect().height).toBe(cardBounds.height)

    await rename.click()
    const input = page.getByRole('textbox', { name: 'edit.flowchart.node.titleInputLabel' })
    await expect.element(input).toHaveValue('Next')
    await input.fill('重命名后的节点')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByRole('button', { name: '重命名后的节点', exact: true })).toBeVisible()
  })

  it('多选时只显示悬停节点的操作组', async () => {
    const { container } = await renderDropStage()
    const root = container.querySelector<HTMLElement>('[data-flowchart-node-id="root"]')!
    const next = container.querySelector<HTMLElement>('[data-flowchart-node-id="next"]')!
    await page.getByRole('button', { name: 'Root', exact: true }).click()
    await userEvent.keyboard('{Control>}')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await userEvent.keyboard('{/Control}')
    expect(container.querySelectorAll('.vue-flow__node.selected')).toHaveLength(2)

    await page.getByRole('button', { name: 'edit.flowchart.canvas.zoomIn', exact: true }).hover()
    expect(getComputedStyle(root.querySelector<HTMLElement>('[data-flowchart-node-actions]')!).opacity).toBe('0')
    expect(getComputedStyle(next.querySelector<HTMLElement>('[data-flowchart-node-actions]')!).opacity).toBe('0')
    await page.getByRole('button', { name: 'Next', exact: true }).hover()
    expect(getComputedStyle(root.querySelector<HTMLElement>('[data-flowchart-node-actions]')!).opacity).toBe('0')
    expect(getComputedStyle(next.querySelector<HTMLElement>('[data-flowchart-node-actions]')!).opacity).toBe('1')
  })

  it('悬停删除只移除目标节点及关联连线，支持撤销恢复', async () => {
    const { container } = await renderDropStage()
    await page.getByRole('button', { name: 'Root', exact: true }).click()
    const card = container.querySelector<HTMLElement>('[data-flowchart-node-id="next"]')!
    const originalTransform = card.closest<HTMLElement>('.vue-flow__node')!.style.transform
    await page.getByRole('button', { name: 'Next', exact: true }).hover()
    await page.elementLocator(card).getByRole('button', { name: 'edit.flowchart.node.delete', exact: true }).click()
    await vi.waitFor(() => expect(container.querySelectorAll('[data-flowchart-node-id]')).toHaveLength(1))
    expect(container.querySelector('[data-flowchart-node-id="root"]')).not.toBeNull()
    expect(container.querySelectorAll('.vue-flow__edge')).toHaveLength(0)
    await page.getByRole('button', { name: 'edit.flowchart.canvas.undo', exact: true }).click()
    await vi.waitFor(() => expect(container.querySelectorAll('[data-flowchart-node-id]')).toHaveLength(2))
    expect(container.querySelectorAll('.vue-flow__edge')).toHaveLength(1)
    expect(container.querySelector<HTMLElement>('[data-flowchart-node-id="next"]')!.closest<HTMLElement>('.vue-flow__node')!.style.transform).toBe(originalTransform)
  })

  it('键盘聚焦操作按钮时显示工具组，Enter 可重命名根节点', async () => {
    const { container } = await renderDropStage()
    const root = container.querySelector<HTMLElement>('[data-flowchart-node-id="root"]')!
    const actions = root.querySelector<HTMLElement>('[data-flowchart-node-actions]')!
    await page.getByRole('button', { name: 'edit.flowchart.canvas.zoomIn', exact: true }).hover()
    await userEvent.keyboard('{Tab}')
    const rename = root.querySelector<HTMLButtonElement>('[data-flowchart-node-actions] button')!
    rename.focus()
    expect(getComputedStyle(actions).opacity).toBe('1')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByRole('textbox', { name: 'edit.flowchart.node.titleInputLabel' })).toHaveValue('Root')
  })

  it('标题栏区分节点类型，标题单击选中、拖动移动、双击编辑', async () => {
    const { container } = await renderDropStage()
    const rootHeader = container.querySelector<HTMLElement>('[data-flowchart-node-id="root"] [data-flowchart-node-header]')!
    const header = container.querySelector<HTMLElement>('[data-flowchart-node-id="next"] [data-flowchart-node-header]')!
    expect(getComputedStyle(header).minHeight).toBe('32px')
    expect(getComputedStyle(header).cursor).toBe('grab')
    expect(getComputedStyle(rootHeader).backgroundColor).not.toBe(getComputedStyle(header).backgroundColor)
    const badge = rootHeader.querySelector<HTMLElement>('span')!
    expect(getComputedStyle(badge).backgroundColor).not.toBe(getComputedStyle(rootHeader).backgroundColor)
    expect(getComputedStyle(badge).color).not.toBe(getComputedStyle(badge).backgroundColor)

    const title = page.getByRole('button', { name: 'Next', exact: true })
    await title.click()
    const node = header.closest<HTMLElement>('.vue-flow__node')!
    await expect.poll(() => node.classList.contains('selected')).toBe(true)
    expect(page.getByRole('textbox').elements()).toHaveLength(0)

    const originalTransform = node.style.transform
    const button = await title.element()
    const position = elementCenter(button)
    button.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, button: 0, buttons: 1, clientX: position.x, clientY: position.y, view: document.defaultView,
    }))
    globalThis.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true, buttons: 1, clientX: position.x + 10, clientY: position.y + 8, view: document.defaultView,
    }))
    globalThis.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true, buttons: 1, clientX: position.x + 30, clientY: position.y + 20, view: document.defaultView,
    }))
    globalThis.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, button: 0, clientX: position.x + 30, clientY: position.y + 20, view: document.defaultView,
    }))
    await expect.poll(() => node.style.transform).not.toBe(originalTransform)
    expect(page.getByRole('textbox').elements()).toHaveLength(0)

    await page.getByRole('button', { name: 'edit.flowchart.canvas.undo', exact: true }).click()
    await expect.poll(() => node.style.transform).toBe(originalTransform)

    const zoom = readZoom(container)
    await title.dblClick()
    await expect.element(page.getByRole('textbox', { name: 'edit.flowchart.node.titleInputLabel' })).toBeVisible()
    expect(readZoom(container)).toBe(zoom)
  })

  it('连续点击添加节点时卡片互不重叠，保留编辑焦点和撤销重做', async () => {
    const { container } = await renderStage()
    const originalNodes = [...container.querySelectorAll<HTMLElement>('.vue-flow__node')]
      .map(element => ({ element, transform: element.style.transform }))
    const add = await page.getByTestId('flowchart-add-node').element() as HTMLElement
    for (let index = 0; index < 5; index += 1) {
      add.click()
    }

    await vi.waitFor(() => expect(container.querySelectorAll('[data-flowchart-node-id]')).toHaveLength(7))
    await nextTick()
    const cards = [...container.querySelectorAll<HTMLElement>('[data-flowchart-node-id]')]
      .map(element => element.getBoundingClientRect())
    for (let index = 0; index < cards.length; index += 1) {
      const card = cards[index]!
      expect(card.width).toBeGreaterThan(0)
      for (const other of cards.slice(index + 1)) {
        expect(card.right <= other.left || other.right <= card.left
          || card.bottom <= other.top || other.bottom <= card.top).toBe(true)
      }
    }
    for (const { element, transform } of originalNodes) {
      expect(element.style.transform).toBe(transform)
    }
    const textbox = page.getByRole('textbox', { name: 'edit.flowchart.node.titleInputLabel' })
    await expect.element(textbox).toBeInTheDocument()
    const input = await textbox.element()
    await expect.poll(() => document.activeElement === input).toBe(true)

    const undo = await page.getByRole('button', { name: 'edit.flowchart.canvas.undo', exact: true }).element() as HTMLElement
    undo.click()
    await vi.waitFor(() => expect(container.querySelectorAll('[data-flowchart-node-id]')).toHaveLength(6))
    const redo = await page.getByRole('button', { name: 'edit.flowchart.canvas.redo', exact: true }).element() as HTMLElement
    redo.click()
    await vi.waitFor(() => expect(container.querySelectorAll('[data-flowchart-node-id]')).toHaveLength(7))
  })

  it('场景拖到节点旁的空白处新建时也避开已有卡片', async () => {
    const { container } = await renderDropStage()
    const root = container.querySelector<HTMLElement>('[data-flowchart-node-id="root"]')!
    const rootBounds = root.getBoundingClientRect()
    const position = { x: rootBounds.right + 5, y: rootBounds.top + rootBounds.height / 2 }
    useDragSession().start('transfer', scenePayload, position)
    moveDragTo(position, scenePayload)
    await useDroppableRegistry().drop(scenePayload, position)
    useDragSession().end()

    await vi.waitFor(() => expect(container.querySelectorAll('[data-flowchart-node-id]')).toHaveLength(3))
    const created = container.querySelector<HTMLElement>('[data-flowchart-node-id="node-1"]')!
    await vi.waitFor(() => {
      const bounds = created.getBoundingClientRect()
      expect(bounds.width).toBeGreaterThan(0)
      const existing = root.getBoundingClientRect()
      expect(bounds.right <= existing.left || existing.right <= bounds.left
        || bounds.bottom <= existing.top || existing.bottom <= bounds.top).toBe(true)
    })
    expect(created.textContent).toContain('opening.txt')
    expect(root.textContent).not.toContain('opening.txt')
  })

  it('场景拖入时只高亮当前节点，移出及绑定后恢复卡片样式', async () => {
    const { container } = await renderDropStage()
    const root = container.querySelector<HTMLElement>('[data-flowchart-node-id="root"]')!
    const next = container.querySelector<HTMLElement>('[data-flowchart-node-id="next"]')!
    const background = getComputedStyle(root).backgroundColor
    const rootPosition = elementCenter(root)
    useDragSession().start('transfer', scenePayload, rootPosition)
    moveDragTo(rootPosition, scenePayload)
    await expect.poll(() => getComputedStyle(root).backgroundColor).not.toBe(background)
    expect(getComputedStyle(next).backgroundColor).toBe(background)

    moveDragTo(elementCenter(next), scenePayload)
    await expect.poll(() => getComputedStyle(root).backgroundColor).toBe(background)
    await expect.poll(() => getComputedStyle(next).backgroundColor).not.toBe(background)

    const canvas = container.querySelector<HTMLElement>('[data-testid="flowchart-canvas"]')!.getBoundingClientRect()
    moveDragTo({ x: canvas.left + canvas.width / 2, y: canvas.bottom - 30 }, scenePayload)
    await expect.poll(() => getComputedStyle(next).backgroundColor).toBe(background)

    moveDragTo(rootPosition, scenePayload)
    await expect.poll(() => getComputedStyle(root).backgroundColor).not.toBe(background)
    await useDroppableRegistry().drop(scenePayload, rootPosition)
    useDragSession().end()
    await expect.poll(() => root.textContent).toContain('opening.txt')
    await expect.poll(() => getComputedStyle(root).backgroundColor).toBe(background)
    expect(container.querySelectorAll('[data-flowchart-node-id]')).toHaveLength(2)
  })

  it('取消拖拽后移除节点高亮', async () => {
    const { container } = await renderDropStage()
    const root = container.querySelector<HTMLElement>('[data-flowchart-node-id="root"]')!
    const background = getComputedStyle(root).backgroundColor
    const position = elementCenter(root)
    useDragSession().start('transfer', scenePayload, position)
    moveDragTo(position, scenePayload)
    await expect.poll(() => getComputedStyle(root).backgroundColor).not.toBe(background)

    useDroppableRegistry().clearHover(scenePayload)
    useDragSession().cancel()
    await expect.poll(() => getComputedStyle(root).backgroundColor).toBe(background)
  })

  it.each([
    { label: '目录', payload: { ...scenePayload, isDir: true } },
    { label: '非场景文件', payload: { ...scenePayload, path: '/games/demo/game/scene/image.png' } },
    { label: '场景目录外的文件', payload: { ...scenePayload, path: '/games/demo/game/background/opening.txt' } },
    { label: '多选文件', payload: { ...scenePayload, items: [
      { isDir: false, path: scenePayload.path },
      { isDir: false, path: '/games/demo/game/scene/another.txt' },
    ] } },
    { label: '其他类型的拖拽', payload: { source: 'editor-tabs', type: 'editor-tab', path: scenePayload.path } },
  ] satisfies { label: string, payload: DragPayload }[])('拖入$label时不高亮节点', async ({ payload }) => {
    const { container } = await renderDropStage()
    const root = container.querySelector<HTMLElement>('[data-flowchart-node-id="root"]')!
    const background = getComputedStyle(root).backgroundColor
    const position = elementCenter(root)
    useDragSession().start('transfer', payload, position)
    moveDragTo(position, payload)
    await nextTick()
    expect(getComputedStyle(root).backgroundColor).toBe(background)
    expect(root.classList.contains('ring-2')).toBe(false)
  })

  it('初始比例固定为 100%，调整画布大小不改变默认或手动缩放比例', async () => {
    const { container, width, height } = await renderStage()
    await vi.waitFor(() => expect(readZoom(container)).toBe(1))

    width.value = 480
    height.value = 320
    const canvas = await page.getByTestId('flowchart-canvas').element()
    await vi.waitFor(() => expect(canvas.getBoundingClientRect().width).toBe(480))
    expect(readZoom(container)).toBe(1)

    const zoomIn = await page.getByRole('button', { name: 'edit.flowchart.canvas.zoomIn', exact: true }).element() as HTMLElement
    zoomIn.click()
    await vi.waitFor(() => expect(readZoom(container)).toBeCloseTo(1.2))
    width.value = 900
    height.value = 650
    await vi.waitFor(() => expect(canvas.getBoundingClientRect().width).toBe(900))
    expect(readZoom(container)).toBeCloseTo(1.2)
  })

  it('手动适配仍可缩放，切换流程图恢复固定比例', async () => {
    const { container } = await renderStage()
    const fit = await page.getByRole('button', { name: 'edit.flowchart.canvas.fitView', exact: true }).element() as HTMLElement
    fit.click()
    await vi.waitFor(() => expect(readZoom(container)).toBeLessThan(1))

    await page.getByTestId('flowchart-manager-trigger').click()
    const selectBranch = await page.getByTestId('flowchart-select-branch').element() as HTMLElement
    selectBranch.click()
    await vi.waitFor(() => expect(container.querySelectorAll('.vue-flow__node')).toHaveLength(1))
    await vi.waitFor(() => expect(readZoom(container)).toBe(1))
    await vi.waitFor(() => {
      const canvas = container.querySelector<HTMLElement>('[data-testid="flowchart-canvas"]')!.getBoundingClientRect()
      const root = container.querySelector<HTMLElement>('.vue-flow__node')!.getBoundingClientRect()
      expect(root.left + root.width / 2).toBeCloseTo(canvas.left + canvas.width / 2, 0)
      expect(root.top + root.height / 2).toBeCloseTo(canvas.top + canvas.height / 2, 0)
    })
  })
})
