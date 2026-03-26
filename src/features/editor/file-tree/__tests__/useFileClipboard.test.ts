import { describe, expect, it } from 'vitest'

import { useFileClipboard } from '~/features/editor/file-tree/useFileClipboard'

describe('useFileClipboard 行为', () => {
  it('同一个 key 会共享剪贴板状态', () => {
    const source = useFileClipboard('shared')
    const mirror = useFileClipboard('shared')

    source.setClipboard({ path: '/game/a.txt', isDir: false, isCut: false })

    expect(mirror.clipboard.value).toEqual([
      { path: '/game/a.txt', isDir: false, isCut: false },
    ])
    expect(mirror.operationType.value).toBe('copy')
    expect(mirror.canPaste.value).toBe(true)
  })

  it('不同 key 之间互不干扰，并支持多选与清空', () => {
    const copyClipboard = useFileClipboard('copy')
    const cutClipboard = useFileClipboard('cut')

    copyClipboard.setClipboard([
      { path: '/game/a.txt', isDir: false, isCut: false },
      { path: '/game/b.txt', isDir: true, isCut: false },
    ])
    cutClipboard.setClipboard({ path: '/game/c.txt', isDir: false, isCut: true })

    expect(copyClipboard.clipboard.value).toHaveLength(2)
    expect(copyClipboard.operationType.value).toBe('copy')
    expect(cutClipboard.operationType.value).toBe('cut')

    cutClipboard.clearClipboard()
    expect(cutClipboard.clipboard.value).toEqual([])
    expect(cutClipboard.hasClipboard.value).toBe(false)
    expect(copyClipboard.clipboard.value).toEqual([
      { path: '/game/a.txt', isDir: false, isCut: false },
      { path: '/game/b.txt', isDir: true, isCut: false },
    ])
    expect(copyClipboard.hasClipboard.value).toBe(true)
    expect(copyClipboard.operationType.value).toBe('copy')
  })
})
