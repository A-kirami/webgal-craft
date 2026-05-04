import { describe, expect, it } from 'vitest'

import { createTestEngine, createTestGame } from '~/__tests__/factories'

describe('测试工厂函数', () => {
  it('createTestGame 默认带 available availability', () => {
    expect(createTestGame()).toMatchObject({
      availability: 'available',
    })
  })

  it('createTestEngine 默认带 available availability', () => {
    expect(createTestEngine()).toMatchObject({
      availability: 'available',
    })
  })

  it('createTestGame 会基于解析后的 game path 生成默认预览资源路径', () => {
    expect(createTestGame({
      path: '/games/custom-demo',
    })).toMatchObject({
      path: '/games/custom-demo',
      metadata: {
        titleImg: 'cover.png',
      },
      previewAssets: {
        cover: {
          path: 'game/background/cover.png',
        },
        icon: {
          path: 'icons/favicon.ico',
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
          path: 'game/background/cover.png',
        },
        icon: {
          path: 'icons/favicon.ico',
        },
      },
    })
  })

  it('createTestGame 会保留调用方显式提供的预览资源路径', () => {
    expect(createTestGame({
      path: '/games/custom-demo',
      previewAssets: {
        cover: {
          path: '/covers/custom-cover.png',
        },
        icon: {
          path: '/icons/custom-icon.png',
        },
      },
    })).toMatchObject({
      previewAssets: {
        cover: {
          path: '/covers/custom-cover.png',
        },
        icon: {
          path: '/icons/custom-icon.png',
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

  it('createTestEngine 会保留调用方显式提供的图标路径', () => {
    expect(createTestEngine({
      path: '/engines/custom-engine',
      previewAssets: {
        icon: {
          path: '/icons/custom-engine-icon.png',
        },
      },
    })).toMatchObject({
      previewAssets: {
        icon: {
          path: '/icons/custom-engine-icon.png',
        },
      },
    })
  })
})
