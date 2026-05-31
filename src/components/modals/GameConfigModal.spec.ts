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
  workspaceStoreState,
} = vi.hoisted(() => ({
  modalOpenMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  setConfigMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  workspaceStoreState: {
    currentGame: undefined as unknown,
  },
}))

vi.mock('~/services/config-manager', () => ({
  configManager: {
    setConfig: setConfigMock,
  },
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: () => workspaceStoreState,
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
    customConfig: [],
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
  unmanagedLineCount: 0,
  serveUrl: 'http://127.0.0.1:8899/game/demo/',
} as const

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  AssetImage: defineComponent({
    name: 'StubAssetImage',
    props: {
      alt: {
        type: String,
        default: '',
      },
      cacheVersion: {
        type: Number,
        default: undefined,
      },
      path: {
        type: String,
        default: '',
      },
    },
    setup(props) {
      return () => h('img', {
        'alt': props.alt,
        'data-cache-version': props.cacheVersion,
        'data-path': props.path,
      })
    },
  }),
  IconEditorDialog: defineComponent({
    name: 'StubIconEditorDialog',
    props: {
      open: {
        type: Boolean,
        default: false,
      },
    },
    emits: ['update:open'],
    setup(props) {
      return () => h('div', {
        'data-open': String(props.open),
        'data-testid': 'icon-editor-dialog-stub',
      })
    },
  }),
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
    workspaceStoreState.currentGame = undefined
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

  it('点击图标图片入口会打开图标编辑器', async () => {
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

    await page.getByTestId('game-config-icon-editor-surface').click()
    await expect.element(page.getByTestId('icon-editor-dialog-stub')).toHaveAttribute('data-open', 'true')
  })

  it('使用当前游戏快照中的图标预览路径', async () => {
    workspaceStoreState.currentGame = {
      id: 'game-vfs',
      path: '/games/vfs',
      pathLookupKey: '/games/vfs',
      createdAt: 0,
      lastModified: 0,
      status: 'created',
      availability: 'available',
      metadata: {
        name: 'VFS Game',
      },
      previewAssets: {
        icon: {
          path: 'icons/icon-512.png',
          cacheVersion: 789,
        },
        cover: {
          path: 'game/background/cover.png',
        },
      },
    }

    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': vi.fn(),
        ...preparedModalProps,
        'backgroundRootPath': '/games/vfs/game/background',
        'bgmRootPath': '/games/vfs/game/bgm',
        'gamePath': '/games/vfs',
        'game': {
          id: 'game-vfs',
          path: '/games/vfs',
          pathLookupKey: '/games/vfs',
          createdAt: 0,
          lastModified: 0,
          status: 'created',
          availability: 'available',
          metadata: {
            name: 'VFS Game',
          },
          previewAssets: {
            icon: {
              path: 'icons/icon-192.png',
              cacheVersion: 456,
            },
            cover: {
              path: 'game/background/cover.png',
            },
          },
        },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByAltText('modals.gameConfig.iconEditor.previewAlt')).toHaveAttribute('data-path', 'icons/icon-512.png')
    await expect.element(page.getByAltText('modals.gameConfig.iconEditor.previewAlt')).toHaveAttribute('data-cache-version', '789')
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
        'initialValues': {
          ...preparedModalProps.initialValues,
          customConfig: [
            {
              key: 'Stage_Width',
              value: '1920',
            },
          ],
        },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('game-config-description').fill('Line 1\nLine 2')
    await page.getByRole('button', { name: 'common.save' }).click()

    await vi.waitFor(() => {
      expect(setConfigMock).toHaveBeenCalledWith('/games/demo', expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({
            key: 'Description',
            value: 'Line 1 Line 2',
          }),
        ]),
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
        entries: expect.arrayContaining([
          expect.objectContaining({
            key: 'Game_key',
            value: '22222222-2222-2222-2222-222222222222',
          }),
        ]),
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
        'initialValues': {
          ...preparedModalProps.initialValues,
          customConfig: [
            {
              key: 'Stage_Width',
              value: '1920',
            },
          ],
        },
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

  it('打开时会渲染自定义配置项并显示未托管配置提示', async () => {
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
          customConfig: [
            {
              key: 'Custom_flag',
              value: 'enabled',
            },
          ],
        },
        'unmanagedLineCount': 2,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('game-config-custom-key-0')).toHaveValue('Custom_flag')
    await expect.element(page.getByTestId('game-config-custom-value-0')).toHaveValue('enabled')
    await expect.element(page.getByTestId('game-config-unmanaged-notice')).toBeVisible()
    await expect.element(page.getByTestId('game-config-custom-section')).toBeVisible()
  })

  it('底部添加的自定义配置项会随保存一起提交', async () => {
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

    await page.getByTestId('game-config-custom-add').click()
    await page.getByTestId('game-config-custom-key-0').fill('Custom_flag')
    await page.getByTestId('game-config-custom-value-0').fill('enabled')
    await page.getByRole('button', { name: 'common.save' }).click()

    await vi.waitFor(() => {
      expect(setConfigMock).toHaveBeenCalledWith('/games/demo', expect.objectContaining({
        entries: expect.arrayContaining([
          {
            key: 'Custom_flag',
            value: 'enabled',
          },
        ]),
      }))
    })
  })

  it('清空自定义配置列表后仍可直接保存', async () => {
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
          customConfig: [
            {
              key: 'Custom_flag',
              value: 'enabled',
            },
          ],
        },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('game-config-custom-remove-0').click()
    await page.getByRole('button', { name: 'common.save' }).click()

    await vi.waitFor(() => {
      expect(setConfigMock).toHaveBeenCalledWith('/games/demo', expect.objectContaining({
        entries: expect.not.arrayContaining([
          expect.objectContaining({
            key: 'Custom_flag',
          }),
        ]),
      }))
    })
  })

  it('保存时会提交编辑结果并关闭弹窗', async () => {
    const updateOpen = vi.fn()
    const initialValues = {
      ...preparedModalProps.initialValues,
      customConfig: [
        {
          key: 'Stage_Width',
          value: '1920',
        },
      ],
    } as const

    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': updateOpen,
        ...preparedModalProps,
        initialValues,
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
      expect(setConfigMock).toHaveBeenCalledTimes(1)
      expect(setConfigMock).toHaveBeenCalledWith('/games/demo', expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({
            key: 'Game_name',
            value: 'Renamed Game',
          }),
          expect.objectContaining({
            key: 'Description',
            value: 'Updated description',
          }),
          expect.objectContaining({
            key: 'Title_img',
            value: 'cover-next.webp',
          }),
          expect.objectContaining({
            key: 'Title_bgm',
            value: 'title-next.ogg',
          }),
          expect.objectContaining({
            key: 'Game_Logo',
            value: 'enter-next.webp|logo-next.webp',
          }),
          expect.objectContaining({
            key: 'Stage_Width',
            value: '1920',
          }),
        ]),
      }))
    })

    await vi.waitFor(() => {
      expect(notifySuccessMock).toHaveBeenCalledWith('common.saved')
      expect(updateOpen).toHaveBeenCalledWith(false)
    })
  })
})
