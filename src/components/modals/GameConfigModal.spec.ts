import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import {
  createBrowserCheckboxStub,
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserInputStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import GameConfigModal from './GameConfigModal.vue'

import type { PropType } from 'vue'

const {
  modalOpenMock,
  notifySuccessMock,
  setConfigMock,
  useModalStoreMock,
} = vi.hoisted(() => ({
  modalOpenMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  setConfigMock: vi.fn(),
  useModalStoreMock: vi.fn(),
}))

vi.mock('~/services/config-manager', () => ({
  configManager: {
    setConfig: setConfigMock,
  },
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('notivue', () => ({
  push: {
    success: notifySuccessMock,
  },
}))

const preparedModalProps = {
  backgroundRootPath: '/games/demo/game/background',
  bgmRootPath: '/games/demo/game/bgm',
  gamePath: '/games/demo',
  initialValues: {
    defaultLanguage: 'zh_CN',
    description: 'An introductory story',
    enableAppreciation: false,
    gameKey: 'demo-key',
    gameLogo: ['opening.webp', 'enter.webp'],
    gameName: 'Demo Game',
    legacyExpressionBlendMode: false,
    lineHeight: 2.2,
    maxLine: 3,
    packageName: 'org.demo.game',
    showPanic: true,
    steamAppId: '480',
    titleBgm: 'title.ogg',
    titleImg: 'cover.webp',
  },
  serveUrl: 'http://127.0.0.1:8899/game/demo/',
} as const

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  TitleImgPicker: defineComponent({
    name: 'StubTitleImgPicker',
    props: {
      modelValue: {
        type: String,
        default: '',
      },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('div', [
        h('output', { 'data-testid': 'title-img-picker-value' }, props.modelValue),
        h('button', {
          type: 'button',
          onClick: () => emit('update:modelValue', 'cover-next.webp'),
        }, 'change-title-img'),
      ])
    },
  }),
  Dialog: defineComponent({
    name: 'StubDialog',
    props: {
      open: {
        type: Boolean,
        default: false,
      },
    },
    emits: ['update:open'],
    setup(props, { emit, slots }) {
      return () => h('div', { 'data-open': String(props.open) }, [
        h('button', {
          'type': 'button',
          'data-testid': 'dialog-close-request',
          'onClick': () => emit('update:open', false),
        }, 'request-close'),
        ...(slots.default?.() ?? []),
      ])
    },
  }),
  DialogContent: createBrowserContainerStub('StubDialogContent', 'section'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle'),
  FilePicker: defineComponent({
    name: 'StubFilePicker',
    props: {
      extensions: {
        type: Array,
        default: () => [],
      },
      inputId: {
        type: String,
        default: undefined,
      },
      modelValue: {
        type: String,
        default: '',
      },
      popoverTitle: {
        type: String,
        default: '',
      },
      rootPath: {
        type: String,
        required: true,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('input', {
        'data-extensions': props.extensions.join('|'),
        'data-popover-title': props.popoverTitle,
        'data-root-path': props.rootPath,
        'id': props.inputId,
        'value': props.modelValue,
        'onInput': (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      })
    },
  }),
  Input: createBrowserInputStub('StubInput'),
  InputGroup: createBrowserContainerStub('StubInputGroup'),
  InputGroupAddon: createBrowserContainerStub('StubInputGroupAddon'),
  InputGroupButton: createBrowserClickStub('StubInputGroupButton'),
  InputGroupInput: createBrowserInputStub('StubInputGroupInput'),
  Select: defineComponent({
    name: 'StubSelect',
    props: {
      modelValue: {
        type: String,
        default: '',
      },
    },
    emits: ['update:modelValue'],
    setup(props, { attrs, emit, slots }) {
      return () => {
        const { ['data-testid']: _dataTestId, ...restAttrs } = attrs

        return h('div', restAttrs, [
          h('input', {
            'data-testid': attrs['data-testid'],
            'type': 'text',
            'value': props.modelValue,
            'onInput': (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
          }),
          ...(slots.default?.() ?? []),
        ])
      }
    },
  }),
  SelectContent: createBrowserContainerStub('StubSelectContent'),
  SelectItem: createBrowserContainerStub('StubSelectItem'),
  SelectTrigger: createBrowserContainerStub('StubSelectTrigger', 'button'),
  SelectValue: createBrowserContainerStub('StubSelectValue'),
  ScrollArea: createBrowserContainerStub('StubScrollArea'),
  GameLogoPicker: defineComponent({
    name: 'StubGameLogoPicker',
    props: {
      modelValue: {
        type: Array as PropType<string[]>,
        default: () => [],
      },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('div', [
        h('output', { 'data-testid': 'game-logo-picker-value' }, props.modelValue.join('|')),
        h('button', {
          type: 'button',
          onClick: () => emit('update:modelValue', ['enter-next.webp', 'logo-next.webp']),
        }, 'change-game-logo'),
      ])
    },
  }),
  Switch: createBrowserCheckboxStub('StubSwitch'),
  Textarea: createBrowserInputStub('StubTextarea', 'textarea'),
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipProvider: createBrowserContainerStub('StubTooltipProvider'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
}

describe('GameConfigModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useModalStoreMock.mockReturnValue({
      open: modalOpenMock,
    })
  })

  it('使用传入的预取配置渲染表单时，不再主动读取配置文件', async () => {
    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': vi.fn(),
        ...preparedModalProps,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('game-config-game-name')).toHaveValue('Demo Game')
  })

  it('打开时会渲染预取配置中的关键字段', async () => {
    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': vi.fn(),
        ...preparedModalProps,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('game-config-modal-content')).toBeVisible()
    await expect.element(page.getByTestId('game-config-modal-scroll-area')).toBeVisible()
    await expect.element(page.getByTestId('game-config-game-name')).toHaveValue('Demo Game')
    await expect.element(page.getByTestId('game-config-description')).toHaveValue('An introductory story')
    await expect.element(page.getByLabelText('modals.gameConfig.fields.titleBgm.label')).toHaveValue('title.ogg')
    await expect.element(page.getByTestId('title-img-picker-value')).toHaveTextContent('cover.webp')
    await expect.element(page.getByTestId('game-logo-picker-value')).toHaveTextContent('opening.webp|enter.webp')
    await expect.element(page.getByTestId('game-config-game-key')).toHaveValue('demo-key')
    await expect.element(page.getByTestId('game-config-package-name')).toHaveValue('org.demo.game')
  })

  it('非法包名会在失焦后才显示校验信息', async () => {
    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': vi.fn(),
        ...preparedModalProps,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('game-config-package-name').fill('Demo.App')

    await expect.element(page.getByText('modals.gameConfig.validation.packageNameInvalid')).not.toBeInTheDocument()

    await page.getByTestId('game-config-steam-app-id').click()

    await expect.element(page.getByText('modals.gameConfig.validation.packageNameInvalid')).toBeVisible()
  })

  it('多行简介会在输入阶段被压成单行后再保存', async () => {
    const updateOpen = vi.fn()

    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': updateOpen,
        ...preparedModalProps,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('game-config-description').fill('Line 1\nLine 2')
    await page.getByRole('button', { name: 'common.save' }).click()

    await vi.waitFor(() => {
      expect(setConfigMock).toHaveBeenCalledWith('/games/demo', expect.objectContaining({
        set: expect.objectContaining({
          description: 'Line 1 Line 2',
        }),
      }))
    })
    expect(updateOpen).toHaveBeenCalledWith(false)
  })

  it('缺失 gameKey 的旧配置会在打开时补上 UUID，并允许直接保存', async () => {
    const randomUuidSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('22222222-2222-2222-2222-222222222222')

    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': vi.fn(),
        ...preparedModalProps,
        'initialValues': {
          ...preparedModalProps.initialValues,
          gameKey: '',
        },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('game-config-game-key')).toHaveValue('22222222-2222-2222-2222-222222222222')

    await page.getByRole('button', { name: 'common.save' }).click()

    await vi.waitFor(() => {
      expect(setConfigMock).toHaveBeenCalledWith('/games/demo', expect.objectContaining({
        set: expect.objectContaining({
          gameKey: '22222222-2222-2222-2222-222222222222',
        }),
      }))
    })

    randomUuidSpy.mockRestore()
  })

  it('已有 gameKey 时点击重新生成会立即替换', async () => {
    const randomUuidSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('33333333-3333-3333-3333-333333333333')

    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': vi.fn(),
        ...preparedModalProps,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('game-config-game-key-regenerate').click()

    await expect.element(page.getByTestId('game-config-game-key')).toHaveValue('33333333-3333-3333-3333-333333333333')
    expect(randomUuidSpy).toHaveBeenCalledTimes(1)

    randomUuidSpy.mockRestore()
  })

  it('有修改时请求关闭并选择不保存后，才真正关闭弹窗', async () => {
    const updateOpen = vi.fn()

    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': updateOpen,
        ...preparedModalProps,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'change-title-img' }).click()
    await page.getByTestId('dialog-close-request').click()

    await vi.waitFor(() => {
      expect(modalOpenMock).toHaveBeenCalledWith('SaveChangesModal', expect.objectContaining({
        title: 'modals.saveChanges.title',
        onDontSave: expect.any(Function),
        onSave: expect.any(Function),
      }))
    })
    expect(updateOpen).not.toHaveBeenCalled()

    const [, modalProps] = modalOpenMock.mock.calls[0]

    await modalProps.onDontSave()

    await vi.waitFor(() => {
      expect(updateOpen).toHaveBeenCalledWith(false)
    })
  })

  it('保存时会提交序列化后的配置补丁并关闭弹窗', async () => {
    const updateOpen = vi.fn()

    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': updateOpen,
        ...preparedModalProps,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('game-config-game-name').fill('Renamed Game')
    await page.getByTestId('game-config-description').fill('Updated description')
    await page.getByLabelText('modals.gameConfig.fields.titleBgm.label').fill('title-next.ogg')
    await page.getByRole('button', { name: 'change-title-img' }).click()
    await page.getByRole('button', { name: 'change-game-logo' }).click()
    await page.getByRole('button', { name: 'common.save' }).click()

    await vi.waitFor(() => {
      expect(setConfigMock).toHaveBeenCalledWith('/games/demo', {
        set: {
          defaultLanguage: 'zh_CN',
          description: 'Updated description',
          enableAppreciation: 'false',
          gameKey: 'demo-key',
          gameName: 'Renamed Game',
          titleImg: 'cover-next.webp',
          legacyExpressionBlendMode: 'false',
          lineHeight: '2.2',
          maxLine: '3',
          packageName: 'org.demo.game',
          gameLogo: 'enter-next.webp|logo-next.webp|',
          showPanic: 'true',
          steamAppId: '480',
          titleBgm: 'title-next.ogg',
        },
        unset: [],
      })
    })

    await vi.waitFor(() => {
      expect(notifySuccessMock).toHaveBeenCalledWith('common.saved')
      expect(updateOpen).toHaveBeenCalledWith(false)
    })
  })
})
