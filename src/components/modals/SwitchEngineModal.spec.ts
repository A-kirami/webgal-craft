import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { createTestEngine, createTestGame } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'

import SwitchEngineModal from './SwitchEngineModal.vue'

import type { ProjectConfig } from '~/types/project-config'

const {
  dbEngineGetMock,
  engineSwitchMock,
  evaluateTemplateStrategyMock,
  notifySuccessMock,
  readProjectConfigMock,
  refreshCurrentGameSnapshotMock,
  updateOpenMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  dbEngineGetMock: vi.fn(),
  engineSwitchMock: vi.fn(),
  evaluateTemplateStrategyMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  readProjectConfigMock: vi.fn(),
  refreshCurrentGameSnapshotMock: vi.fn(),
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
    case 'modals.switchEngine.title': {
      return '切换引擎'
    }
    case 'modals.switchEngine.description': {
      return '为当前项目切换引擎版本。'
    }
    case 'modals.switchEngine.switching': {
      return '正在切换引擎...'
    }
    case 'modals.switchEngine.engineLabel': {
      return '引擎'
    }
    case 'modals.switchEngine.failed.title': {
      return '切换失败'
    }
    case 'modals.switchEngine.failed.description': {
      return '可以重试，或者取消后稍后再试。'
    }
    case 'modals.switchEngine.failed.missingEngine': {
      return '所选引擎已不存在'
    }
    case 'modals.switchEngine.failed.cancel': {
      return '取消'
    }
    case 'modals.switchEngine.failed.retry': {
      return '重试'
    }
    case 'modals.switchEngine.templateDirty.title': {
      return '模板已修改'
    }
    case 'modals.switchEngine.templateDirty.description': {
      return '选择保留或丢弃模板改动。'
    }
    case 'modals.switchEngine.templateDirty.discard': {
      return '丢弃模板改动'
    }
    case 'modals.switchEngine.templateDirty.keep': {
      return '保留模板改动'
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

vi.mock('~/services/engine-switch', () => ({
  engineSwitch: {
    switchEngine: engineSwitchMock,
  },
}))

vi.mock('~/services/template-switch', () => ({
  templateSwitch: {
    evaluateTemplateStrategy: evaluateTemplateStrategyMock,
  },
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('notivue', () => ({
  push: {
    success: notifySuccessMock,
  },
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  attachConsole: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('vue-i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: translate,
  }),
}))

const globalStubs = {
  AlertDialog: createBrowserContainerStub('StubAlertDialog'),
  AlertDialogAction: createBrowserClickStub('StubAlertDialogAction'),
  AlertDialogCancel: createBrowserClickStub('StubAlertDialogCancel'),
  AlertDialogContent: createBrowserContainerStub('StubAlertDialogContent'),
  AlertDialogDescription: createBrowserContainerStub('StubAlertDialogDescription'),
  AlertDialogFooter: createBrowserContainerStub('StubAlertDialogFooter'),
  AlertDialogHeader: createBrowserContainerStub('StubAlertDialogHeader'),
  AlertDialogTitle: createBrowserContainerStub('StubAlertDialogTitle'),
  Button: createBrowserClickStub('StubButton'),
  Dialog: createBrowserContainerStub('StubDialog'),
  DialogClose: createBrowserContainerStub('StubDialogClose'),
  DialogContent: createBrowserContainerStub('StubDialogContent'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle'),
  EngineSelector: defineComponent({
    name: 'StubEngineSelector',
    props: {
      modelValue: {
        type: String,
        default: undefined,
      },
      preferredEngineId: {
        type: String,
        default: undefined,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('div', {
        'data-testid': 'engine-selector',
        'data-model-value': props.modelValue ?? '',
        'data-preferred-engine-id': props.preferredEngineId ?? '',
      }, [
        h('button', {
          'type': 'button',
          'data-testid': 'select-new-engine',
          'onClick': () => emit('update:modelValue', 'engine-new'),
        }, 'select-engine-new'),
      ])
    },
  }),
  Label: createBrowserContainerStub('StubLabel', 'label'),
}

const OLD_CONFIG: ProjectConfig = {
  version: 1,
  engine: { id: 'open-webgal.webgal', version: '4.5.0' },
}

function renderSwitchEngineModal() {
  const game = createTestGame({
    id: 'game-1',
    engineId: 'engine-current',
    path: AbsPath.from('/games/demo'),
  })

  renderInBrowser(SwitchEngineModal, {
    props: {
      game,
      'open': true,
      'onUpdate:open': updateOpenMock,
    },
    global: {
      mocks: {
        $t: translate,
      },
      stubs: globalStubs,
    },
  })

  return game
}

describe('SwitchEngineModal', () => {
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
    const newEngine = createTestEngine({
      id: 'engine-new',
      engineId: 'open-webgal.webgal',
      name: 'WebGAL',
      version: '4.6.0',
    })

    dbEngineGetMock.mockImplementation(async (engineId: string) => {
      if (engineId === 'engine-current') {
        return currentEngine
      }
      if (engineId === 'engine-new') {
        return newEngine
      }
      return
    })
    readProjectConfigMock.mockResolvedValue(OLD_CONFIG)
    evaluateTemplateStrategyMock.mockResolvedValue('clean')
    engineSwitchMock.mockResolvedValue(undefined)
    refreshCurrentGameSnapshotMock.mockResolvedValue(undefined)
    useWorkspaceStoreMock.mockReturnValue({
      currentGame,
      refreshCurrentGameSnapshot: refreshCurrentGameSnapshotMock,
    })
  })

  it('初始化失败时会进入失败态，并允许重试初始化', async () => {
    readProjectConfigMock
      .mockRejectedValueOnce(new Error('init failed'))
      .mockResolvedValueOnce(OLD_CONFIG)

    renderSwitchEngineModal()

    await expect.element(page.getByText('切换失败')).toBeInTheDocument()
    await expect.element(page.getByText('init failed')).toBeInTheDocument()

    await page.getByRole('button', { name: '重试' }).click()

    await expect.element(page.getByTestId('engine-selector')).toBeInTheDocument()
    await vi.waitFor(() => {
      expect(readProjectConfigMock).toHaveBeenCalledTimes(2)
    })
    expect(evaluateTemplateStrategyMock).toHaveBeenCalledTimes(1)

    await expect.element(page.getByRole('button', { name: '确认' })).toBeDisabled()
    await page.getByTestId('select-new-engine').click()
    await expect.element(page.getByRole('button', { name: '确认' })).toBeEnabled()
  })

  it('切换失败后的重试会继续重试切换，而不是重新初始化', async () => {
    engineSwitchMock
      .mockRejectedValueOnce(new Error('switch failed'))
      .mockResolvedValueOnce(undefined)

    renderSwitchEngineModal()

    await page.getByTestId('select-new-engine').click()
    await page.getByRole('button', { name: '确认' }).click()

    await expect.element(page.getByText('switch failed')).toBeInTheDocument()

    await page.getByRole('button', { name: '重试' }).click()

    await vi.waitFor(() => {
      expect(engineSwitchMock).toHaveBeenCalledTimes(2)
    })
    expect(readProjectConfigMock).toHaveBeenCalledTimes(1)
    expect(evaluateTemplateStrategyMock).toHaveBeenCalledTimes(1)
  })

  it('切换当前工作区游戏后会刷新当前快照', async () => {
    renderSwitchEngineModal()

    await page.getByTestId('select-new-engine').click()
    await page.getByRole('button', { name: '确认' }).click()

    await vi.waitFor(() => {
      expect(engineSwitchMock).toHaveBeenCalledTimes(1)
      expect(refreshCurrentGameSnapshotMock).toHaveBeenCalledTimes(1)
    })
  })

  it('目标引擎已不存在时会进入失败态并展示错误', async () => {
    dbEngineGetMock.mockImplementation(async (engineId: string) => {
      if (engineId === 'engine-current') {
        return createTestEngine({
          id: 'engine-current',
          engineId: 'open-webgal.webgal',
          name: 'WebGAL',
          version: '4.5.0',
        })
      }
      return
    })

    renderSwitchEngineModal()

    await page.getByTestId('select-new-engine').click()
    await page.getByRole('button', { name: '确认' }).click()

    await expect.element(page.getByText('切换失败')).toBeInTheDocument()
    await expect.element(page.getByText('所选引擎已不存在')).toBeInTheDocument()
  })

  it('刷新当前快照失败时仍然保持切换成功', async () => {
    refreshCurrentGameSnapshotMock.mockRejectedValueOnce(new Error('refresh failed'))

    renderSwitchEngineModal()

    await page.getByTestId('select-new-engine').click()
    await page.getByRole('button', { name: '确认' }).click()

    await vi.waitFor(() => {
      expect(engineSwitchMock).toHaveBeenCalledTimes(1)
      expect(refreshCurrentGameSnapshotMock).toHaveBeenCalledTimes(1)
      expect(notifySuccessMock).toHaveBeenCalledTimes(1)
      expect(updateOpenMock).toHaveBeenCalledWith(false)
    })

    await expect.element(page.getByText('切换失败')).not.toBeInTheDocument()
  })

  it('templateStrategy 为 dirty 时确认会先弹出模板改动确认', async () => {
    evaluateTemplateStrategyMock.mockResolvedValue('dirty')

    renderSwitchEngineModal()

    await page.getByTestId('select-new-engine').click()
    await page.getByRole('button', { name: '确认' }).click()

    await expect.element(page.getByText('模板已修改')).toBeInTheDocument()
    expect(engineSwitchMock).not.toHaveBeenCalled()
  })

  it('dirty 模板下选择保留改动会以 keep 调用 switchEngine', async () => {
    evaluateTemplateStrategyMock.mockResolvedValue('dirty')

    renderSwitchEngineModal()

    await page.getByTestId('select-new-engine').click()
    await page.getByRole('button', { name: '确认' }).click()
    await page.getByRole('button', { name: '保留模板改动' }).click()

    await vi.waitFor(() => {
      expect(engineSwitchMock).toHaveBeenCalledTimes(1)
    })
    expect(engineSwitchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { templateDecision: 'keep' },
    )
  })

  it('dirty 模板下选择丢弃改动会以 discard 调用 switchEngine', async () => {
    evaluateTemplateStrategyMock.mockResolvedValue('dirty')

    renderSwitchEngineModal()

    await page.getByTestId('select-new-engine').click()
    await page.getByRole('button', { name: '确认' }).click()
    await page.getByRole('button', { name: '丢弃模板改动' }).click()

    await vi.waitFor(() => {
      expect(engineSwitchMock).toHaveBeenCalledTimes(1)
    })
    expect(engineSwitchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { templateDecision: 'discard' },
    )
  })

  it('dirty 模板切换失败后重试会复用之前的 templateDecision', async () => {
    evaluateTemplateStrategyMock.mockResolvedValue('dirty')
    engineSwitchMock
      .mockRejectedValueOnce(new Error('switch failed'))
      .mockResolvedValueOnce(undefined)

    renderSwitchEngineModal()

    await page.getByTestId('select-new-engine').click()
    await page.getByRole('button', { name: '确认' }).click()
    await page.getByRole('button', { name: '保留模板改动' }).click()

    await expect.element(page.getByText('switch failed')).toBeInTheDocument()

    await page.getByRole('button', { name: '重试' }).click()

    await vi.waitFor(() => {
      expect(engineSwitchMock).toHaveBeenCalledTimes(2)
    })
    expect(engineSwitchMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      { templateDecision: 'keep' },
    )
  })
})
