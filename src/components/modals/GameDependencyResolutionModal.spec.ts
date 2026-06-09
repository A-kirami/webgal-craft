import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import GameDependencyResolutionModal from './GameDependencyResolutionModal.vue'

import type { ImportDependencyResolutionContext, ImportDependencyResolutionResult } from '~/types/import-dependency-resolution'
import type { TemplateBinding } from '~/types/project-config'

const selectedTemplate = {
  kind: 'standalone',
  name: 'Available Template',
} satisfies TemplateBinding

const configuredEngineContext = {
  gameName: 'Demo Game',
  purpose: 'import',
  source: 'configured',
  engine: {
    current: {
      id: 'open-webgal.webgal',
      version: '4.5.0',
    },
    reason: 'missing',
  },
} satisfies ImportDependencyResolutionContext

const configuredTemplateContext = {
  gameName: 'Demo Game',
  purpose: 'import',
  source: 'configured',
  resolvedEngineId: 'engine-resolved',
  template: {
    current: {
      kind: 'standalone',
      name: 'Old Template',
    },
    displayName: 'Old Template',
    reason: 'missing',
  },
} satisfies ImportDependencyResolutionContext

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
          type: 'button',
          onClick: () => emit('update:modelValue', 'engine-selected'),
        }, 'select-engine'),
      ])
    },
  }),
  Label: createBrowserContainerStub('StubLabel', 'label'),
  TemplateSelector: defineComponent({
    name: 'StubTemplateSelector',
    props: {
      engineId: {
        type: String,
        default: undefined,
      },
      modelValue: {
        type: Object,
        default: undefined,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('div', {
        'data-testid': 'template-selector',
        'data-engine-id': props.engineId ?? '',
        'data-model-value': (props.modelValue as TemplateBinding | undefined)?.kind ?? '',
      }, [
        h('button', {
          type: 'button',
          onClick: () => emit('update:modelValue', selectedTemplate),
        }, 'select-template'),
        h('button', {
          type: 'button',
          onClick: () => emit('update:modelValue', undefined),
        }, 'follow-engine'),
      ])
    },
  }),
}

interface RenderGameDependencyResolutionModalOptions {
  context: ImportDependencyResolutionContext
  onCancel?: () => void
  onConfirm?: (result: ImportDependencyResolutionResult) => void
  open?: boolean
  updateOpen?: (open: boolean) => void
}

function renderGameDependencyResolutionModal(options: RenderGameDependencyResolutionModalOptions) {
  const { updateOpen, ...props } = options
  const modalProps = {
    open: true,
    ...props,
  }
  if (updateOpen) {
    Object.assign(modalProps, { 'onUpdate:open': updateOpen })
  }

  renderInBrowser(GameDependencyResolutionModal, {
    props: modalProps,
    global: {
      stubs: globalStubs,
    },
  })
}

describe('GameDependencyResolutionModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('只需要引擎时只显示引擎选择', async () => {
    renderGameDependencyResolutionModal({
      context: configuredEngineContext,
    })

    await expect.element(page.getByTestId('engine-selector')).toBeInTheDocument()
    await expect.element(page.getByTestId('template-selector')).not.toBeInTheDocument()
  })

  it('只需要模板时只显示模板选择并使用已解析引擎', async () => {
    renderGameDependencyResolutionModal({
      context: configuredTemplateContext,
    })

    await expect.element(page.getByTestId('engine-selector')).not.toBeInTheDocument()
    const selector = await page.getByTestId('template-selector').element()

    expect(selector.dataset.engineId).toBe('engine-resolved')
  })

  it('引擎和模板都需要修复时模板选择随当前引擎联动', async () => {
    renderGameDependencyResolutionModal({
      context: {
        ...configuredTemplateContext,
        resolvedEngineId: undefined,
        engine: configuredEngineContext.engine,
      },
    })

    await page.getByRole('button', { name: 'select-engine' }).click()
    const selector = await page.getByTestId('template-selector').element()

    expect(selector.dataset.engineId).toBe('engine-selected')
  })

  it('确认会返回组合结果', async () => {
    const onConfirm = vi.fn()

    renderGameDependencyResolutionModal({
      context: {
        ...configuredTemplateContext,
        resolvedEngineId: undefined,
        engine: configuredEngineContext.engine,
      },
      onConfirm,
    })

    await page.getByRole('button', { name: 'select-engine' }).click()
    await page.getByRole('button', { name: 'select-template' }).click()
    await page.getByRole('button', { name: 'game.gameDependencyResolutionConfirm' }).click()

    expect(onConfirm).toHaveBeenCalledWith({
      engineId: 'engine-selected',
      template: {
        action: 'set',
        binding: selectedTemplate,
      },
    })
  })

  it('允许确认跟随所选引擎默认模板', async () => {
    const onConfirm = vi.fn()

    renderGameDependencyResolutionModal({
      context: configuredTemplateContext,
      onConfirm,
    })

    await page.getByRole('button', { name: 'follow-engine' }).click()
    await page.getByRole('button', { name: 'game.gameDependencyResolutionConfirm' }).click()

    expect(onConfirm).toHaveBeenCalledWith({
      template: {
        action: 'followEngine',
      },
    })
  })

  it('被动关闭走取消流程', async () => {
    const onCancel = vi.fn()
    const updateOpen = vi.fn()
    renderGameDependencyResolutionModal({
      context: configuredEngineContext,
      onCancel,
      updateOpen,
    })

    await page.getByTestId('dialog-close-request').click()

    await vi.waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(1)
    })
    expect(updateOpen).toHaveBeenCalledWith(false)
  })
})
