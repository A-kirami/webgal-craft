import { describe, expect, it, vi } from 'vitest'

import { createEditorPreviewSync } from '../editor-preview-sync'

describe('编辑器预览同步', () => {
  it('会规范化输入并在去重窗口内跳过重复同步', () => {
    const dispatch = vi.fn()
    let now = 100
    const previewSync = createEditorPreviewSync({
      dedupeWindowMs: 160,
      dispatch,
      now: () => now,
    })

    expect(previewSync.syncScenePreview('/game/scene.txt', 0.8, undefined as unknown as string)).toBe(true)
    expect(previewSync.syncScenePreview('/game/scene.txt', 1, '')).toBe(false)

    now += 200
    expect(previewSync.syncScenePreview('/game/scene.txt', 1, '')).toBe(true)

    expect(dispatch.mock.calls).toEqual([
      ['/game/scene.txt', 1, '', false],
      ['/game/scene.txt', 1, '', false],
    ])
  })

  it('不同 lineText 或 force 会被视为新的同步请求', () => {
    const dispatch = vi.fn()
    const previewSync = createEditorPreviewSync({
      dedupeWindowMs: 160,
      dispatch,
      now: () => 100,
    })

    expect(previewSync.syncScenePreview('/game/scene.txt', 3, 'alpha')).toBe(true)
    expect(previewSync.syncScenePreview('/game/scene.txt', 3, 'beta')).toBe(true)
    expect(previewSync.syncScenePreview('/game/scene.txt', 3, 'beta', true)).toBe(true)

    expect(dispatch).toHaveBeenCalledTimes(3)
  })
})
