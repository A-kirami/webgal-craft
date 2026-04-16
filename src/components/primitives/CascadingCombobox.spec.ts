import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import { buildCascadingComboboxData } from '~/lib/cascading-combobox'

import CascadingCombobox from './CascadingCombobox.vue'

interface FloatingRect {
  height: number
  width: number
  x: number
  y: number
}

interface ActiveAlignmentMetrics {
  activeHeight: number
  centerOffset: number
  scrollTop: number
}

const groupedData = buildCascadingComboboxData([
  { label: 'anon/cry01', value: 'anon/cry01' },
  { label: 'anon/cry02', value: 'anon/cry02' },
  { label: 'sakiko/maskon/kime01', value: 'sakiko/maskon/kime01' },
  { label: 'sakiko/default', value: 'sakiko/default' },
], {
  grouping: { mode: 'path' },
  resolvedDelimiter: '/',
})

const flatData = buildCascadingComboboxData([
  { label: 'Idle', value: 'idle' },
  { label: 'Joy', value: 'joy' },
  { label: 'Sad', value: 'sad' },
])

const tallGroupedData = buildCascadingComboboxData([
  ...Array.from({ length: 12 }, (_, index) => ({
    label: `root-${String(index + 1).padStart(2, '0')}/default`,
    value: `root-${String(index + 1).padStart(2, '0')}/default`,
  })),
  ...Array.from({ length: 48 }, (_, index) => ({
    label: `target/item-${String(index + 1).padStart(2, '0')}`,
    value: `target/item-${String(index + 1).padStart(2, '0')}`,
  })),
  ...Array.from({ length: 12 }, (_, index) => ({
    label: `tail-${String(index + 1).padStart(2, '0')}/default`,
    value: `tail-${String(index + 1).padStart(2, '0')}/default`,
  })),
], {
  grouping: { mode: 'path' },
  resolvedDelimiter: '/',
})

const nestedGroupedData = buildCascadingComboboxData([
  ...Array.from({ length: 8 }, (_, groupIndex) =>
    Array.from({ length: 6 }, (_, itemIndex) => ({
      label: `other-${String(groupIndex + 1).padStart(2, '0')}/item-${String(itemIndex + 1).padStart(2, '0')}`,
      value: `other-${String(groupIndex + 1).padStart(2, '0')}/item-${String(itemIndex + 1).padStart(2, '0')}`,
    })),
  ).flat(),
  ...Array.from({ length: 64 }, (_, groupIndex) =>
    Array.from({ length: 12 }, (_, itemIndex) => ({
      label: `target/group-${String(groupIndex + 1).padStart(2, '0')}/item-${String(itemIndex + 1).padStart(2, '0')}`,
      value: `target/group-${String(groupIndex + 1).padStart(2, '0')}/item-${String(itemIndex + 1).padStart(2, '0')}`,
    })),
  ).flat(),
], {
  grouping: { mode: 'path' },
  resolvedDelimiter: '/',
})

const GroupedHarness = defineComponent({
  components: { CascadingCombobox },
  props: {
    initialValue: {
      type: String,
      default: '',
    },
  },
  setup(props) {
    const modelValue = ref(props.initialValue)

    return {
      groupedData,
      modelValue,
    }
  },
  template: `
    <CascadingCombobox
      v-model="modelValue"
      data-testid="grouped-trigger"
      :browse-nodes="groupedData.browseNodes"
      :search-documents="groupedData.searchDocuments"
      placeholder="Select motion"
      search-placeholder="Search motion"
    />
  `,
})

const NearEdgeHarness = defineComponent({
  components: { CascadingCombobox },
  setup() {
    const modelValue = ref('sakiko/maskon/kime01')

    return {
      groupedData,
      modelValue,
    }
  },
  template: `
    <div style="position: fixed; top: 24px; right: 8px;">
      <CascadingCombobox
        v-model="modelValue"
        data-testid="edge-trigger"
        :browse-nodes="groupedData.browseNodes"
        :search-documents="groupedData.searchDocuments"
        placeholder="Select motion"
        search-placeholder="Search motion"
      />
    </div>
  `,
})

const FlatHarness = defineComponent({
  components: { CascadingCombobox },
  props: {
    initialValue: {
      type: String,
      default: '',
    },
  },
  setup(props) {
    const modelValue = ref(props.initialValue)

    return {
      flatData,
      modelValue,
    }
  },
  template: `
    <CascadingCombobox
      v-model="modelValue"
      data-testid="flat-trigger"
      :browse-nodes="flatData.browseNodes"
      :search-documents="flatData.searchDocuments"
      placeholder="Select mood"
      search-placeholder="Search mood"
    />
  `,
})

const TallGroupedHarness = defineComponent({
  components: { CascadingCombobox },
  setup() {
    const modelValue = ref('target/item-24')

    return {
      modelValue,
      tallGroupedData,
    }
  },
  template: `
    <CascadingCombobox
      v-model="modelValue"
      data-testid="tall-trigger"
      :browse-nodes="tallGroupedData.browseNodes"
      :search-documents="tallGroupedData.searchDocuments"
      placeholder="Select motion"
      search-placeholder="Search motion"
    />
  `,
})

const NestedGroupedHarness = defineComponent({
  components: { CascadingCombobox },
  setup() {
    const modelValue = ref('target/group-48/item-06')

    return {
      modelValue,
      nestedGroupedData,
    }
  },
  template: `
    <CascadingCombobox
      v-model="modelValue"
      data-testid="nested-trigger"
      :browse-nodes="nestedGroupedData.browseNodes"
      :search-documents="nestedGroupedData.searchDocuments"
      placeholder="Select motion"
      search-placeholder="Search motion"
    />
  `,
})

interface CascadingComboboxTestHooks {
  __shrinkCascadingSearchDocuments?: () => void
}

const DynamicSearchDocumentsHarness = defineComponent({
  components: { CascadingCombobox },
  setup() {
    const modelValue = ref('sakiko/default')
    const searchDocuments = ref([...groupedData.searchDocuments])
    const testHooks = globalThis as typeof globalThis & CascadingComboboxTestHooks

    function shrinkSearchDocuments() {
      searchDocuments.value = groupedData.searchDocuments.filter(document => document.value === 'anon/cry01')
    }

    onMounted(() => {
      testHooks.__shrinkCascadingSearchDocuments = shrinkSearchDocuments
    })

    onBeforeUnmount(() => {
      delete testHooks.__shrinkCascadingSearchDocuments
    })

    return {
      groupedData,
      modelValue,
      searchDocuments,
    }
  },
  template: `
    <CascadingCombobox
      v-model="modelValue"
      data-testid="dynamic-trigger"
      :browse-nodes="groupedData.browseNodes"
      :search-documents="searchDocuments"
      placeholder="Select motion"
      search-placeholder="Search motion"
    />
  `,
})

function getFloatingRects(): FloatingRect[] {
  return [...document.querySelectorAll<HTMLElement>('[data-reka-popper-content-wrapper]')].map((element) => {
    const rect = element.getBoundingClientRect()

    return {
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    }
  })
}

function getSubpanelRects(): FloatingRect[] {
  return [...document.querySelectorAll<HTMLElement>('[data-cascading-subpanel]')].map((element) => {
    const rect = element.getBoundingClientRect()

    return {
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    }
  })
}

function getElementRect(selector: string): FloatingRect | undefined {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) {
    return
  }

  const rect = element.getBoundingClientRect()

  return {
    height: rect.height,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  }
}

function findRootGroupRow(label: string): HTMLButtonElement | undefined {
  const rootPanel = document.querySelector<HTMLElement>('[data-cascading-root-panel]')
  return [...(rootPanel?.querySelectorAll<HTMLButtonElement>('[data-node-id]') ?? [])]
    .find(element => element.textContent?.includes(label))
}

function getLayerActiveBrowseText(layerDepth: number): string | undefined {
  return document
    .querySelector<HTMLElement>(`[data-layer-depth="${layerDepth}"] [data-active-browse="true"]`)
    ?.textContent
    ?.trim()
}

function getLayerSelectedBrowseText(layerDepth: number): string | undefined {
  return document
    .querySelector<HTMLElement>(`[data-layer-depth="${layerDepth}"] [data-selected-browse-item="true"]`)
    ?.textContent
    ?.trim()
}

function findLayerGroupRow(layerDepth: number, label: string): HTMLButtonElement | undefined {
  const layerElement = document.querySelector<HTMLElement>(`[data-layer-depth="${layerDepth}"]`)
  return [...(layerElement?.querySelectorAll<HTMLButtonElement>('[data-node-id]') ?? [])]
    .find(element => element.textContent?.includes(label))
}

function findLayerRow(layerDepth: number, label: string): HTMLButtonElement | undefined {
  const layerElement = document.querySelector<HTMLElement>(`[data-layer-depth="${layerDepth}"]`)
  return [...(layerElement?.querySelectorAll<HTMLButtonElement>('[data-node-id]') ?? [])]
    .find(element => element.textContent?.includes(label))
}

function getLayerScrollViewport(layerDepth: number): HTMLElement | undefined {
  const layerElement = document.querySelector<HTMLElement>(`[data-layer-depth="${layerDepth}"]`)
  if (!layerElement) {
    return
  }

  if (layerDepth === 0) {
    return layerElement.querySelector<HTMLElement>('[data-cascading-root-scroll-viewport]') ?? undefined
  }

  return layerElement
    .closest<HTMLElement>('[data-cascading-subpanel]')
    ?.querySelector<HTMLElement>('[data-cascading-subpanel-scroll-viewport]') ?? undefined
}

function getLayerViewportScrollTop(layerDepth: number): number | undefined {
  return getLayerScrollViewport(layerDepth)?.scrollTop
}

function getLayerViewportMetrics(layerDepth: number) {
  const viewport = getLayerScrollViewport(layerDepth)
  if (!viewport) {
    return
  }

  return {
    clientHeight: viewport.clientHeight,
    scrollHeight: viewport.scrollHeight,
  }
}

function getActiveAlignmentMetrics(
  panelSelector: string,
  viewportSelector: string,
): ActiveAlignmentMetrics | undefined {
  const panelElement = document.querySelector<HTMLElement>(panelSelector)
  const activeElement = panelElement?.querySelector<HTMLElement>('[data-active-browse="true"]')
  const scrollContainer = document.querySelector<HTMLElement>(viewportSelector)
  if (!panelElement || !activeElement || !scrollContainer) {
    return
  }

  const activeRect = activeElement.getBoundingClientRect()
  const containerRect = scrollContainer.getBoundingClientRect()
  const activeCenter = activeRect.top + activeRect.height / 2
  const containerCenter = containerRect.top + containerRect.height / 2

  return {
    activeHeight: activeRect.height,
    centerOffset: Math.abs(activeCenter - containerCenter),
    scrollTop: scrollContainer.scrollTop,
  }
}

function getSearchInputElement(): HTMLInputElement | undefined {
  return document.querySelector<HTMLInputElement>('input[role="searchbox"]') ?? undefined
}

function getActiveSearchOptionElement(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>('[role="option"][data-active-search="true"]') ?? undefined
}

function getSearchListboxElement(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>('[role="listbox"]') ?? undefined
}

function findSearchOptionElement(label: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')]
    .find(element => element.textContent?.includes(label))
}

describe('CascadingCombobox', () => {
  it('首次打开已选嵌套值时，根层与级联子层作为独立浮层渲染，并保持向右级联展开', async () => {
    renderInBrowser(GroupedHarness, {
      props: {
        initialValue: 'sakiko/maskon/kime01',
      },
    })

    await page.getByTestId('grouped-trigger').click()
    await expect.element(page.getByText('maskon', { exact: true })).toBeInTheDocument()
    await expect.element(page.getByText('kime01', { exact: true })).toBeInTheDocument()

    const rects = getFloatingRects()
    const rootRect = getElementRect('[data-cascading-root-panel]')
    const firstLayerRect = getElementRect('[data-layer-depth="1"]')
    const secondLayerRect = getElementRect('[data-layer-depth="2"]')

    expect(rects).toHaveLength(3)
    expect(rootRect).toBeDefined()
    expect(firstLayerRect).toBeDefined()
    expect(secondLayerRect).toBeDefined()
    expect(firstLayerRect!.x).toBeGreaterThan(rootRect!.x)
    expect(secondLayerRect!.x).toBeGreaterThan(firstLayerRect!.x)
  })

  it('搜索态会挂起 submenu，并在清空搜索后恢复之前的 browse path', async () => {
    renderInBrowser(GroupedHarness, {
      props: {
        initialValue: 'sakiko/maskon/kime01',
      },
    })

    await page.getByTestId('grouped-trigger').click()
    await expect.element(page.getByText('kime01', { exact: true })).toBeInTheDocument()
    expect(getSubpanelRects()).toHaveLength(2)

    await page.getByPlaceholder('Search motion').fill('maskon')
    await expect.element(page.getByText('kime01', { exact: true })).not.toBeInTheDocument()
    expect(getSubpanelRects()).toHaveLength(0)

    await page.getByPlaceholder('Search motion').fill('')
    await expect.element(page.getByText('kime01', { exact: true })).toBeInTheDocument()
    expect(getSubpanelRects()).toHaveLength(2)
  })

  it('靠近右侧视口边界时，submenu 会翻转到左侧', async () => {
    renderInBrowser(NearEdgeHarness)

    await page.getByTestId('edge-trigger').click()
    await expect.element(page.getByText('kime01', { exact: true })).toBeInTheDocument()

    const rootRect = getElementRect('[data-cascading-root-panel]')
    const firstSubpanelRect = getElementRect('[data-layer-depth="1"]')

    expect(rootRect).toBeDefined()
    expect(firstSubpanelRect).toBeDefined()
    expect(firstSubpanelRect!.x).toBeLessThan(rootRect!.x)
  })

  it('ArrowRight、ArrowLeft 和 Enter 的层级导航保持稳定', async () => {
    renderInBrowser(GroupedHarness)

    await page.getByTestId('grouped-trigger').click()
    await userEvent.keyboard('{ArrowDown}{ArrowRight}{ArrowLeft}{ArrowRight}{Enter}')

    await expect.element(page.getByTestId('grouped-trigger')).toHaveTextContent('anon/cry01')
  })

  it('搜索结果列表暴露 listbox/option 语义，并把当前高亮项关联到搜索框', async () => {
    renderInBrowser(GroupedHarness, {
      props: {
        initialValue: 'sakiko/default',
      },
    })

    await page.getByTestId('grouped-trigger').click()
    await page.getByPlaceholder('Search motion').fill('sakiko')

    const listbox = page.getByRole('listbox')
    const selectedOption = page.getByRole('option', { name: 'sakiko/default' })

    await expect.element(listbox).toBeInTheDocument()
    await expect.element(selectedOption).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{ArrowDown}')

    const searchInput = getSearchInputElement()
    const activeOption = getActiveSearchOptionElement()
    expect(searchInput).toBeDefined()
    expect(activeOption).toBeDefined()
    expect(searchInput!.getAttribute('aria-activedescendant')).toBe(activeOption!.id)
  })

  it('鼠标离开搜索结果列表时，不会回退到已有的键盘高亮项', async () => {
    renderInBrowser(GroupedHarness, {
      props: {
        initialValue: 'sakiko/default',
      },
    })

    await page.getByTestId('grouped-trigger').click()
    await page.getByPlaceholder('Search motion').fill('sakiko')
    await userEvent.keyboard('{ArrowDown}')

    const hoveredOption = findSearchOptionElement('sakiko/default')
    const listbox = getSearchListboxElement()
    expect(hoveredOption).toBeDefined()
    expect(listbox).toBeDefined()
    expect(getActiveSearchOptionElement()?.textContent).toContain('sakiko/maskon/kime01')

    hoveredOption!.dispatchEvent(new MouseEvent('mouseenter'))
    await expect.poll(() => getActiveSearchOptionElement()?.textContent?.includes('sakiko/default') ?? false).toBe(true)

    listbox!.dispatchEvent(new MouseEvent('mouseleave'))

    await expect.poll(() => getActiveSearchOptionElement()).toBeUndefined()
  })

  it('搜索结果在收缩后，Enter 会忽略过期高亮而不是抛错', async () => {
    renderInBrowser(DynamicSearchDocumentsHarness)

    await page.getByTestId('dynamic-trigger').click()
    await page.getByPlaceholder('Search motion').fill('cry')
    await expect.element(page.getByRole('option', { name: 'anon/cry02' })).toBeInTheDocument()

    await userEvent.keyboard('{ArrowDown}{ArrowDown}')

    const testHooks = globalThis as typeof globalThis & CascadingComboboxTestHooks
    testHooks.__shrinkCascadingSearchDocuments?.()

    await expect.element(page.getByRole('option', { name: 'anon/cry02' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('dynamic-trigger')).toHaveTextContent('sakiko/default')
  })

  it('点击子菜单叶子项时，会更新选中值并关闭浮层', async () => {
    renderInBrowser(GroupedHarness, {
      props: {
        initialValue: 'sakiko/maskon/kime01',
      },
    })

    await page.getByTestId('grouped-trigger').click()
    await expect.element(page.getByText('default', { exact: true })).toBeInTheDocument()

    const submenuLeafRow = findLayerRow(1, 'default')
    expect(submenuLeafRow).toBeDefined()

    await userEvent.click(submenuLeafRow!)

    await expect.element(page.getByTestId('grouped-trigger')).toHaveTextContent('sakiko/default')
    await expect.element(page.getByText('kime01', { exact: true })).not.toBeInTheDocument()
  })

  it('ArrowLeft 返回上级层时保留当前父层 submenu，ArrowUp/Down 移到其他组项时会自动展开对应 submenu', async () => {
    renderInBrowser(GroupedHarness, {
      props: {
        initialValue: 'sakiko/maskon/kime01',
      },
    })

    await page.getByTestId('grouped-trigger').click()
    await expect.element(page.getByText('kime01', { exact: true })).toBeInTheDocument()
    expect(getSubpanelRects()).toHaveLength(2)

    await userEvent.keyboard('{ArrowLeft}')

    expect(getSubpanelRects()).toHaveLength(2)
    expect(getLayerActiveBrowseText(1)).toContain('maskon')
    expect(getLayerActiveBrowseText(2)).toBeUndefined()

    await userEvent.keyboard('{ArrowLeft}')

    expect(getSubpanelRects()).toHaveLength(1)
    expect(getLayerActiveBrowseText(0)).toContain('sakiko')
    expect(getLayerActiveBrowseText(1)).toBeUndefined()

    await userEvent.keyboard('{ArrowUp}')

    expect(getSubpanelRects()).toHaveLength(1)
    expect(getLayerActiveBrowseText(0)).toContain('anon')
    await expect.element(page.getByText('cry01', { exact: true })).toBeInTheDocument()
  })

  it('未启用路径分组时浏览态保持扁平列表', async () => {
    renderInBrowser(FlatHarness)

    await page.getByTestId('flat-trigger').click()

    await expect.element(page.getByText('Idle')).toBeInTheDocument()
    await expect.element(page.getByText('Joy')).toBeInTheDocument()
    await expect.element(page.getByText('Sad')).toBeInTheDocument()
  })

  it('打开已选嵌套值时，根层与子层都会把激活项滚动到各自菜单中部', async () => {
    renderInBrowser(TallGroupedHarness)

    await page.getByTestId('tall-trigger').click()
    await expect.element(page.getByText('item-24', { exact: true })).toBeInTheDocument()

    await expect.poll(() => {
      const rootMetrics = getActiveAlignmentMetrics(
        '[data-cascading-root-panel]',
        '[data-cascading-root-scroll-viewport]',
      )
      const subpanelMetrics = getActiveAlignmentMetrics(
        '[data-layer-depth="1"]',
        '[data-cascading-subpanel-scroll-viewport]',
      )

      return {
        rootReady: Boolean(rootMetrics && rootMetrics.scrollTop > 0),
        subpanelReady: Boolean(subpanelMetrics && subpanelMetrics.scrollTop > 0),
      }
    }).toEqual({
      rootReady: true,
      subpanelReady: true,
    })

    const rootMetrics = getActiveAlignmentMetrics(
      '[data-cascading-root-panel]',
      '[data-cascading-root-scroll-viewport]',
    )
    const subpanelMetrics = getActiveAlignmentMetrics(
      '[data-layer-depth="1"]',
      '[data-cascading-subpanel-scroll-viewport]',
    )
    expect(rootMetrics).toBeDefined()
    expect(subpanelMetrics).toBeDefined()
    expect(rootMetrics!.scrollTop).toBeGreaterThan(0)
    expect(subpanelMetrics!.scrollTop).toBeGreaterThan(0)
    expect(rootMetrics!.centerOffset).toBeLessThanOrEqual(rootMetrics!.activeHeight)
    expect(subpanelMetrics!.centerOffset).toBeLessThanOrEqual(subpanelMetrics!.activeHeight)
  })

  it('内容未溢出时，根层与子层滚动区域不显示滚动条', async () => {
    renderInBrowser(GroupedHarness, {
      props: {
        initialValue: 'sakiko/maskon/kime01',
      },
    })

    await page.getByTestId('grouped-trigger').click()
    await expect.element(page.getByText('maskon', { exact: true })).toBeInTheDocument()

    const rootViewportMetrics = getLayerViewportMetrics(0)
    const subpanelViewportMetrics = getLayerViewportMetrics(1)

    expect(rootViewportMetrics).toBeDefined()
    expect(subpanelViewportMetrics).toBeDefined()
    expect(rootViewportMetrics!.scrollHeight).toBeLessThanOrEqual(rootViewportMetrics!.clientHeight + 1)
    expect(subpanelViewportMetrics!.scrollHeight).toBeLessThanOrEqual(subpanelViewportMetrics!.clientHeight + 1)
  })

  it('内容溢出时，根层与子层滚动区域才显示滚动条', async () => {
    renderInBrowser(TallGroupedHarness)

    await page.getByTestId('tall-trigger').click()
    await expect.element(page.getByText('item-24', { exact: true })).toBeInTheDocument()

    const rootViewportMetrics = getLayerViewportMetrics(0)
    const subpanelViewportMetrics = getLayerViewportMetrics(1)

    expect(rootViewportMetrics).toBeDefined()
    expect(subpanelViewportMetrics).toBeDefined()
    expect(rootViewportMetrics!.scrollHeight).toBeGreaterThan(rootViewportMetrics!.clientHeight + 1)
    expect(subpanelViewportMetrics!.scrollHeight).toBeGreaterThan(subpanelViewportMetrics!.clientHeight + 1)
  })

  it('点击打开后，从外部 hover 回当前已选组时，不会让已展开的子菜单先收起再重新打开', async () => {
    renderInBrowser(GroupedHarness, {
      props: {
        initialValue: 'sakiko/maskon/kime01',
      },
    })

    await page.getByTestId('grouped-trigger').click()
    await expect.element(page.getByText('maskon', { exact: true })).toBeInTheDocument()
    expect(getSubpanelRects()).toHaveLength(2)

    const selectedRootGroupRow = findRootGroupRow('sakiko')
    expect(selectedRootGroupRow).toBeDefined()

    selectedRootGroupRow!.dispatchEvent(new MouseEvent('mouseenter'))
    await expect.poll(() => getSubpanelRects().length).toBe(2)
    await expect.poll(() => getLayerActiveBrowseText(1)?.includes('maskon') ?? false).toBe(true)
    await expect.poll(() => getLayerActiveBrowseText(2)?.includes('kime01') ?? false).toBe(true)

    expect(getSubpanelRects()).toHaveLength(2)
    expect(getLayerActiveBrowseText(1)).toContain('maskon')
    expect(getLayerActiveBrowseText(2)).toContain('kime01')
    expect(getLayerSelectedBrowseText(2)).toContain('kime01')
  })

  it('hover 组项只展开子菜单，不会自动高亮子层首项', async () => {
    renderInBrowser(TallGroupedHarness)

    await page.getByTestId('tall-trigger').click()
    await expect.element(page.getByText('item-24', { exact: true })).toBeInTheDocument()

    const overflowGroupRow = findRootGroupRow('root-01')
    expect(overflowGroupRow).toBeDefined()

    overflowGroupRow!.dispatchEvent(new MouseEvent('mouseenter'))
    await expect.poll(() => getLayerActiveBrowseText(0)?.includes('root-01') ?? false).toBe(true)

    expect(getLayerActiveBrowseText(0)).toContain('root-01')
    expect(getLayerActiveBrowseText(1)).toBeUndefined()
  })

  it('重新 hover 到包含当前选中值的组时，会恢复已选子项高亮并滚到选中项附近', async () => {
    renderInBrowser(TallGroupedHarness)

    await page.getByTestId('tall-trigger').click()
    await expect.element(page.getByText('item-24', { exact: true })).toBeInTheDocument()

    const overflowGroupRow = findRootGroupRow('root-01')
    const targetGroupRow = findRootGroupRow('target')
    expect(overflowGroupRow).toBeDefined()
    expect(targetGroupRow).toBeDefined()

    overflowGroupRow!.dispatchEvent(new MouseEvent('mouseenter'))
    await expect.poll(() => getLayerActiveBrowseText(0)?.includes('root-01') ?? false).toBe(true)
    targetGroupRow!.dispatchEvent(new MouseEvent('mouseenter'))
    await expect.poll(() => getLayerActiveBrowseText(0)?.includes('target') ?? false).toBe(true)
    await expect.poll(() => getLayerActiveBrowseText(1)?.includes('item-24') ?? false).toBe(true)
    await expect.poll(() => (getLayerViewportScrollTop(1) ?? 0) > 0).toBe(true)

    expect(getLayerActiveBrowseText(0)).toContain('target')
    expect(getLayerActiveBrowseText(1)).toContain('item-24')
    expect(getLayerSelectedBrowseText(1)).toContain('item-24')
    expect(getLayerViewportScrollTop(1)).toBeGreaterThan(0)
  })

  it('子菜单里的组项 hover 展开时，不会把当前子菜单突然滚回顶部', async () => {
    renderInBrowser(NestedGroupedHarness)

    await page.getByTestId('nested-trigger').click()
    await expect.element(page.getByText('group-48', { exact: true })).toBeInTheDocument()
    await expect.poll(() => ({
      activeReady: getLayerActiveBrowseText(1)?.includes('group-48') ?? false,
      scrollReady: (getLayerViewportScrollTop(1) ?? 0) > 0,
    })).toEqual({
      activeReady: true,
      scrollReady: true,
    })

    const hoveredGroupRow = findLayerGroupRow(1, 'group-02')
    expect(hoveredGroupRow).toBeDefined()
    expect(getLayerActiveBrowseText(1)).toContain('group-48')

    const initialScrollTop = getLayerViewportScrollTop(1)
    expect(initialScrollTop).toBeGreaterThan(0)

    hoveredGroupRow!.dispatchEvent(new MouseEvent('mouseenter'))
    await expect.poll(() => getLayerActiveBrowseText(1)?.includes('group-02') ?? false).toBe(true)

    const nextScrollTop = getLayerViewportScrollTop(1)
    expect(getLayerActiveBrowseText(1)).toContain('group-02')
    expect(nextScrollTop).toBeDefined()
    expect(Math.abs(nextScrollTop! - initialScrollTop!)).toBeLessThanOrEqual(1)
  })
})
