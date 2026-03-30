import { describe, expect, it } from 'vitest'

import { mergeQueuedAssetViewLoad } from '../asset-view-load'

describe('mergeQueuedAssetViewLoad', () => {
  it('同一路径下显式加载会覆盖静默刷新', () => {
    const pending = mergeQueuedAssetViewLoad(undefined, {
      directoryPath: '/games/demo/assets/bg/chapter-1',
      isSilent: true,
    })

    expect(mergeQueuedAssetViewLoad(pending, {
      directoryPath: '/games/demo/assets/bg/chapter-1',
      isSilent: false,
    })).toEqual({
      directoryPath: '/games/demo/assets/bg/chapter-1',
      isSilent: false,
    })
  })

  it('显式导航后追加的静默刷新不会吞掉 loading', () => {
    const pending = mergeQueuedAssetViewLoad(undefined, {
      directoryPath: '/games/demo/assets/bg/chapter-1',
      isSilent: false,
    })

    expect(mergeQueuedAssetViewLoad(pending, {
      directoryPath: '/games/demo/assets/bg/chapter-1',
      isSilent: true,
    })).toEqual({
      directoryPath: '/games/demo/assets/bg/chapter-1',
      isSilent: false,
    })
  })

  it('静默刷新与路径切换同批触发时会保留最新目录和显式加载', () => {
    const pending = mergeQueuedAssetViewLoad(undefined, {
      directoryPath: '/games/demo/assets/bg',
      isSilent: true,
    })

    expect(mergeQueuedAssetViewLoad(pending, {
      directoryPath: '/games/demo/assets/bg/chapter-1',
      isSilent: false,
    })).toEqual({
      directoryPath: '/games/demo/assets/bg/chapter-1',
      isSilent: false,
    })
  })
})
