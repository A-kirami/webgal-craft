import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, ref } from 'vue'

import { createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

import StartupImagesPicker from './StartupImagesPicker.vue'

import type { PropType } from 'vue'

interface ThumbnailStubValue {
  width: number
  height: number
  resizeMode?: 'contain' | 'cover'
}

function createAssetImageStub() {
  return defineComponent({
    name: 'StubAssetImage',
    props: {
      path: {
        type: String,
        default: undefined,
      },
      rootPath: {
        type: String,
        default: undefined,
      },
      serveUrl: {
        type: String,
        default: undefined,
      },
      thumbnail: {
        type: Object as PropType<ThumbnailStubValue | undefined>,
        default: undefined,
      },
      alt: {
        type: String,
        default: undefined,
      },
    },
    setup(props, { attrs }) {
      return () => h('img', {
        ...attrs,
        'alt': props.alt,
        'data-path': props.path,
        'data-root-path': props.rootPath,
        'data-serve-url': props.serveUrl,
        'data-thumbnail': props.thumbnail === undefined ? undefined : JSON.stringify(props.thumbnail),
      })
    },
  })
}

const filePickerRenderSpy = vi.fn()

const globalStubs = {
  AssetImage: createAssetImageStub(),
  Button: createBrowserContainerStub('StubButton', 'button'),
  FilePicker: defineComponent({
    name: 'StubFilePicker',
    props: {
      extensions: {
        type: Array as PropType<string[] | undefined>,
        default: undefined,
      },
      modelValue: {
        type: String,
        default: '',
      },
      popoverTitle: {
        type: String,
        default: undefined,
      },
      rootPath: {
        type: String,
        required: true,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { emit, slots }) {
      filePickerRenderSpy({
        extensions: props.extensions,
        modelValue: props.modelValue,
        popoverTitle: props.popoverTitle,
        rootPath: props.rootPath,
      })

      return () => h('div', [
        slots.trigger?.(),
        h('button', {
          'type': 'button',
          'data-testid': 'add-startup-image',
          'onClick': () => emit('update:modelValue', 'added-image.webp'),
        }, 'add-startup-image'),
        h('button', {
          'type': 'button',
          'data-testid': 'add-duplicate-startup-image',
          'onClick': () => emit('update:modelValue', 'opening.webp'),
        }, 'add-duplicate-startup-image'),
      ])
    },
  }),
}

const StartupImagesPickerHarness = defineComponent({
  name: 'StartupImagesPickerHarness',
  props: {
    initialValue: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
  },
  setup(props) {
    const value = ref([...props.initialValue])

    return () => h('div', [
      h(StartupImagesPicker, {
        'modelValue': value.value,
        'gamePath': '/games/demo',
        'backgroundRootPath': '/games/demo/game/background',
        'serveUrl': 'http://127.0.0.1:8899/game/demo/',
        'onUpdate:modelValue': (nextValue: string[]) => {
          value.value = nextValue
        },
      }),
      h('output', { 'data-testid': 'startup-value' }, value.value.join('|')),
    ])
  },
})

describe('StartupImagesPicker', () => {
  it('会渲染启动图列表和添加入口', async () => {
    filePickerRenderSpy.mockReset()

    renderInBrowser(StartupImagesPickerHarness, {
      props: {
        initialValue: ['opening.webp', 'enter.webp'],
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const openingPreview = await page.getByRole('img', { name: 'modals.gameConfig.startupImages.previewAlt' }).first().element()

    expect(openingPreview.dataset.path).toBe('game/background/opening.webp')
    expect(filePickerRenderSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      rootPath: '/games/demo/game/background',
    }))
    await expect.element(page.getByRole('button', { name: 'modals.gameConfig.startupImages.remove' }).first()).toBeVisible()
    await expect.element(page.getByText('modals.gameConfig.startupImages.add')).toBeVisible()
  })

  it('启动图卡片只显示图片，不显示文件名文案', async () => {
    renderInBrowser(StartupImagesPickerHarness, {
      props: {
        initialValue: ['cg/opening.webp', 'logos/enter.webp'],
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('startup-value')).toHaveTextContent('cg/opening.webp|logos/enter.webp')
    await expect.element(page.getByTestId('startup-images-scroll-area').getByText('opening.webp')).not.toBeInTheDocument()
    await expect.element(page.getByTestId('startup-images-scroll-area').getByText('enter.webp')).not.toBeInTheDocument()
  })

  it('点击删除按钮后会更新启动图数组', async () => {
    renderInBrowser(StartupImagesPickerHarness, {
      props: {
        initialValue: ['opening.webp', 'enter.webp'],
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'modals.gameConfig.startupImages.remove' }).first().click()

    await expect.element(page.getByTestId('startup-value')).toHaveTextContent('enter.webp')
  })

  it('点击添加入口后会追加图片', async () => {
    renderInBrowser(StartupImagesPickerHarness, {
      props: {
        initialValue: ['opening.webp'],
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('add-startup-image').click()

    await expect.element(page.getByTestId('startup-value')).toHaveTextContent('opening.webp|added-image.webp')
  })

  it('重复选择已有图片时不会重复追加', async () => {
    renderInBrowser(StartupImagesPickerHarness, {
      props: {
        initialValue: ['opening.webp'],
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('add-duplicate-startup-image').click()

    await expect.element(page.getByTestId('startup-value')).toHaveTextContent(/^opening\.webp$/)
  })
})
