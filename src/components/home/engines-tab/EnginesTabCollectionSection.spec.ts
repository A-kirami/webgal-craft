import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import {
  createBrowserClickStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { createTestEngine } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'

import EnginesTabCollectionSection from './EnginesTabCollectionSection.vue'

import type { Engine } from '~/database/model'
import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'

vi.mock('~/composables/useTauriDropZone', () => ({
  useTauriDropZone: () => ({
    files: ref<string[] | undefined>(undefined),
    isOverDropZone: ref(false),
  }),
}))

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  EngineGroupCard: defineComponent({
    name: 'StubEngineGroupCard',
    props: {
      group: {
        type: Object,
        required: true,
      },
      progress: {
        type: Number,
      },
      viewMode: {
        type: String,
        required: true,
      },
    },
    emits: ['deleteGroup'],
    setup(props, { emit }) {
      return () => {
        const group = props.group as EngineGroupCollectionItem
        return h('article', {
          'data-progress': String(props.progress),
          'data-testid': `group-card-${group.name}`,
          'onClick': () => emit('deleteGroup', group.name),
        }, group.name)
      }
    },
  }),
}

function createGroups(): EngineGroupCollectionItem[] {
  const stable = createTestEngine({
    id: 'engine-2',
    name: 'WebGAL',
    path: AbsPath.from('/engines/WebGAL/4.5.0'),
    version: '4.5.0',
  })

  return [
    {
      engineId: 'open-webgal.webgal',
      name: 'WebGAL',
      engines: [
        {
          engine: stable,
          serveUrl: 'http://127.0.0.1:8899/game/webgal/4.5.0/',
        },
        {
          engine: createTestEngine({
            id: 'engine-1',
            name: 'WebGAL',
            path: AbsPath.from('/engines/WebGAL/4.4.0'),
            availability: 'broken',
            version: '4.4.0',
          }),
          serveUrl: 'http://127.0.0.1:8899/game/webgal/4.4.0/',
        },
      ],
      hasAvailableVersion: true,
      isImporting: false,
      isUnavailable: false,
      isDefault: false,
      latestVersionLabel: '4.5.0',
      representativeItem: {
        engine: stable,
        serveUrl: 'http://127.0.0.1:8899/game/webgal/4.5.0/',
      },
      summary: 'Stable release',
      unavailableCount: 1,
      versionCount: 2,
    },
  ]
}

describe('EnginesTabCollectionSection', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('会渲染引擎族卡片', async () => {
    renderInBrowser(EnginesTabCollectionSection, {
      props: {
        groups: createGroups(),
        viewMode: 'grid',
        getEngineProgress: () => undefined,
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('group-card-WebGAL')).toBeInTheDocument()
  })

  it('会透传卡片操作事件', async () => {
    const onDeleteGroup = vi.fn()

    renderInBrowser(EnginesTabCollectionSection, {
      props: {
        groups: createGroups(),
        viewMode: 'list',
        getEngineProgress: () => undefined,
        onDeleteGroup,
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByText('WebGAL').click()

    expect(onDeleteGroup).toHaveBeenCalledWith('WebGAL')
  })

  it('会按组内导入中的引擎透传进度', async () => {
    const groups = createGroups()
    const importingEngine = groups[0]!.engines[0]!.engine

    renderInBrowser(EnginesTabCollectionSection, {
      props: {
        groups,
        viewMode: 'grid',
        getEngineProgress: (engine: Engine) => engine.id === importingEngine.id ? 64 : undefined,
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const card = await page.getByTestId('group-card-WebGAL').element()
    expect(card.dataset.progress).toBe('64')
  })
})
