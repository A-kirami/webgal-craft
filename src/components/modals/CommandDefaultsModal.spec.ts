import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserInputStub,
  createBrowserTextStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

const {
  buildSingleStatementMock,
  useCommandPanelStoreMock,
  useEffectEditorDialogMock,
  useModalStoreMock,
  useStatementAnimationDialogMock,
} = vi.hoisted(() => ({
  buildSingleStatementMock: vi.fn(),
  useCommandPanelStoreMock: vi.fn(),
  useEffectEditorDialogMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  useStatementAnimationDialogMock: vi.fn(),
}))

vi.mock('~/composables/useEffectEditorDialog', () => ({
  useEffectEditorDialog: useEffectEditorDialogMock,
}))

vi.mock('~/composables/useStatementAnimationDialog', () => ({
  useStatementAnimationDialog: useStatementAnimationDialogMock,
}))
vi.mock('~/helper/command-registry/index', async importOriginal => ({
  ...(await importOriginal<typeof import('~/helper/command-registry/index')>()),
  getCommandConfig: () => ({
    label: 'setTempAnimation',
  }),
  getCommandDescription: () => 'setTempAnimation description',
  getFactoryDefaultCommandText: () => 'setTempAnimation:[{"duration":0}];',
}))

vi.mock('~/helper/webgal-script/sentence', async importOriginal => ({
  ...(await importOriginal<typeof import('~/helper/webgal-script/sentence')>()),
  buildSingleStatement: buildSingleStatementMock,
}))

vi.mock('~/stores/command-panel', () => ({
  useCommandPanelStore: useCommandPanelStoreMock,
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

import CommandDefaultsModal from './CommandDefaultsModal.vue'

const effectDialogState = {
  draftDuration: '',
  draftEase: '',
  draftTransform: {},
  handleApply: vi.fn(),
  handleTransformUpdate: vi.fn(),
  isDefault: true,
  isDirty: false,
  isOpen: false,
  requestClose: vi.fn(),
  resetToDefault: vi.fn(),
  updateDuration: vi.fn(),
  updateEase: vi.fn(),
}

const animationDialogState = {
  draftFrames: [],
  handleApply: vi.fn(),
  isDefault: true,
  isDirty: false,
  isOpen: false,
  requestClose: vi.fn(),
  resetToDefault: vi.fn(),
  updateFrames: vi.fn(),
}

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  Dialog: createBrowserContainerStub('StubDialog'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription', 'p'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter', 'footer'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader', 'header'),
  DialogScrollContent: createBrowserContainerStub('StubDialogScrollContent'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle', 'h2'),
  EffectEditorSubDialog: createBrowserTextStub('StubEffectEditorSubDialog', 'Effect Editor Sub Dialog'),
  Input: createBrowserInputStub('StubInput'),
  StatementAnimationSubDialog: createBrowserTextStub('StubStatementAnimationSubDialog', 'Statement Animation Sub Dialog'),
  StatementEditorPanel: createBrowserTextStub('StubStatementEditorPanel', 'Statement Editor Panel'),
}

describe('CommandDefaultsModal', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    buildSingleStatementMock.mockReset()
    useCommandPanelStoreMock.mockReset()
    useEffectEditorDialogMock.mockReset()
    useModalStoreMock.mockReset()
    useStatementAnimationDialogMock.mockReset()

    buildSingleStatementMock.mockReturnValue({
      id: 1,
      parsed: undefined,
      parseError: false,
      rawText: 'setTempAnimation:[{"duration":0}];',
    })
    useCommandPanelStoreMock.mockReturnValue({
      getInsertText: vi.fn(() => 'setTempAnimation:[{"duration":0}];'),
      resetDefault: vi.fn(),
      saveDefault: vi.fn(),
    })
    useEffectEditorDialogMock.mockReturnValue(effectDialogState)
    useModalStoreMock.mockReturnValue({
      open: vi.fn(),
    })
    useStatementAnimationDialogMock.mockReturnValue(animationDialogState)
  })

  it('在命令默认值弹窗中接入动画编辑器子对话框提供器', async () => {
    renderInBrowser(CommandDefaultsModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        type: commandType.setTempAnimation,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('Statement Editor Panel')).toBeInTheDocument()
    await expect.element(page.getByText('Statement Animation Sub Dialog')).toBeInTheDocument()
    expect(useStatementAnimationDialogMock).toHaveBeenCalledTimes(1)
  })
})
