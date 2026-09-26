import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import { createBrowserContainerStub, createBrowserValueStub, renderInBrowser } from '~/__tests__/browser-render'
import { createTestEngine } from '~/__tests__/factories'

import EngineSelector from './EngineSelector.vue'

import type { EngineGroup } from '~/composables/use-engine-groups'

const { useEngineGroupsMock } = vi.hoisted(() => ({
  useEngineGroupsMock: vi.fn(),
}))

function translate(key: string): string {
  switch (key) {
    case 'engine.selectName': {
      return '选择引擎'
    }
    case 'engine.selectVersion': {
      return '选择版本'
    }
    default: {
      return key
    }
  }
}

vi.mock('~/composables/use-engine-groups', () => ({
  useEngineGroups: useEngineGroupsMock,
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
  SelectItem: createBrowserContainerStub('StubSelectItem'),
  SelectTrigger: createBrowserContainerStub('StubSelectTrigger', 'button'),
  SelectValue: createBrowserContainerStub('StubSelectValue', 'span'),
}

/** 用真实 EngineSelector 渲染一个受控 v-model 的宿主，返回宿主侧的选中引擎 */
async function renderSelectorHost(initialEngineId?: string) {
  const selectedEngineId = ref<string | undefined>(initialEngineId)

  const Host = defineComponent({
    name: 'EngineSelectorHost',
    setup() {
      return () => h(EngineSelector, {
        'modelValue': selectedEngineId.value,
        'preferredEngineId': 'open-webgal.webgal',
        'onUpdate:modelValue': (value: string | undefined) => {
          selectedEngineId.value = value
        },
      })
    },
  })

  await renderInBrowser(Host, {
    global: {
      mocks: {
        $t: translate,
      },
      stubs: globalStubs,
    },
  })

  return selectedEngineId
}

describe('EngineSelector', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('会隐藏没有可用版本的引擎族，并只展示当前引擎族的可用版本', async () => {
    useEngineGroupsMock.mockReturnValue({
      loaded: ref(true),
      groups: ref([
        {
          engineId: 'legacy-publisher.legacy',
          name: 'Legacy',
          engines: [
            createTestEngine({
              id: 'legacy-engine',
              engineId: 'legacy-publisher.legacy',
              name: 'Legacy',
              version: '1.0.0',
              availability: 'broken',
            }),
          ],
        },
        {
          engineId: 'open-webgal.webgal',
          name: 'WebGAL',
          engines: [
            createTestEngine({
              id: 'created-engine',
              engineId: 'open-webgal.webgal',
              name: 'WebGAL',
              version: '4.6.2',
              status: 'created',
            }),
            createTestEngine({
              id: 'incompatible-engine',
              engineId: 'open-webgal.webgal',
              name: 'WebGAL',
              version: '4.6.0',
              metadata: { webgalVersion: '4.6.0' },
              status: 'created',
            }),
            createTestEngine({
              id: 'unavailable-engine',
              engineId: 'open-webgal.webgal',
              name: 'WebGAL',
              version: '4.4.0',
              availability: 'broken',
            }),
          ],
        },
      ]),
    })

    const updateModelValue = vi.fn()

    await renderInBrowser(EngineSelector, {
      props: {
        'modelValue': undefined,
        'preferredEngineId': 'open-webgal.webgal',
        'onUpdate:modelValue': updateModelValue,
      },
      global: {
        mocks: {
          $t: translate,
        },
        stubs: globalStubs,
      },
    })

    await expect.poll(() => document.body.textContent ?? '').toContain('WebGAL')
    expect(document.body.textContent ?? '').not.toContain('Legacy')
    expect(document.body.textContent ?? '').toContain('4.6.2')
    expect(document.body.textContent ?? '').not.toContain('4.6.0')
    expect(document.body.textContent ?? '').not.toContain('4.4.0')
    await vi.waitFor(() => {
      expect(updateModelValue).toHaveBeenCalledWith('created-engine')
    })
    expect(document.querySelectorAll('button')).toHaveLength(2)
  })

  it('优先使用 preferredEngineId 对应的引擎族作为默认选择', async () => {
    useEngineGroupsMock.mockReturnValue({
      loaded: ref(true),
      groups: ref([
        {
          engineId: 'alice-publisher.alice',
          name: 'Alice',
          engines: [
            createTestEngine({
              id: 'alice-engine',
              engineId: 'alice-publisher.alice',
              name: 'Alice',
              version: '1.0.0',
              status: 'created',
            }),
          ],
        },
        {
          engineId: 'open-webgal.webgal',
          name: 'WebGAL',
          engines: [
            createTestEngine({
              id: 'webgal-engine',
              engineId: 'open-webgal.webgal',
              name: 'WebGAL',
              version: '4.5.0',
              status: 'created',
            }),
          ],
        },
      ]),
    })

    const updateModelValue = vi.fn()

    await renderInBrowser(EngineSelector, {
      props: {
        'modelValue': undefined,
        'preferredEngineId': 'open-webgal.webgal',
        'onUpdate:modelValue': updateModelValue,
      },
      global: {
        mocks: {
          $t: translate,
        },
        stubs: globalStubs,
      },
    })

    await vi.waitFor(() => {
      expect(updateModelValue).toHaveBeenCalledWith('webgal-engine')
    })
  })

  it('引擎列表尚未加载时父组件解析出的当前引擎版本不会被回退成最新版本', async () => {
    const groups = ref<EngineGroup[]>([])
    const loaded = ref(false)
    useEngineGroupsMock.mockReturnValue({ groups, loaded })
    const selectedEngineId = await renderSelectorHost()

    // 模拟 SwitchEngineModal：先解析出游戏当前使用的引擎，此时引擎列表仍未发帧
    selectedEngineId.value = 'engine-current'
    await nextTick()
    expect(selectedEngineId.value).toBe('engine-current')

    // 模拟 Dexie liveQuery 首次发帧
    loaded.value = true
    groups.value = [
      {
        engineId: 'open-webgal.webgal',
        name: 'WebGAL',
        engines: [
          createTestEngine({ id: 'engine-new', engineId: 'open-webgal.webgal', name: 'WebGAL', version: '4.6.0' }),
          createTestEngine({ id: 'engine-current', engineId: 'open-webgal.webgal', name: 'WebGAL', version: '4.5.0' }),
        ],
      },
    ]
    await nextTick()

    expect(selectedEngineId.value).toBe('engine-current')
    expect(document.querySelector('[value="engine-current"]')).not.toBeNull()
  })

  it('引擎列表已加载但没有可用引擎时会清空选择', async () => {
    const groups = ref<EngineGroup[]>([])
    const loaded = ref(false)
    useEngineGroupsMock.mockReturnValue({ groups, loaded })
    const selectedEngineId = await renderSelectorHost('engine-current')

    loaded.value = true
    await nextTick()

    expect(selectedEngineId.value).toBeUndefined()
  })
})
