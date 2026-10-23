import { useVueFlow } from '@vue-flow/core'

import { TOUR_FIRST_STEP_BUTTONS } from '~/features/onboarding/tour'
import { TOUR_PERSISTENCE } from '~/features/onboarding/tour-version'
import { useOnboardingTour } from '~/features/onboarding/useOnboardingTour'

import type { ViewportTransform } from '@vue-flow/core'
import type { DriverHook, DriveStep } from 'driver.js'
import type { I18nT } from '~/utils/i18n-like'

interface FlowchartTourStepHooks {
  focusNode: DriverHook
  expandSceneDock: DriverHook
}

export function createFlowchartTourSteps(t: I18nT, hooks: FlowchartTourStepHooks): DriveStep[] {
  return [
    {
      element: '[data-tour="flowchart-manager"]',
      popover: {
        description: t('tour.flowchart.manager.description'),
        showButtons: TOUR_FIRST_STEP_BUTTONS,
        title: t('tour.flowchart.manager.title'),
      },
    },
    {
      element: '[data-tour="flowchart-add-node"]',
      popover: {
        description: t('tour.flowchart.addNode.description'),
        title: t('tour.flowchart.addNode.title'),
      },
    },
    {
      element: '[data-tour="flowchart-node"]',
      onHighlightStarted: hooks.focusNode,
      popover: {
        description: t('tour.flowchart.node.description'),
        title: t('tour.flowchart.node.title'),
      },
    },
    {
      element: '[data-tour="flowchart-scenes"]',
      onHighlightStarted: hooks.expandSceneDock,
      // 场景面板的高度有过渡，结束后按最终尺寸刷新高亮框。
      onHighlighted: (_element, _step, { driver }) => driver.refresh(),
      popover: {
        description: t('tour.flowchart.scenes.description'),
        title: t('tour.flowchart.scenes.title'),
      },
    },
    {
      element: '[data-tour="flowchart-source"]',
      onHighlightStarted: hooks.focusNode,
      popover: {
        description: t('tour.flowchart.connect.description'),
        title: t('tour.flowchart.connect.title'),
      },
    },
    {
      element: '[data-tour="flowchart-toolbar"]',
      popover: {
        description: t('tour.flowchart.canvas.description'),
        title: t('tour.flowchart.canvas.title'),
      },
    },
  ]
}

interface FlowchartTourOptions {
  /** 画布首次居中、节点测量完成后才允许引导启动。 */
  ready(): boolean
  expandSceneDock(): void
}

/** 流程画布按需挂载，共享生命周期负责离页让位与完成记录。 */
export function useFlowchartTour(options: FlowchartTourOptions) {
  const { dimensions, getNodes, getViewport, setViewport } = useVueFlow()
  const isActive = ref(false)
  let originalViewport: ViewportTransform | undefined

  function focusNode(_element: Element | undefined, _step: DriveStep, { driver }: Parameters<DriverHook>[2]): void {
    originalViewport ??= getViewport()
    const root = getNodes.value.find(node => node.data.isRoot)!
    // 根节点可能在屏幕外；放到画布上半部，避开左下场景浮层。
    void setViewport({
      x: dimensions.value.width / 2 - root.computedPosition.x - root.dimensions.width / 2,
      y: Math.max(96, dimensions.value.height / 4) - root.computedPosition.y - root.dimensions.height / 2,
      zoom: 1,
    })
    void nextTick(() => driver.refresh())
  }

  useOnboardingTour({
    onDriverDestroyed: () => {
      isActive.value = false
      if (originalViewport) {
        void setViewport(originalViewport)
        originalViewport = undefined
      }
    },
    overrides: { onHighlightStarted: () => {
      isActive.value = true
    } },
    persistence: TOUR_PERSISTENCE.flowchart,
    ready: options.ready,
    steps: t => createFlowchartTourSteps(t, {
      expandSceneDock: options.expandSceneDock,
      focusNode,
    }),
  })

  return { isActive }
}
