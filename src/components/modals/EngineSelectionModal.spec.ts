import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import EngineSelectionModal from './EngineSelectionModal.vue'

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
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
  DialogContent: createBrowserContainerStub('StubDialogContent'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle'),
  EngineSelector: defineComponent({
    name: 'StubEngineSelector',
    props: {
      preferredEngineId: {
        type: String,
        default: undefined,
      },
    },
    setup(props) {
      return () => h('div', {
        'data-testid': 'engine-selector',
        'data-preferred-engine-id': props.preferredEngineId ?? '',
      })
    },
  }),
}

describe('EngineSelectionModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('对话框被动关闭时会按取消流程结算导入', async () => {
    const onCancel = vi.fn()
    const updateOpen = vi.fn()

    renderInBrowser(EngineSelectionModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        onCancel,
        'onUpdate:open': updateOpen,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('dialog-close-request').click()

    await vi.waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(1)
    })
    expect(updateOpen).toHaveBeenCalledWith(false)
  })

  it('会把 hint.id 透传给 EngineSelector 作为首选引擎族', async () => {
    renderInBrowser(EngineSelectionModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        hint: {
          id: 'open-webgal.webgal',
          version: '4.5.0',
        },
        open: true,
      },
      global: {
        stubs: globalStubs,
      },
    })

    const selector = await page.getByTestId('engine-selector').element()

    expect(selector.dataset.preferredEngineId).toBe('open-webgal.webgal')
  })
})
