/* eslint-disable vue/one-component-per-file, vue/require-default-prop */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, ref } from 'vue'

import { createBrowserLiteI18n } from '~/__tests__/browser'

import EnginesTabCollectionSection from './EnginesTabCollectionSection.vue'

import type { Engine } from '~/database/model'

vi.mock('~/composables/useTauriDropZone', () => ({
  useTauriDropZone: () => ({
    files: ref<string[] | undefined>(undefined),
    isOverDropZone: ref(false),
  }),
}))

function createStubButton(name: string) {
  return defineComponent({
    name,
    emits: ['click'],
    setup(_, { attrs, emit, slots }) {
      return () => h('button', {
        ...attrs,
        type: 'button',
        onClick: (event: MouseEvent) => emit('click', event),
      }, slots.default?.())
    },
  })
}

function createStubContainer(name: string, tag: string = 'div') {
  return defineComponent({
    name,
    setup(_, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.())
    },
  })
}

const globalStubs = {
  Button: createStubButton('StubButton'),
  Card: createStubContainer('StubCard'),
  CardContent: createStubContainer('StubCardContent'),
  ContextMenu: createStubContainer('StubContextMenu'),
  ContextMenuContent: createStubContainer('StubContextMenuContent'),
  ContextMenuItem: createStubButton('StubContextMenuItem'),
  ContextMenuTrigger: createStubContainer('StubContextMenuTrigger'),
  Progress: createStubContainer('StubProgress'),
  Thumbnail: defineComponent({
    name: 'StubThumbnail',
    props: {
      alt: {
        type: String,
        required: false,
      },
    },
    setup(props, { attrs }) {
      return () => h('img', {
        ...attrs,
        alt: props.alt,
      })
    },
  }),
  Tooltip: createStubContainer('StubTooltip'),
  TooltipContent: createStubContainer('StubTooltipContent'),
  TooltipProvider: createStubContainer('StubTooltipProvider'),
  TooltipTrigger: createStubContainer('StubTooltipTrigger'),
}

function createEngine(overrides: Partial<Engine> = {}): Engine {
  return {
    id: 'engine-1',
    path: '/engines/default',
    createdAt: 0,
    status: 'created',
    metadata: {
      description: 'Default engine',
      icon: '/engines/default/icon.png',
      name: 'Default Engine',
    },
    ...overrides,
  }
}

function createHarness(viewMode: 'grid' | 'list') {
  return defineComponent({
    name: `EnginesTabCollectionSection${viewMode}Harness`,
    setup() {
      const importCount = ref(0)

      return () => h('div', [
        h(EnginesTabCollectionSection, {
          engines: [],
          getEngineProgress: () => 0,
          hasEngineProgress: () => false,
          viewMode,
          onImportClick: () => {
            importCount.value += 1
          },
        }),
        h('output', { 'data-testid': 'import-count' }, String(importCount.value)),
      ])
    },
  })
}

describe('EnginesTabCollectionSection', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('网格视图中处理中的引擎不会显示打开和卸载操作', async () => {
    render(EnginesTabCollectionSection, {
      props: {
        engines: [createEngine()],
        getEngineProgress: () => 50,
        hasEngineProgress: () => true,
        viewMode: 'grid',
      },
      global: {
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'common.openFolder' })).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'home.engines.uninstallEngine' })).not.toBeInTheDocument()
  })

  it('网格导入入口支持键盘触发', async () => {
    render(createHarness('grid'), {
      global: {
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'home.engines.installEngine' })).toBeInTheDocument()

    const importButton = document.querySelector('[aria-label="home.engines.installEngine"]') as HTMLElement | null
    expect(importButton).not.toBeNull()
    importButton!.focus()
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('import-count')).toHaveTextContent('1')
  })

  it('列表导入入口支持键盘触发', async () => {
    render(createHarness('list'), {
      global: {
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'home.engines.installEngine' })).toBeInTheDocument()

    const importButton = document.querySelector('[aria-label="home.engines.installEngine"]') as HTMLElement | null
    expect(importButton).not.toBeNull()
    importButton!.focus()
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('import-count')).toHaveTextContent('1')
  })
})
