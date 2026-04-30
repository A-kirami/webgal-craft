import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserActionStub,
  createBrowserClickStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { createTestEngine } from '~/__tests__/factories'

import EnginesTabCollectionSection from './EnginesTabCollectionSection.vue'

import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'

vi.mock('~/composables/useTauriDropZone', () => ({
  useTauriDropZone: () => ({
    files: ref<string[] | undefined>(undefined),
    isOverDropZone: ref(false),
  }),
}))

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  EngineGroupCard: createBrowserActionStub('StubEngineGroupCard', {
    eventName: 'deleteGroup',
    includeDefaultSlot: false,
    namedSlots: [],
    payload: (props: Record<string, unknown>) => String((props.group as EngineGroupCollectionItem).name),
    props: {
      group: {
        type: Object,
        required: true,
      },
      viewMode: {
        type: String,
        required: true,
      },
    },
    rootTag: 'article',
    testId: (props: Record<string, unknown>) => `group-card-${String((props.group as EngineGroupCollectionItem).name)}`,
    text: (props: Record<string, unknown>) => String((props.group as EngineGroupCollectionItem).name),
  }),
}

function createGroups(): EngineGroupCollectionItem[] {
  const stable = createTestEngine({
    id: 'engine-2',
    name: 'WebGAL',
    path: '/engines/WebGAL/4.5.0',
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
            path: '/engines/WebGAL/4.4.0',
            availability: 'broken',
            version: '4.4.0',
          }),
          serveUrl: 'http://127.0.0.1:8899/game/webgal/4.4.0/',
        },
      ],
      hasAvailableVersion: true,
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
        getEngineProgress: () => 0,
        hasEngineProgress: () => false,
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
        getEngineProgress: () => 0,
        hasEngineProgress: () => false,
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
})
