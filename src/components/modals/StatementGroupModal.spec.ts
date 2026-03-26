import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserInputStub,
  createBrowserTextStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

const {
  useCommandPanelStoreMock,
  useEffectEditorDialogMock,
  useModalStoreMock,
  useStatementAnimationDialogMock,
} = vi.hoisted(() => ({
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
  commandEntries: [],
  commandPanelCategories: [],
  getCategoryLabel: () => 'Effect',
  getFactoryDefaultCommandText: () => 'setTempAnimation:[{"duration":0}];',
}))

vi.mock('~/helper/webgal-script/sentence', async importOriginal => ({
  ...(await importOriginal<typeof import('~/helper/webgal-script/sentence')>()),
  buildSingleStatement: (rawText: string) => ({
    id: rawText.length,
    parsed: undefined,
    parseError: false,
    rawText,
  }),
}))

vi.mock('~/stores/command-panel', () => ({
  useCommandPanelStore: useCommandPanelStoreMock,
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/utils/speaker', async importOriginal => ({
  ...(await importOriginal<typeof import('~/utils/speaker')>()),
  buildPreviousSpeakers: () => [''],
}))

import StatementGroupModal from './StatementGroupModal.vue'

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
  ScrollArea: createBrowserContainerStub('StubScrollArea'),
  StatementAnimationSubDialog: createBrowserTextStub('StubStatementAnimationSubDialog', 'Statement Animation Sub Dialog'),
  VisualEditorStatementCard: createBrowserTextStub('StubVisualEditorStatementCard', 'Visual Editor Statement Card'),
}

describe('StatementGroupModal', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    useCommandPanelStoreMock.mockReset()
    useEffectEditorDialogMock.mockReset()
    useModalStoreMock.mockReset()
    useStatementAnimationDialogMock.mockReset()

    useCommandPanelStoreMock.mockReturnValue({
      saveGroup: vi.fn(),
    })
    useEffectEditorDialogMock.mockReturnValue(effectDialogState)
    useModalStoreMock.mockReturnValue({
      open: vi.fn(),
    })
    useStatementAnimationDialogMock.mockReturnValue(animationDialogState)
  })

  it('在语句组弹窗中接入动画编辑器子对话框提供器', async () => {
    renderInBrowser(StatementGroupModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        group: {
          createdAt: Date.parse('2026-03-23T00:00:00Z'),
          id: 'group-1',
          name: 'Group 1',
          rawTexts: ['setTempAnimation:[{"duration":0}];'],
        },
        open: true,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('Visual Editor Statement Card')).toBeInTheDocument()
    await expect.element(page.getByText('Statement Animation Sub Dialog')).toBeInTheDocument()
    expect(useStatementAnimationDialogMock).toHaveBeenCalledTimes(1)
  })
})
