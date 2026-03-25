/* eslint-disable vue/one-component-per-file */
import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

import { createBrowserLiteI18n } from '~/__tests__/browser'

import FilePickerToolbar from './FilePickerToolbar.vue'

const globalStubs = {
  Button: defineComponent({
    name: 'StubButton',
    emits: ['click'],
    setup(_, { attrs, emit, slots }) {
      return () => h('button', {
        ...attrs,
        type: 'button',
        onClick: (event: MouseEvent) => emit('click', event),
      }, slots.default?.())
    },
  }),
  DropdownMenu: defineComponent({
    name: 'StubDropdownMenu',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuCheckboxItem: defineComponent({
    name: 'StubDropdownMenuCheckboxItem',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuContent: defineComponent({
    name: 'StubDropdownMenuContent',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuLabel: defineComponent({
    name: 'StubDropdownMenuLabel',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuRadioGroup: defineComponent({
    name: 'StubDropdownMenuRadioGroup',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuRadioItem: defineComponent({
    name: 'StubDropdownMenuRadioItem',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuSeparator: defineComponent({
    name: 'StubDropdownMenuSeparator',
    setup() {
      return () => h('hr')
    },
  }),
  DropdownMenuSub: defineComponent({
    name: 'StubDropdownMenuSub',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuSubContent: defineComponent({
    name: 'StubDropdownMenuSubContent',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuSubTrigger: defineComponent({
    name: 'StubDropdownMenuSubTrigger',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuTrigger: defineComponent({
    name: 'StubDropdownMenuTrigger',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  PathBreadcrumb: defineComponent({
    name: 'StubPathBreadcrumb',
    emits: ['navigate'],
    setup(_, { emit }) {
      return () => h('button', {
        type: 'button',
        onClick: () => emit('navigate', 'images/bg'),
      }, 'Breadcrumb')
    },
  }),
}

describe('FilePickerToolbar', () => {
  it('点击视图切换按钮时会更新 viewMode', async () => {
    const onUpdateViewMode = vi.fn()

    render(FilePickerToolbar, {
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
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'common.view.grid' }).click()

    expect(onUpdateViewMode).toHaveBeenCalledWith('list')
  })

  it('面包屑导航时会发出 navigate 事件', async () => {
    const onNavigate = vi.fn()

    render(FilePickerToolbar, {
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
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'Breadcrumb' }).click()

    expect(onNavigate).toHaveBeenCalledWith('images/bg')
  })
})
