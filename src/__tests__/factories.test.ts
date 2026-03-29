import { describe, expect, it } from 'vitest'

import { createTestEngine, createTestGame } from '~/__tests__/factories'

describe('test factories', () => {
  it('createTestGame 会基于解析后的 game path 生成默认预览资源路径', () => {
    expect(createTestGame({
      path: '/games/custom-demo',
    })).toMatchObject({
      path: '/games/custom-demo',
      previewAssets: {
        cover: {
          path: '/games/custom-demo/cover.png',
        },
        icon: {
          path: '/games/custom-demo/icon.png',
        },
      },
    })
  })

  it('createTestGame 不会让 undefined 覆盖解析后的默认路径', () => {
    expect(createTestGame({
      path: undefined,
      previewAssets: {
        cover: {
          path: undefined,
        },
        icon: {
          path: undefined,
        },
      },
    })).toMatchObject({
      path: '/games/demo',
      previewAssets: {
        cover: {
          path: '/games/demo/cover.png',
        },
        icon: {
          path: '/games/demo/icon.png',
        },
      },
    })
  })

  it('createTestEngine 会基于解析后的 engine path 生成默认图标路径', () => {
    expect(createTestEngine({
      path: '/engines/custom-engine',
    })).toMatchObject({
      path: '/engines/custom-engine',
      previewAssets: {
        icon: {
          path: '/engines/custom-engine/icon.png',
        },
      },
    })
  })

  it('createTestEngine 不会让 undefined 覆盖解析后的默认路径', () => {
    expect(createTestEngine({
      path: undefined,
      previewAssets: {
        icon: {
          path: undefined,
        },
      },
    })).toMatchObject({
      path: '/engines/default',
      previewAssets: {
        icon: {
          path: '/engines/default/icon.png',
        },
      },
    })
  })
})
