import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import { createTestEngine } from '~/__tests__/factories'

import EngineSelector from './EngineSelector.vue'

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
  Select: createBrowserContainerStub('StubSelect'),
  SelectContent: createBrowserContainerStub('StubSelectContent'),
  SelectItem: createBrowserContainerStub('StubSelectItem'),
  SelectTrigger: createBrowserContainerStub('StubSelectTrigger', 'button'),
  SelectValue: createBrowserContainerStub('StubSelectValue', 'span'),
}

describe('EngineSelector', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('会隐藏没有可用版本的引擎族，并只展示当前引擎族的可用版本', async () => {
    useEngineGroupsMock.mockReturnValue({
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
              status: 'unavailable',
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
              version: '4.5.0',
              status: 'created',
            }),
            createTestEngine({
              id: 'unavailable-engine',
              engineId: 'open-webgal.webgal',
              name: 'WebGAL',
              version: '4.4.0',
              status: 'unavailable',
            }),
          ],
        },
      ]),
    })

    const updateModelValue = vi.fn()

    renderInBrowser(EngineSelector, {
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
    expect(document.body.textContent ?? '').toContain('4.5.0')
    expect(document.body.textContent ?? '').not.toContain('4.4.0')
    await vi.waitFor(() => {
      expect(updateModelValue).toHaveBeenCalledWith('created-engine')
    })
    expect(document.querySelectorAll('button')).toHaveLength(2)
  })

  it('优先使用 preferredEngineId 对应的引擎族作为默认选择', async () => {
    useEngineGroupsMock.mockReturnValue({
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

    renderInBrowser(EngineSelector, {
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
})
