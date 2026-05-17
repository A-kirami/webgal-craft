import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'

import { useVisualEditorSceneViewport } from '../useVisualEditorSceneViewport'

import type { ScrollArea } from '~/components/ui/scroll-area'
import type { SceneVisualProjectionState } from '~/stores/editor'

const { useVirtualizerMock } = vi.hoisted(() => ({
  useVirtualizerMock: vi.fn(),
}))

vi.mock('@tanstack/vue-virtual', () => ({
  useVirtualizer: useVirtualizerMock,
}))

function createState(): SceneVisualProjectionState {
  return {
    isDirty: false,
    kind: 'scene',
    path: '/project/scene.txt',
    projection: 'visual',
    statements: [
      { id: 1, parseError: false, parsed: undefined, rawText: 'say:first' },
      { id: 2, parseError: false, parsed: undefined, rawText: 'say:second' },
    ],
  } as SceneVisualProjectionState
}

function createScrollArea(viewportElement: HTMLElement): InstanceType<typeof ScrollArea> {
  return {
    viewport: {
      viewportElement,
    },
  } as unknown as InstanceType<typeof ScrollArea>
}

describe('useVisualEditorSceneViewport', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    useVirtualizerMock.mockReset()
  })

  it('语句排序失效时只重测当前可见行，避免清空 virtualizer 尺寸缓存', () => {
    const scope = effectScope()
    const firstRow = { dataset: { index: '0' } } as unknown as HTMLElement
    const secondRow = { dataset: { index: '1' } } as unknown as HTMLElement
    const viewportElement = {
      querySelectorAll: vi.fn(() => [firstRow, secondRow]),
    } as unknown as HTMLElement
    const virtualizer = {
      getTotalSize: vi.fn(() => 200),
      getVirtualItems: vi.fn(() => []),
      measure: vi.fn(),
      measureElement: vi.fn(),
      scrollOffset: 0,
      scrollToIndex: vi.fn(),
    }

    useVirtualizerMock.mockReturnValue(shallowRef(virtualizer))

    const viewport = scope.run(() => useVisualEditorSceneViewport({
      getScrollArea: () => createScrollArea(viewportElement),
      getSelectedIndex: () => 0,
      getState: createState,
      restoreSelection: vi.fn(),
    }))

    viewport?.statementSortVirtualAdapter.invalidate()

    expect(virtualizer.measure).not.toHaveBeenCalled()
    expect(virtualizer.measureElement).toHaveBeenCalledWith(firstRow)
    expect(virtualizer.measureElement).toHaveBeenCalledWith(secondRow)

    scope.stop()
  })
})
