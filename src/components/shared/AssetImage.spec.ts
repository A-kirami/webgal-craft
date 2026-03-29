import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, nextTick, ref } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

import AssetImage from './AssetImage.vue'

const {
  getAssetUrlMock,
  loggerErrorMock,
  resolveAssetUrlMock,
} = vi.hoisted(() => ({
  getAssetUrlMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  resolveAssetUrlMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: loggerErrorMock,
}))

vi.mock('~/services/platform/asset-url', () => ({
  getAssetUrl: getAssetUrlMock,
  resolveAssetUrl: resolveAssetUrlMock,
}))

const imageDataUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
const frameStyle = 'width: 160px; height: 160px;'

type HarnessMode = 'fixed' | 'fill' | 'cover' | 'thumbnail' | 'pendingExternal'

function renderHarnessAsset(mode: HarnessMode) {
  switch (mode) {
    case 'fixed': {
      return h(AssetImage, {
        path: '/assets/icon.png',
        alt: 'fixed-asset-image',
        class: 'size-8',
      })
    }

    case 'fill': {
      return h(AssetImage, {
        path: '/assets/icon.png',
        alt: 'fill-asset-image',
        class: 'h-full w-full',
      })
    }

    case 'cover': {
      return h(AssetImage, {
        path: '/assets/icon.png',
        alt: 'cover-asset-image',
        objectFit: 'cover',
        class: 'size-8',
      })
    }

    case 'thumbnail': {
      return h(AssetImage, {
        path: '/assets/cover.png',
        rootPath: '/games/demo',
        serveUrl: 'http://127.0.0.1:8899/game/demo/',
        alt: 'thumbnail-asset-image',
        cacheVersion: 1_7100_0000_0000,
        thumbnail: {
          width: 640,
          height: 360,
          resizeMode: 'cover',
        },
        class: 'h-full w-full',
      })
    }

    case 'pendingExternal': {
      return h(AssetImage, {
        path: '/assets/icon.png',
        rootPath: '/games/demo',
        alt: 'pending-external-asset-image',
        fallbackImage: '/placeholder.svg',
        class: 'size-8',
      })
    }

    default: {
      const unreachableMode: never = mode
      throw new Error(`未知的 AssetImage 测试模式: ${String(unreachableMode)}`)
    }
  }
}

function createHarness(mode: HarnessMode) {
  return defineComponent({
    name: 'AssetImageTestHarness',
    setup() {
      return () => h('div', { 'data-testid': 'frame', 'style': frameStyle }, [renderHarnessAsset(mode)])
    },
  })
}

describe('AssetImage', () => {
  beforeEach(() => {
    getAssetUrlMock.mockReset()
    resolveAssetUrlMock.mockReset()
    loggerErrorMock.mockReset()
  })

  it('外部资源在 serveUrl 尚未就绪时不会回退到工作区解析器', async () => {
    getAssetUrlMock.mockImplementation(() => {
      throw new Error('预览地址不存在')
    })

    renderInBrowser(createHarness('pendingExternal'))

    await expect.element(page.getByAltText('pending-external-asset-image')).toHaveAttribute('src', '/placeholder.svg')
    expect(resolveAssetUrlMock).not.toHaveBeenCalled()
    expect(getAssetUrlMock).not.toHaveBeenCalled()
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it('不会私自注入 h-full w-full 覆盖调用方尺寸', async () => {
    getAssetUrlMock.mockReturnValue(imageDataUrl)
    resolveAssetUrlMock.mockReturnValue(imageDataUrl)

    renderInBrowser(createHarness('fixed'))

    await expect.element(page.getByAltText('fixed-asset-image')).toBeVisible()
    const element = await page.getByAltText('fixed-asset-image').element()
    expect(element.className).toContain('size-8')
    expect(element.className).not.toContain('h-full')
    expect(element.className).not.toContain('w-full')
  })

  it('会保留调用方显式传入的 fill 类', async () => {
    getAssetUrlMock.mockReturnValue(imageDataUrl)
    resolveAssetUrlMock.mockReturnValue(imageDataUrl)

    renderInBrowser(createHarness('fill'))

    await expect.element(page.getByAltText('fill-asset-image')).toBeVisible()
    const element = await page.getByAltText('fill-asset-image').element()
    expect(element.className).toContain('h-full')
    expect(element.className).toContain('w-full')
  })

  it('会根据 objectFit 应用对应的 object-fit class', async () => {
    getAssetUrlMock.mockReturnValue(imageDataUrl)
    resolveAssetUrlMock.mockReturnValue(imageDataUrl)

    renderInBrowser(createHarness('cover'))

    await expect.element(page.getByAltText('cover-asset-image')).toBeVisible()
    const element = await page.getByAltText('cover-asset-image').element()
    expect(element.className).toContain('object-cover')
    expect(element.className).not.toContain('object-contain')
  })

  it('传入缩略图参数时会透传给资源地址解析器', async () => {
    getAssetUrlMock.mockReturnValue(imageDataUrl)
    resolveAssetUrlMock.mockReturnValue(imageDataUrl)

    renderInBrowser(createHarness('thumbnail'))

    await expect.element(page.getByAltText('thumbnail-asset-image')).toBeVisible()
    expect(resolveAssetUrlMock).toHaveBeenCalledWith('/assets/cover.png', {
      cwd: '/games/demo',
      cacheVersion: 1_7100_0000_0000,
      previewBaseUrl: 'http://127.0.0.1:8899/game/demo/',
      thumbnail: {
        width: 640,
        height: 360,
        resizeMode: 'cover',
      },
    })
  })

  it('缩略图对象引用变化但字段未变时，不会在加载失败后重复重试', async () => {
    getAssetUrlMock.mockReturnValue('/broken-image.png')

    const InlineThumbnailHarness = defineComponent({
      name: 'InlineThumbnailHarness',
      setup() {
        const thumbnail = ref({
          width: 96,
          height: 96,
        })

        return () => h('div', [
          h(AssetImage, {
            path: '/assets/icon.png',
            alt: 'inline-thumbnail-asset-image',
            fallbackImage: '/placeholder.svg',
            thumbnail: thumbnail.value,
          }),
          h('button', {
            'type': 'button',
            'data-testid': 'rerender-inline-thumbnail',
            'onClick': () => {
              thumbnail.value = {
                width: 96,
                height: 96,
              }
            },
          }, 'rerender'),
        ])
      },
    })

    renderInBrowser(InlineThumbnailHarness)

    const image = await page.getByAltText('inline-thumbnail-asset-image').element()
    expect(image.getAttribute('src')).toBe('/broken-image.png')

    image.dispatchEvent(new Event('error'))
    await nextTick()
    await expect.element(page.getByAltText('inline-thumbnail-asset-image')).toHaveAttribute('src', '/placeholder.svg')

    await page.getByTestId('rerender-inline-thumbnail').click()
    await nextTick()
    await expect.element(page.getByAltText('inline-thumbnail-asset-image')).toHaveAttribute('src', '/placeholder.svg')
  })
})
