import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, ref } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

import CoverImagePicker from './CoverImagePicker.vue'

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
          'data-testid': 'select-cover-image',
          'onClick': () => emit('update:modelValue', 'next-cover.webp'),
        }, 'select-cover-image'),
      ])
    },
  }),
}

const CoverImagePickerHarness = defineComponent({
  name: 'CoverImagePickerHarness',
  props: {
    initialValue: {
      type: String,
      default: '',
    },
  },
  setup(props) {
    const value = ref(props.initialValue)

    return () => h('div', [
      h(CoverImagePicker, {
        'modelValue': value.value,
        'gamePath': '/games/demo',
        'backgroundRootPath': '/games/demo/game/background',
        'serveUrl': 'http://127.0.0.1:8899/game/demo/',
        'onUpdate:modelValue': (nextValue: string) => {
          value.value = nextValue
        },
      }),
      h('output', { 'data-testid': 'cover-value' }, value.value),
    ])
  },
})

describe('CoverImagePicker', () => {
  it('会把当前封面图渲染为预览卡片，并把文件夹约束传给 FilePicker', async () => {
    filePickerRenderSpy.mockReset()

    renderInBrowser(CoverImagePickerHarness, {
      props: {
        initialValue: 'cover.webp',
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const previewImage = await page.getByRole('img', { name: 'modals.gameConfig.coverImage.previewAlt' }).element()

    expect(previewImage.dataset.path).toBe('game/background/cover.webp')
    expect(previewImage.dataset.rootPath).toBe('/games/demo')
    expect(previewImage.dataset.serveUrl).toBe('http://127.0.0.1:8899/game/demo/')
    expect(filePickerRenderSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      rootPath: '/games/demo/game/background',
    }))
  })

  it('封面图只显示图片，不显示文件名文案', async () => {
    renderInBrowser(CoverImagePickerHarness, {
      props: {
        initialValue: 'cg/cover.webp',
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('cover-value')).toHaveTextContent('cg/cover.webp')
    await expect.element(page.getByTestId('cover-image-surface').getByText('cover.webp')).not.toBeInTheDocument()
  })

  it('空值时会显示空态文案', async () => {
    renderInBrowser(CoverImagePickerHarness, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('modals.gameConfig.coverImage.empty')).toBeVisible()
    await expect.element(page.getByText('modals.gameConfig.coverImage.replace')).not.toBeInTheDocument()
  })

  it('选中新图片后会更新 v-model', async () => {
    renderInBrowser(CoverImagePickerHarness, {
      props: {
        initialValue: 'cover.webp',
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('select-cover-image').click()

    await expect.element(page.getByTestId('cover-value')).toHaveTextContent('next-cover.webp')
  })
})
