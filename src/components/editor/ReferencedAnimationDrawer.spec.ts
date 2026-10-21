import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, reactive } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import { LATEST_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'

import ReferencedAnimationDrawer from './ReferencedAnimationDrawer.vue'

import type { AnimationFramePreviewContext } from '~/features/editor/animation/useAnimationFramePreview'
import type { ReferencedAnimationEditorController } from '~/features/editor/animation/useReferencedAnimationEditor'

const globalStubs = {
  EditorDrawer: defineComponent({
    name: 'StubEditorDrawer',
    props: {
      anchor: {
        type: Object,
        required: false,
      },
      interactiveRegionSelector: {
        type: String,
        required: false,
      },
      open: {
        type: Boolean,
        required: false,
      },
      panelFocus: {
        type: String,
        required: false,
      },
    },
    setup(_, { slots }) {
      return () => h('section', { 'data-testid': 'editor-drawer' }, slots.default?.())
    },
  }),
  ReferencedAnimationEditorPanel: defineComponent({
    name: 'StubReferencedAnimationEditorPanel',
    setup() {
      return () => h('div', 'Referenced Animation Editor Panel')
    },
  }),
  Separator: createBrowserContainerStub('StubSeparator'),
  SheetDescription: createBrowserContainerStub('StubSheetDescription', 'p'),
  SheetHeader: createBrowserContainerStub('StubSheetHeader'),
  SheetTitle: createBrowserContainerStub('StubSheetTitle', 'h2'),
}

interface ControllerOverrides {
  animationName?: string
  binding?: Record<string, unknown>
  draftFrames?: unknown[]
  isDirty?: boolean
  referenceCount?: number
  status?: string
  unresolvedReason?: string
}

const FRAME_PREVIEW_CONTEXT: AnimationFramePreviewContext = {
  command: commandType.setAnimation,
  hasAnimationOverrides: false,
  lineCommandString: 'setAnimation:walk/fade -target=fig-center;',
  runtimeCapabilities: {
    ...LATEST_ENGINE_RUNTIME_CAPABILITIES,
    seekAnimation: true,
  },
  scenePath: '/games/demo/game/scene/start.txt',
  sentenceId: 7,
  target: 'fig-center',
  writeMode: {
    transformFrom: 'current',
    writeDefault: false,
    writeFullEffect: false,
  },
}

function createController(overrides: ControllerOverrides = {}) {
  const controller = {
    animationName: overrides.animationName ?? 'walk/fade',
    binding: overrides.binding,
    draftFrames: overrides.draftFrames,
    isDirty: overrides.isDirty ?? false,
    isOpen: true,
    openInTextMode: vi.fn(),
    referenceCount: overrides.referenceCount ?? 1,
    requestClose: vi.fn(),
    retry: vi.fn(),
    save: vi.fn(async () => true),
    status: overrides.status ?? 'ready',
    unresolvedReason: overrides.unresolvedReason,
    updateDraftFrames: vi.fn(),
  }
  return reactive(controller) as unknown as ReferencedAnimationEditorController
}

async function renderDrawer(
  controller: ReferencedAnimationEditorController,
  stubs: Record<string, unknown> = {},
) {
  await renderInBrowser(ReferencedAnimationDrawer, {
    browser: {
      i18nMode: 'localized',
    },
    props: {
      controller,
    },
    global: {
      stubs: {
        ...globalStubs,
        ...stubs,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ReferencedAnimationDrawer', () => {
  it('帧预览降级提示与描述同处抽屉头部', async () => {
    const NoticePanelStub = defineComponent({
      name: 'NoticeReferencedAnimationEditorPanel',
      emits: ['update:framePreviewNotice'],
      setup(_, { emit }) {
        emit('update:framePreviewNotice', '实时预览已关闭，帧级预览和拖拽不可用')
        return () => h('div', 'Referenced Animation Editor Panel')
      },
    })

    await renderDrawer(createController({
      draftFrames: [],
    }), {
      ReferencedAnimationEditorPanel: NoticePanelStub,
    })

    await expect.element(page.getByTestId('referenced-animation-frame-preview-notice'))
      .toHaveTextContent('实时预览已关闭，帧级预览和拖拽不可用')
    await expect.element(page.getByText('直接编辑这个动画文件。保存后会写入文件，并影响引用该动画的语句'))
      .toBeInTheDocument()
  })

  it('就绪态显示动画名、引用范围与草稿帧面板', async () => {
    await renderDrawer(createController({
      draftFrames: [],
      referenceCount: 3,
    }))

    await expect.element(page.getByText('引用动画：walk/fade')).toBeInTheDocument()
    await expect.element(page.getByText('直接编辑这个动画文件。保存后会写入文件，并影响引用该动画的 3 条语句'))
      .toBeInTheDocument()
    await expect.element(page.getByTestId('referenced-animation-shared-notice')).not.toBeInTheDocument()
    await expect.element(page.getByText('Referenced Animation Editor Panel')).toBeInTheDocument()

    const saveButton = page.getByRole('button', { name: '保存' })
    await expect.element(saveButton).toBeDisabled()
    await expect.element(page.getByTestId('referenced-animation-frame-preview-notice')).not.toBeInTheDocument()
  })

  it('加载期间先用静态规则显示帧预览降级提示，避免面板挂载后头部增高', async () => {
    await renderDrawer(createController({
      binding: {
        framePreview: FRAME_PREVIEW_CONTEXT,
      },
      status: 'loading',
    }))

    await expect.element(page.getByTestId('referenced-animation-frame-preview-notice'))
      .toHaveTextContent('预览尚未就绪，帧级预览和拖拽暂不可用')
  })

  it('把面板的草稿更新交还给控制器', async () => {
    const controller = createController({ draftFrames: [] })
    const FramesPanelStub = defineComponent({
      name: 'FramesPanelStub',
      emits: ['update:frames'],
      setup(_, { emit }) {
        emit('update:frames', [{ duration: 100 }])
        return () => h('div', 'panel')
      },
    })

    await renderDrawer(controller, { ReferencedAnimationEditorPanel: FramesPanelStub })

    expect(controller.updateDraftFrames).toHaveBeenCalledWith([{ duration: 100 }])
  })

  it('脏草稿通过主按钮保存，底部不再提供关闭按钮', async () => {
    const controller = createController({ isDirty: true })

    await renderDrawer(controller)

    const saveButton = page.getByRole('button', { name: '保存' })
    await expect.element(saveButton).toBeEnabled()
    await saveButton.click()
    expect(controller.save).toHaveBeenCalledTimes(1)
    expect(controller.requestClose).not.toHaveBeenCalled()
    await expect.element(page.getByRole('button', { name: '关闭' })).not.toBeInTheDocument()
  })

  it('读取失败时只提供重试', async () => {
    const controller = createController({ status: 'load-failed' })

    await renderDrawer(controller)

    await expect.element(page.getByText('无法打开动画文件')).toBeInTheDocument()
    await page.getByRole('button', { name: '重试' }).click()
    expect(controller.retry).toHaveBeenCalledTimes(1)
  })

  it('v2 动画只读并提供在文本模式打开的出口', async () => {
    const controller = createController({ status: 'v2-read-only' })

    await renderDrawer(controller)

    await expect.element(page.getByText('暂不支持可视化编辑')).toBeInTheDocument()
    await expect.element(page.getByText('当前动画文件使用 v2 格式。')).toBeInTheDocument()
    await page.getByRole('button', { name: '在文本模式打开' }).click()
    expect(controller.openInTextMode).toHaveBeenCalledTimes(1)
  })

  it('非法动画内容使用内容错误标题，不复用能力降级文案', async () => {
    await renderDrawer(createController({ status: 'invalid-json' }))

    await expect.element(page.getByText('动画内容有误')).toBeInTheDocument()
    await expect.element(page.getByText('当前文件无法解析为动画文档。')).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: '在文本模式打开' })).toBeInTheDocument()
  })

  it('动画名含变量时显示对应原因', async () => {
    await renderDrawer(createController({
      status: 'unresolved',
      unresolvedReason: 'dynamic-name',
    }))

    await expect.element(page.getByText('动画名包含变量，运行时才能确定，无法在编辑器中打开')).toBeInTheDocument()
  })
})
