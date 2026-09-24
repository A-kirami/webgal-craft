import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import { clickOutsideDialog, withRealDialogStubs } from '~/__tests__/browser-dialog'
import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { createTestEngine, createTestGame } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'

import SwitchTemplateModal from './SwitchTemplateModal.vue'

import type { ProjectConfig } from '~/types/project-config'

const {
  dbEngineGetMock,
  handleErrorMock,
  isTemplateDirtyMock,
  readProjectConfigMock,
  resetTemplateMock,
  refreshCurrentGameSnapshotMock,
  switchTemplateMock,
  updateOpenMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  dbEngineGetMock: vi.fn(),
  handleErrorMock: vi.fn(),
  isTemplateDirtyMock: vi.fn(),
  readProjectConfigMock: vi.fn(),
  resetTemplateMock: vi.fn(),
  refreshCurrentGameSnapshotMock: vi.fn(),
  switchTemplateMock: vi.fn(),
  updateOpenMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

function translate(key: string): string {
  switch (key) {
    case 'common.cancel': {
      return '取消'
    }
    case 'common.confirm': {
      return '确认'
    }
    case 'modals.switchTemplate.title': {
      return '切换模板'
    }
    case 'modals.switchTemplate.selectTemplate': {
      return '选择要切换的游戏模板'
    }
    case 'modals.switchTemplate.templateLabel': {
      return '游戏模板'
    }
    case 'modals.switchTemplate.reset.label': {
      return '重置模板'
    }
    case 'modals.switchTemplate.reset.title': {
      return '重置当前模板'
    }
    case 'modals.switchTemplate.reset.description': {
      return '此操作会清空当前项目 game/template/ 下的所有覆盖内容，包括新增、修改、未保存和删除的文件，并恢复为当前模板的初始状态。'
    }
    case 'modals.switchTemplate.dirtyWarning': {
      return '当前模板已被修改，切换将清除所有修改。'
    }
    case 'modals.switchTemplate.dirtyUnsavedWarning': {
      return '当前打开但尚未保存的模板文件也会被关闭，未保存内容将丢失。确定要继续吗？'
    }
    case 'modals.switchTemplate.reset.confirm': {
      return '确认重置'
    }
    case 'modals.switchTemplate.reset.error': {
      return '模板重置失败'
    }
    default: {
      return key
    }
  }
}

vi.mock('~/commands/project-config', () => ({
  projectConfigCmds: {
    readProjectConfig: readProjectConfigMock,
  },
}))

vi.mock('~/database/db', () => ({
  db: {
    engines: {
      get: dbEngineGetMock,
    },
  },
}))

vi.mock('~/services/template-switch', () => ({
  templateSwitch: {
    isTemplateDirty: isTemplateDirtyMock,
    resetTemplate: resetTemplateMock,
    switchTemplate: switchTemplateMock,
  },
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: handleErrorMock,
}))

vi.mock('vue-i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: translate,
  }),
}))

const AlertDialogStub = defineComponent({
  name: 'StubAlertDialog',
  props: {
    open: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { slots }) {
    return () => props.open ? h('div', slots.default?.()) : undefined
  },
})

const OTHER_STANDALONE_BINDING = { kind: 'standalone', name: 'Other' } as const

const TemplateSelectorStub = defineComponent({
  name: 'StubTemplateSelector',
  props: {
    modelValue: {
      type: Object,
      default: undefined,
    },
    engineId: {
      type: String,
      default: undefined,
    },
    disabled: {
      type: Boolean,
      default: undefined,
    },
  },
  emits: ['update:modelValue'],
  setup(_, { emit }) {
    return () => h('div', [
      h('button', {
        'type': 'button',
        'data-testid': 'select-other-template',
        'onClick': () => emit('update:modelValue', OTHER_STANDALONE_BINDING),
      }, 'select-other-template'),
      h('button', {
        'type': 'button',
        'data-testid': 'select-same-engine-binding',
        'onClick': () => emit('update:modelValue', {
          kind: 'engineBuiltin',
          engine: { id: 'open-webgal.webgal', version: '4.5.0' },
        }),
      }, 'select-same-engine-binding'),
    ])
  },
})

const globalStubs = {
  AlertDialog: AlertDialogStub,
  AlertDialogAction: createBrowserClickStub('StubAlertDialogAction'),
  AlertDialogCancel: createBrowserClickStub('StubAlertDialogCancel'),
  AlertDialogContent: createBrowserContainerStub('StubAlertDialogContent'),
  AlertDialogDescription: createBrowserContainerStub('StubAlertDialogDescription'),
  AlertDialogFooter: createBrowserContainerStub('StubAlertDialogFooter'),
  AlertDialogHeader: createBrowserContainerStub('StubAlertDialogHeader'),
  AlertDialogTitle: createBrowserContainerStub('StubAlertDialogTitle', 'h2'),
  Button: createBrowserClickStub('StubButton'),
  Dialog: createBrowserContainerStub('StubDialog'),
  DialogClose: createBrowserContainerStub('StubDialogClose'),
  DialogContent: createBrowserContainerStub('StubDialogContent'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle', 'h2'),
  Label: createBrowserContainerStub('StubLabel', 'label'),
  TemplateSelector: TemplateSelectorStub,
}

const stubsWithRealDialog = withRealDialogStubs(globalStubs)

function renderSwitchTemplateModal(options: { realDialog?: boolean } = {}) {
  const game = createTestGame({
    id: 'game-1',
    engineId: 'engine-current',
    path: AbsPath.from('/games/demo'),
  })

  renderInBrowser(SwitchTemplateModal, {
    props: {
      game,
      'open': true,
      'onUpdate:open': updateOpenMock,
    },
    global: {
      mocks: {
        $t: translate,
      },
      stubs: options.realDialog ? stubsWithRealDialog : globalStubs,
    },
  })

  return game
}

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 用受控 open 渲染弹窗，用于验证关闭后未销毁又立即重开（实例复用）时的行为 */
function renderReopenableModal() {
  const open = ref(true)
  const game = createTestGame({
    id: 'game-1',
    engineId: 'engine-current',
    path: AbsPath.from('/games/demo'),
  })

  const Host = defineComponent({
    name: 'SwitchTemplateModalHost',
    setup() {
      return () => h(SwitchTemplateModal, {
        game,
        'open': open.value,
        'onUpdate:open': (value: boolean | undefined) => {
          open.value = value ?? false
        },
      })
    },
  })

  renderInBrowser(Host, {
    global: {
      mocks: {
        $t: translate,
      },
      stubs: globalStubs,
    },
  })

  return open
}

describe('SwitchTemplateModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    const currentGame = createTestGame({
      id: 'game-1',
      engineId: 'engine-current',
      path: AbsPath.from('/games/demo'),
    })
    const currentEngine = createTestEngine({
      id: 'engine-current',
      engineId: 'open-webgal.webgal',
      name: 'WebGAL',
      version: '4.5.0',
    })

    dbEngineGetMock.mockResolvedValue(currentEngine)
    handleErrorMock.mockReset()
    isTemplateDirtyMock.mockResolvedValue(true)
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: { id: 'open-webgal.webgal', version: '4.5.0' },
    })
    refreshCurrentGameSnapshotMock.mockResolvedValue(undefined)
    resetTemplateMock.mockResolvedValue(undefined)
    switchTemplateMock.mockResolvedValue(undefined)
    useWorkspaceStoreMock.mockReturnValue({
      currentGame,
      refreshCurrentGameSnapshot: refreshCurrentGameSnapshotMock,
    })
  })

  it('选择与项目当前独立模板一致时确认按钮禁用，改动后启用', async () => {
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: { id: 'open-webgal.webgal', version: '4.5.0' },
      template: { kind: 'standalone', name: 'Current' },
    })

    renderSwitchTemplateModal()

    await expect.element(page.getByRole('button', { name: '确认', exact: true })).toBeDisabled()

    await page.getByTestId('select-other-template').click()

    await expect.element(page.getByRole('button', { name: '确认', exact: true })).toBeEnabled()
  })

  it('选择与当前引擎内置模板一致时确认按钮保持禁用', async () => {
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: { id: 'open-webgal.webgal', version: '4.5.0' },
      template: { kind: 'engineBuiltin', engine: { id: 'open-webgal.webgal', version: '4.5.0' } },
    })

    renderSwitchTemplateModal()

    await expect.element(page.getByRole('button', { name: '确认', exact: true })).toBeDisabled()

    // 选择器回传的是内容相同的新对象，仍应判定为未改动
    await page.getByTestId('select-same-engine-binding').click()

    await expect.element(page.getByRole('button', { name: '确认', exact: true })).toBeDisabled()
  })

  it('工程配置读取失败时确认按钮保持禁用', async () => {
    readProjectConfigMock.mockRejectedValue(new Error('read failed'))

    renderSwitchTemplateModal()

    await page.getByTestId('select-other-template').click()

    await expect.element(page.getByRole('button', { name: '确认', exact: true })).toBeDisabled()
  })

  it('实例复用时重新打开，配置读取完成前确认按钮不可用', async () => {
    const reopening = createDeferred()
    readProjectConfigMock
      .mockResolvedValueOnce({
        version: 1,
        engine: { id: 'open-webgal.webgal', version: '4.5.0' },
        template: { kind: 'standalone', name: 'Current' },
      })
      .mockReturnValueOnce(reopening.promise)

    const open = renderReopenableModal()

    await page.getByTestId('select-other-template').click()
    await expect.element(page.getByRole('button', { name: '确认', exact: true })).toBeEnabled()

    open.value = false
    await nextTick()
    open.value = true
    await nextTick()

    await expect.element(page.getByRole('button', { name: '确认', exact: true })).toBeDisabled()
  })

  it('重开时未完成的首次绑定读取不会覆盖当前状态', async () => {
    const firstRead = createDeferred<ProjectConfig>()
    readProjectConfigMock
      .mockReturnValueOnce(firstRead.promise)
      .mockRejectedValueOnce(new Error('read failed'))

    const open = renderReopenableModal()

    await vi.waitFor(() => {
      expect(readProjectConfigMock).toHaveBeenCalledTimes(1)
    })

    open.value = false
    await nextTick()
    open.value = true
    await vi.waitFor(() => {
      expect(readProjectConfigMock).toHaveBeenCalledTimes(2)
    })

    firstRead.resolve({
      version: 1,
      engine: { id: 'open-webgal.webgal', version: '4.5.0' },
      template: { kind: 'standalone', name: 'Current' },
    })
    await nextTick()

    await page.getByTestId('select-other-template').click()

    await expect.element(page.getByRole('button', { name: '确认', exact: true })).toBeDisabled()
  })

  it('点击重置入口时先展示影响范围确认，不会立即清理模板', async () => {
    renderSwitchTemplateModal()

    await expect.element(page.getByRole('button', { name: '重置模板' })).toBeEnabled()
    await expect.element(page.getByRole('button', { name: '确认重置' })).not.toBeInTheDocument()
    await page.getByRole('button', { name: '重置模板' }).click()

    await expect.element(page.getByRole('heading', { name: '重置当前模板' })).toBeInTheDocument()
    await expect.element(
      page.getByText('此操作会清空当前项目 game/template/ 下的所有覆盖内容，包括新增、修改、未保存和删除的文件，并恢复为当前模板的初始状态。', { exact: true }),
    ).toBeInTheDocument()
    expect(resetTemplateMock).not.toHaveBeenCalled()
  })

  it('模板没有覆盖内容时隐藏重置入口', async () => {
    isTemplateDirtyMock.mockResolvedValue(false)

    renderSwitchTemplateModal()

    await expect.element(page.getByRole('button', { name: '重置模板' })).not.toBeInTheDocument()
  })

  it('确认重置后清理当前模板并隐藏入口', async () => {
    const game = renderSwitchTemplateModal()

    await expect.element(page.getByRole('button', { name: '重置模板' })).toBeEnabled()
    await page.getByRole('button', { name: '重置模板' }).click()
    await page.getByRole('button', { name: '确认重置' }).click()

    await vi.waitFor(() => {
      expect(resetTemplateMock).toHaveBeenCalledWith(game.path)
    })
    await expect.element(page.getByRole('button', { name: '重置模板' })).not.toBeInTheDocument()
  })

  it('重置失败时通过错误处理器反馈失败原因', async () => {
    resetTemplateMock.mockRejectedValueOnce(new Error('reset failed'))

    renderSwitchTemplateModal()

    await expect.element(page.getByRole('button', { name: '重置模板' })).toBeEnabled()
    await page.getByRole('button', { name: '重置模板' }).click()
    await page.getByRole('button', { name: '确认重置' }).click()

    await vi.waitFor(() => {
      expect(handleErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        { context: '模板重置失败' },
      )
    })
  })

  it('切换进行中关闭按钮、Escape 与点击遮罩都不会关闭弹窗，切换失败后恢复可关闭', async () => {
    isTemplateDirtyMock.mockResolvedValue(false)
    const switching = createDeferred()
    switchTemplateMock.mockImplementation(() => switching.promise)

    renderSwitchTemplateModal({ realDialog: true })

    await page.getByTestId('select-other-template').click()
    await page.getByRole('button', { name: '确认', exact: true }).click()
    await vi.waitFor(() => {
      expect(switchTemplateMock).toHaveBeenCalledTimes(1)
    })

    await expect.element(page.getByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await clickOutsideDialog()
    expect(updateOpenMock).not.toHaveBeenCalled()

    // 失败后关闭能力恢复，Escape 能重新请求关闭
    switching.reject(new Error('switch failed'))
    await vi.waitFor(() => {
      expect(handleErrorMock).toHaveBeenCalled()
    })

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => {
      expect(updateOpenMock).toHaveBeenCalledWith(false)
    })
  })
})
