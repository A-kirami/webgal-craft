import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getAssetUrl, resolveAssetUrl } from '~/services/platform/asset-url'

const { useWorkspaceStoreMock } = vi.hoisted(() => ({
  useWorkspaceStoreMock: vi.fn(),
}))

const CACHE_VERSION = Number.parseInt('1710000000000', 10)

const workspaceStoreState = {
  CWD: '/games/demo',
  currentGameServeUrl: 'http://127.0.0.1:8899/game/demo/',
}

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

describe('getAssetUrl 资源地址解析', () => {
  beforeEach(() => {
    workspaceStoreState.CWD = '/games/demo'
    workspaceStoreState.currentGameServeUrl = 'http://127.0.0.1:8899/game/demo/'
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)
  })

  it('会把游戏目录内的绝对路径转换成预览服务 URL', () => {
    expect(getAssetUrl('/games/demo/assets/bg/intro.png')).toBe('http://127.0.0.1:8899/game/demo/assets/bg/intro.png')
  })

  it('会统一反斜杠并正确编码特殊字符', () => {
    expect(getAssetUrl(String.raw`/games/demo/assets\bg\cover image.png`)).toBe('http://127.0.0.1:8899/game/demo/assets/bg/cover%20image.png')
  })

  it('传入 cacheVersion 时会附带时间戳参数用于缓存破坏', () => {
    const getAssetUrlWithCacheVersion = getAssetUrl as (
      assetPath: string,
      cacheVersion?: number,
      serveUrl?: string,
    ) => string

    expect(getAssetUrlWithCacheVersion('/games/demo/assets/bg/intro.png', CACHE_VERSION)).toBe(
      'http://127.0.0.1:8899/game/demo/assets/bg/intro.png?t=1710000000000',
    )
  })

  it('支持覆盖默认预览地址以便复用到主页和发现资源场景', () => {
    const getAssetUrlWithServeUrl = getAssetUrl as (
      assetPath: string,
      cacheVersion?: number,
      serveUrl?: string,
      thumbnail?: { width: number, height: number, resizeMode?: 'contain' | 'cover' },
    ) => string

    expect(
      getAssetUrlWithServeUrl('/games/demo/assets/bg/intro.png', CACHE_VERSION, 'http://127.0.0.1:8899/game/home-demo/'),
    ).toBe('http://127.0.0.1:8899/game/home-demo/assets/bg/intro.png?t=1710000000000')
  })

  it('传入缩略图参数时会附带缩放查询参数', () => {
    const getAssetUrlWithThumbnail = getAssetUrl as (
      assetPath: string,
      cacheVersion?: number,
      serveUrl?: string,
      thumbnail?: { width: number, height: number, resizeMode?: 'contain' | 'cover' },
    ) => string

    expect(
      getAssetUrlWithThumbnail(
        '/games/demo/assets/bg/intro.png',
        CACHE_VERSION,
        'http://127.0.0.1:8899/game/home-demo/',
        { width: 640, height: 360, resizeMode: 'cover' },
      ),
    ).toBe(
      'http://127.0.0.1:8899/game/home-demo/assets/bg/intro.png?t=1710000000000&w=640&h=360&fit=cover',
    )
  })

  it('缺少预览地址时会直接抛出错误', () => {
    workspaceStoreState.currentGameServeUrl = ''

    expect(() => getAssetUrl('/games/demo/assets/bg/intro.png')).toThrow('预览地址不存在')
  })

  it('会拒绝工作区外的路径', () => {
    expect(() => resolveAssetUrl('/games/other/assets/bg/intro.png', {
      cwd: '/games/demo',
      previewBaseUrl: 'http://127.0.0.1:8899/game/demo/',
    })).toThrow('资源路径不在当前工作区内')
  })

  it('会拒绝仅共享目录前缀但不在工作区内的路径', () => {
    expect(() => resolveAssetUrl('/games/demo2/assets/bg/intro.png', {
      cwd: '/games/demo',
      previewBaseUrl: 'http://127.0.0.1:8899/game/demo/',
    })).toThrow('资源路径不在当前工作区内')
  })

  it('会拒绝先逃出工作区再重新拼回工作区前缀的相对路径', () => {
    expect(() => resolveAssetUrl('../../../games/demo/assets/bg/intro.png', {
      cwd: '/games/demo',
      previewBaseUrl: 'http://127.0.0.1:8899/game/demo/',
    })).toThrow('资源路径不在当前工作区内')
  })

  it('会拒绝切换到不同磁盘根目录的路径', () => {
    expect(() => resolveAssetUrl('D:/games/demo/assets/bg/intro.png', {
      cwd: 'C:/games/demo',
      previewBaseUrl: 'http://127.0.0.1:8899/game/demo/',
    })).toThrow('资源路径不在当前工作区内')
  })

  it('会把 Windows 路径中的盘符大小写差异视为同一工作区', () => {
    expect(() => resolveAssetUrl('C:/games/demo/assets/bg/intro.png', {
      cwd: 'c:/games/demo',
      previewBaseUrl: 'http://127.0.0.1:8899/game/demo/',
    })).not.toThrow()

    expect(resolveAssetUrl('C:/games/demo/assets/bg/intro.png', {
      cwd: 'c:/games/demo',
      previewBaseUrl: 'http://127.0.0.1:8899/game/demo/',
    })).toBe('http://127.0.0.1:8899/game/demo/assets/bg/intro.png')
  })
})
