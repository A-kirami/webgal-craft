/* eslint-disable unicorn/no-null -- 测试需要断言 droppable 命中契约中的空状态 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDroppableRegistry } from '../useDroppableRegistry'

import type { FileSystemDragPayload } from '~/types/drag-drop'

class TestHTMLElement {
  dataset: Record<string, string> = {}
  parentElement: TestHTMLElement | null = null

  getAttribute() {
    return null
  }

  getAttributeNames() {
    return []
  }
}

const filePayload: FileSystemDragPayload = {
  isDir: false,
  path: 'game/scene/start.txt',
  source: 'file-viewer',
  type: 'file-system-item',
}

function setupDocumentFromPoint(element: Element | null) {
  vi.stubGlobal('document', {
    elementFromPoint: vi.fn(() => element),
  })
}

afterEach(() => {
  useDroppableRegistry().clearHover()
  vi.unstubAllGlobals()
})

describe('useDroppableRegistry', () => {
  it('会从当前命中节点向父级查找最近的可放置目标', () => {
    const registry = useDroppableRegistry()
    const target = new TestHTMLElement() as unknown as HTMLElement
    const child = new TestHTMLElement()
    child.parentElement = target as unknown as TestHTMLElement
    setupDocumentFromPoint(child as unknown as Element)

    registry.registerDroppable(target, {
      accept: 'file-system-item',
      id: 'folder',
    })

    const match = registry.getMatchAt({ x: 10, y: 20 }, filePayload)

    expect(match).toMatchObject({
      config: expect.objectContaining({ id: 'folder' }),
      isDropAllowed: true,
      target,
    })
  })

  it('drop 成功后会调用目标回调并清理悬停状态', async () => {
    const registry = useDroppableRegistry()
    const target = new TestHTMLElement() as unknown as HTMLElement
    const onDrop = vi.fn()
    const onDragEnter = vi.fn()
    const onDragLeave = vi.fn()
    setupDocumentFromPoint(target as unknown as Element)

    registry.registerDroppable(target, {
      accept: 'file-system-item',
      id: 'folder',
      onDragEnter,
      onDragLeave,
      onDrop,
    })

    await expect(registry.drop(filePayload, { x: 10, y: 20 })).resolves.toBe(true)

    expect(onDragEnter).toHaveBeenCalledWith(filePayload, target)
    expect(onDrop).toHaveBeenCalledWith(filePayload, target)
    expect(onDragLeave).toHaveBeenCalledWith(filePayload, target)
    expect(registry.hoveredTarget.value).toBe(null)
    expect(registry.isDropAllowed.value).toBe(false)
  })
})
