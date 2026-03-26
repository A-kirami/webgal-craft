import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserEmitStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import FilePickerToolbar from './FilePickerToolbar.vue'

const radioGroupContextKey = Symbol('radioGroupContext')

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  DropdownMenu: createBrowserContainerStub('StubDropdownMenu'),
  DropdownMenuCheckboxItem: defineComponent({
    name: 'StubDropdownMenuCheckboxItem',
    props: {
      modelValue: {
        type: Boolean,
        default: undefined,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { emit, slots }) {
      return () => h('button', {
        type: 'button',
        onClick: () => emit('update:modelValue', !props.modelValue),
      }, slots.default?.())
    },
  }),
  DropdownMenuContent: createBrowserContainerStub('StubDropdownMenuContent'),
  DropdownMenuLabel: createBrowserContainerStub('StubDropdownMenuLabel'),
  DropdownMenuRadioGroup: defineComponent({
    name: 'StubDropdownMenuRadioGroup',
    props: {
      modelValue: {
        type: [String, Number, Boolean],
        default: undefined,
      },
    },
    emits: ['update:modelValue'],
    setup(_, { emit, slots }) {
      provide(radioGroupContextKey, {
        update(value: unknown) {
          emit('update:modelValue', value)
        },
      })

      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuRadioItem: defineComponent({
    name: 'StubDropdownMenuRadioItem',
    props: {
      value: {
        type: [String, Number, Boolean],
        required: true,
      },
    },
    setup(props, { slots }) {
      const radioGroup = inject<{ update: (value: unknown) => void } | undefined>(radioGroupContextKey, undefined)

      return () => h('button', {
        type: 'button',
        onClick: () => radioGroup?.update(props.value),
      }, slots.default?.())
    },
  }),
  DropdownMenuSeparator: createBrowserContainerStub('StubDropdownMenuSeparator', 'hr'),
  DropdownMenuSub: createBrowserContainerStub('StubDropdownMenuSub'),
  DropdownMenuSubContent: createBrowserContainerStub('StubDropdownMenuSubContent'),
  DropdownMenuSubTrigger: createBrowserContainerStub('StubDropdownMenuSubTrigger'),
  DropdownMenuTrigger: createBrowserContainerStub('StubDropdownMenuTrigger'),
  PathBreadcrumb: createBrowserEmitStub('StubPathBreadcrumb', {
    eventName: 'navigate',
    payload: 'images/bg',
    text: 'Breadcrumb',
  }),
}

describe('FilePickerToolbar', () => {
  it('点击视图切换按钮时会更新 viewMode', async () => {
    const onUpdateViewMode = vi.fn()

    renderInBrowser(FilePickerToolbar, {
      props: {
        currentDir: 'images',
        onUpdateViewMode,
        rootPath: '/assets',
        showRecentHistory: true,
        showSupportedOnly: true,
        sortBy: 'name',
        sortOrder: 'asc',
        viewMode: 'grid',
        zoomLevel: 'medium',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'common.view.grid' }).click()

    expect(onUpdateViewMode).toHaveBeenCalledWith('list')
  })

  it('面包屑导航时会发出 navigate 事件', async () => {
    const onNavigate = vi.fn()

    renderInBrowser(FilePickerToolbar, {
      props: {
        currentDir: 'images',
        onNavigate,
        rootPath: '/assets',
        showRecentHistory: true,
        showSupportedOnly: true,
        sortBy: 'name',
        sortOrder: 'asc',
        viewMode: 'grid',
        zoomLevel: 'medium',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'Breadcrumb' }).click()

    expect(onNavigate).toHaveBeenCalledWith('images/bg')
  })

  it('排序菜单会发出 sortBy 与 sortOrder 更新事件', async () => {
    const onUpdateSortBy = vi.fn()
    const onUpdateSortOrder = vi.fn()

    renderInBrowser(FilePickerToolbar, {
      props: {
        currentDir: 'images',
        onUpdateSortBy,
        onUpdateSortOrder,
        rootPath: '/assets',
        showRecentHistory: true,
        showSupportedOnly: true,
        sortBy: 'name',
        sortOrder: 'asc',
        viewMode: 'grid',
        zoomLevel: 'medium',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'filePicker.sort.size' }).click()
    await page.getByRole('button', { name: 'filePicker.sort.directionDesc' }).click()

    expect(onUpdateSortBy).toHaveBeenCalledWith('size')
    expect(onUpdateSortOrder).toHaveBeenCalledWith('desc')
  })

  it('缩放与筛选菜单会发出 zoom 和布尔筛选更新事件', async () => {
    const onUpdateShowRecentHistory = vi.fn()
    const onUpdateShowSupportedOnly = vi.fn()
    const onUpdateZoomLevel = vi.fn()

    renderInBrowser(FilePickerToolbar, {
      props: {
        currentDir: 'images',
        onUpdateShowRecentHistory,
        onUpdateShowSupportedOnly,
        onUpdateZoomLevel,
        rootPath: '/assets',
        showRecentHistory: true,
        showSupportedOnly: true,
        sortBy: 'name',
        sortOrder: 'asc',
        viewMode: 'grid',
        zoomLevel: 'medium',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'filePicker.zoom.large' }).click()
    await page.getByRole('button', { name: 'filePicker.more.showSupportedOnly' }).click()
    await page.getByRole('button', { name: 'filePicker.more.showRecentHistory' }).click()

    expect(onUpdateZoomLevel).toHaveBeenCalledWith('large')
    expect(onUpdateShowSupportedOnly).toHaveBeenCalledWith(false)
    expect(onUpdateShowRecentHistory).toHaveBeenCalledWith(false)
  })
})
