import { useEngines, useTemplates } from '~/composables/useDatabase'
import { hasSwitchableResourceAlternative } from '~/features/onboarding/resource-switch-availability'
import { TOUR_FIRST_STEP_BUTTONS } from '~/features/onboarding/tour'
import { isTourCompleted } from '~/features/onboarding/tour-state'
import { TOUR_PERSISTENCE } from '~/features/onboarding/tour-version'
import { useOnboardingTour } from '~/features/onboarding/useOnboardingTour'
import { useModalStore } from '~/stores/modal'
import { useWorkspaceStore } from '~/stores/workspace'

import type { Driver, DriveStep } from 'driver.js'
import type { I18nT } from '~/utils/i18n-like'

export const RESOURCE_SWITCH_ENGINE_MODAL = 'SwitchEngineModal'
export const RESOURCE_SWITCH_TEMPLATE_MODAL = 'SwitchTemplateModal'

/** DialogContent 的入场动画是 200ms，取一点余量跟着它刷新高亮位置 */
const RESOURCE_SWITCH_DIALOG_ANIMATION_MS = 220

interface ResourceSwitchStepControls {
  openEngineModal(): void
  openTemplateModal(): void
  releaseModals(): void
  /** 弹窗入场动画期间持续 refresh，让高亮框跟着弹窗动而不是停在动画中途的位置 */
  trackDialogRect(driver: Driver): void
}

function createResourceSwitchTourSteps(
  t: I18nT,
  controls: ResourceSwitchStepControls,
): DriveStep[] {
  return [
    {
      element: '[data-tour="resource-switch"]',
      popover: {
        description: t('tour.resourceSwitch.statusBar.description'),
        onNextClick: (_element, _step, opts) => {
          controls.openEngineModal()
          // 定义 popover.onNextClick 会替换 driver 的默认前进，必须自己推进
          opts.driver.moveNext()
        },
        showButtons: TOUR_FIRST_STEP_BUTTONS,
        title: t('tour.resourceSwitch.statusBar.title'),
      },
    },
    {
      element: '[data-tour="switch-engine-dialog"]',
      skipMissingElement: false,
      /*
       * 弹窗要等上一步点击后才挂载，而 driver 判断「后面还有没有步骤」靠的是查询下一步的
       * 元素当前是否存在。不关掉缺失元素跳过的话，上一步会被当成最后一步：
       * 按钮文案变成「完成」，点击语义也跟着错。
       */
      onHighlighted: (_element, _step, opts) => controls.trackDialogRect(opts.driver),
      popover: {
        description: t('tour.resourceSwitch.engineDialog.description'),
        onNextClick: (_element, _step, opts) => {
          controls.openTemplateModal()
          opts.driver.moveNext()
        },
        // 返回上一步同样要收回弹窗，否则会停在「引擎弹窗还开着」的错配状态
        onPrevClick: (_element, _step, opts) => {
          controls.releaseModals()
          opts.driver.movePrevious()
        },
        title: t('tour.resourceSwitch.engineDialog.title'),
      },
    },
    {
      element: '[data-tour="switch-template-dialog"]',
      skipMissingElement: false,
      onHighlighted: (_element, _step, opts) => controls.trackDialogRect(opts.driver),
      popover: {
        description: t('tour.resourceSwitch.templateDialog.description'),
        onPrevClick: (_element, _step, opts) => {
          controls.openEngineModal()
          opts.driver.movePrevious()
        },
        title: t('tour.resourceSwitch.templateDialog.title'),
      },
    },
  ]
}

/**
 * 资源切换引导：在编辑器里演示状态栏的引擎与模板入口，以及点开后各自能做什么。
 *
 * 这是唯一会自己打开弹窗的引导：需要 ownsOpenModal 告诉共享生命周期「弹窗是预期状态」，
 * 否则弹窗一开就被判定为让位、销毁且不写完成版本，关闭后会从头再来。
 */
export function useResourceSwitchTour(): void {
  const modalStore = useModalStore()
  const workspaceStore = useWorkspaceStore()
  const engines = $(useEngines())
  const templates = $(useTemplates())

  let ownsModals = $ref(false)
  let trackFrame: number | undefined

  function cancelRectTracking(): void {
    if (trackFrame !== undefined) {
      cancelAnimationFrame(trackFrame)
      trackFrame = undefined
    }
  }

  function trackDialogRect(driver: Driver): void {
    cancelRectTracking()

    const startedAt = performance.now()
    const tick = (): void => {
      driver.refresh()
      trackFrame = performance.now() - startedAt < RESOURCE_SWITCH_DIALOG_ANIMATION_MS
        ? requestAnimationFrame(tick)
        : undefined
    }

    trackFrame = requestAnimationFrame(tick)
  }

  function closeModalEntries(): void {
    modalStore.close(RESOURCE_SWITCH_ENGINE_MODAL)
    modalStore.close(RESOURCE_SWITCH_TEMPLATE_MODAL)
  }

  function releaseModals(): void {
    closeModalEntries()
    ownsModals = false
  }

  function openEngineModal(): void {
    const game = workspaceStore.currentGame
    if (!game) {
      return
    }

    // 先置位再换弹窗：关旧开新之间不能出现 ownsModals 为假的空档
    ownsModals = true
    closeModalEntries()
    modalStore.open(RESOURCE_SWITCH_ENGINE_MODAL, { game })
  }

  function openTemplateModal(): void {
    const game = workspaceStore.currentGame
    if (!game) {
      return
    }

    ownsModals = true
    closeModalEntries()
    modalStore.open(RESOURCE_SWITCH_TEMPLATE_MODAL, { game })
  }

  const tour = useOnboardingTour({
    onDriverDestroyed: () => {
      cancelRectTracking()
      releaseModals()
    },
    ownsOpenModal: () => ownsModals,
    persistence: TOUR_PERSISTENCE.resourceSwitch,
    // 顺序编排：必须等编辑器的引导这一轮真正跑完。不能只看 localStorage，
    // 重置后它会被清空，而 editorWorkspace 引导此时可能还没就绪（要求已打开场景文件）。
    ready: () => isTourCompleted(TOUR_PERSISTENCE.editorWorkspace) && hasSwitchableResourceAlternative({
      currentEngineId: workspaceStore.currentGame?.engineId,
      engines: engines ?? [],
      templates: templates ?? [],
    }),
    steps: t => createResourceSwitchTourSteps(t, {
      openEngineModal,
      openTemplateModal,
      releaseModals,
      trackDialogRect,
    }),
  })

  // 用户用 Esc 关掉引导打开的弹窗时按完成收尾，避免高亮目标消失后被静默跳过
  watch(() => modalStore.hasOpenModal, (hasOpenModal) => {
    if (hasOpenModal || !ownsModals) {
      return
    }

    tour.complete()
  })
}
