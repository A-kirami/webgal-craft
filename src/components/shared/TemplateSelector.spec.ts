import { describe, expect, it, vi } from 'vitest'

import { createBrowserContainerStub, createBrowserValueStub, renderInBrowser } from '~/__tests__/browser-render'
import { createTestEngine, createTestTemplate } from '~/__tests__/factories'

import TemplateSelector from './TemplateSelector.vue'

const { useEnginesMock, useTemplatesMock } = vi.hoisted(() => ({
  useEnginesMock: vi.fn(),
  useTemplatesMock: vi.fn(),
}))

function translate(key: string): string {
  return key
}

vi.mock('~/composables/useDatabase', async importOriginal => ({
  ...(await importOriginal<typeof import('~/composables/useDatabase')>()),
  useEngines: useEnginesMock,
  useTemplates: useTemplatesMock,
}))

vi.mock('vue-i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: translate,
  }),
}))

const globalStubs = {
  Select: createBrowserValueStub('StubSelect'),
  SelectContent: createBrowserContainerStub('StubSelectContent'),
  SelectGroup: createBrowserContainerStub('StubSelectGroup'),
  SelectItem: createBrowserContainerStub('StubSelectItem', 'div'),
  SelectLabel: createBrowserContainerStub('StubSelectLabel'),
  SelectSeparator: createBrowserContainerStub('StubSelectSeparator'),
  SelectTrigger: createBrowserContainerStub('StubSelectTrigger', 'button'),
  SelectValue: createBrowserContainerStub('StubSelectValue', 'span'),
}

function readEngineOptionLabels(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[value^="engineBuiltin:"]')]
    .map(element => element.textContent?.trim() ?? '')
}

function readStandaloneOptionLabels(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[value^="standalone:"]')]
    .map(element => element.textContent?.trim() ?? '')
}

function renderSelector() {
  return renderInBrowser(TemplateSelector, {
    props: { modelValue: undefined },
    global: {
      mocks: { $t: translate },
      stubs: globalStubs,
    },
  })
}

describe('TemplateSelector', () => {
  it('独立模板按名称升序排列，不受主键顺序影响', async () => {
    useEnginesMock.mockReturnValue(ref([]))
    useTemplatesMock.mockReturnValue(ref([
      createTestTemplate({ id: 'uuid-9f3a', metadata: { name: 'Zeta' } }),
      createTestTemplate({ id: 'uuid-1b2c', metadata: { name: 'alpha' } }),
      createTestTemplate({ id: 'uuid-7d4e', metadata: { name: 'Beta' } }),
    ]))

    renderSelector()

    await expect.poll(readStandaloneOptionLabels).toEqual(['alpha', 'Beta', 'Zeta'])
  })

  it('引擎内置模板按引擎分组，组内版本降序排列', async () => {
    useEnginesMock.mockReturnValue(ref([
      createTestEngine({ id: 'alpha-legacy', engineId: 'alpha.pub', name: 'Alpha', version: '4.6.2' }),
      createTestEngine({ id: 'beta-legacy', engineId: 'beta.pub', name: 'Beta', version: '4.0.0' }),
      createTestEngine({ id: 'alpha-latest', engineId: 'alpha.pub', name: 'Alpha', version: '4.8.1' }),
      createTestEngine({ id: 'beta-latest', engineId: 'beta.pub', name: 'Beta', version: '5.0.0' }),
    ]))
    useTemplatesMock.mockReturnValue(ref([]))

    renderSelector()

    await expect.poll(readEngineOptionLabels).toEqual([
      'Alpha 4.8.1',
      'Alpha 4.6.2',
      'Beta 5.0.0',
      'Beta 4.0.0',
    ])
  })

  it('过滤掉编辑器不兼容的引擎版本', async () => {
    useEnginesMock.mockReturnValue(ref([
      createTestEngine({ id: 'compatible', engineId: 'alpha.pub', name: 'Alpha', version: '4.8.1' }),
      createTestEngine({
        id: 'incompatible',
        engineId: 'alpha.pub',
        name: 'Alpha',
        version: '4.7.0',
        metadata: { webgalVersion: '4.0.0' },
      }),
    ]))
    useTemplatesMock.mockReturnValue(ref([]))

    renderSelector()

    await expect.poll(readEngineOptionLabels).toEqual(['Alpha 4.8.1'])
  })
})
