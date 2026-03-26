import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserTextStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import StatementAnimationSubDialog from './StatementAnimationSubDialog.vue'

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  Dialog: createBrowserContainerStub('StubDialog'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription', 'p'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter', 'footer'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader', 'header'),
  DialogScrollContent: createBrowserContainerStub('StubDialogScrollContent'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle', 'h2'),
  StatementAnimationEditorPanel: createBrowserTextStub('StubStatementAnimationEditorPanel', 'Statement Animation Editor Panel'),
}

function createDialogScrollContentStub() {
  const state = {
    defaultPrevented: undefined as boolean | undefined,
  }

  const stub = defineComponent({
    name: 'StubDialogScrollContent',
    emits: ['openAutoFocus'],
    setup(_, { emit, slots }) {
      onMounted(() => {
        const event = new Event('open-auto-focus', { cancelable: true })
        emit('openAutoFocus', event)
        state.defaultPrevented = event.defaultPrevented
      })

      return () => h('div', slots.default?.())
    },
  })

  return {
    state,
    stub,
  }
}

describe('StatementAnimationSubDialog', () => {
  it('在弹窗头部复用共享的动画说明文案', async () => {
    renderInBrowser(StatementAnimationSubDialog, {
      browser: {
        i18nMode: 'localized',
      },
      props: {
        animationDialog: {
          draftFrames: [],
          handleApply: vi.fn(),
          isDefault: true,
          isDirty: false,
          isOpen: true,
          requestClose: vi.fn(),
          resetToDefault: vi.fn(),
          updateFrames: vi.fn(),
        },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('heading', { name: '动画编辑器' })).toBeInTheDocument()
    await expect.element(page.getByText('调整当前动画各关键帧的时长、缓动和变换')).toBeInTheDocument()
    await expect.element(page.getByText('高级动画')).not.toBeInTheDocument()
  })

  it('打开时不会阻止对话框内容接管键盘焦点', async () => {
    const { state, stub } = createDialogScrollContentStub()

    renderInBrowser(StatementAnimationSubDialog, {
      browser: {
        i18nMode: 'localized',
      },
      props: {
        animationDialog: {
          draftFrames: [],
          handleApply: vi.fn(),
          isDefault: true,
          isDirty: false,
          isOpen: true,
          requestClose: vi.fn(),
          resetToDefault: vi.fn(),
          updateFrames: vi.fn(),
        },
      },
      global: {
        stubs: {
          ...globalStubs,
          DialogScrollContent: stub,
        },
      },
    })

    await expect.poll(() => state.defaultPrevented).toBe(false)
  })
})
