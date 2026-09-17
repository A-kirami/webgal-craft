import { createTourDriver, createTourLabels } from '~/features/onboarding/tour'
import { useModalStore } from '~/stores/modal'

import type { Driver, DriveStep } from 'driver.js'
import type { TourOverrides } from '~/features/onboarding/tour'
import type { TourPersistence } from '~/features/onboarding/tour-version'
import type { I18nT } from '~/utils/i18n-like'

export interface OnboardingTourControls {
  /** 用户已用行动学会（如首次真实拖拽）时调用：销毁引导并记录完成版本 */
  complete(): void
}

/** 步骤钩子借它与进行中的引导交互 */
export interface OnboardingTourStepControls {
  moveNext(): void
}

export interface UseOnboardingTourOptions {
  /** 驱动销毁后的额外清理（移除锚点、停止步骤监听等） */
  onDriverDestroyed?(): void
  /** 启动前的异步准备（展开面板、等布局稳定） */
  prepare?(): Promise<void> | void
  /** 引导可以出现的条件：目标就绪等；条件消失时进行中的引导立即让位 */
  ready(): boolean
  overrides?: TourOverrides
  persistence: TourPersistence
  steps(t: I18nT, controls: OnboardingTourStepControls): DriveStep[]
}

/**
 * 新手引导的共享生命周期：就绪即启动、条件消失即让位、完成或跳过才写入版本。
 *
 * 阻塞式弹窗一律优先于引导；页面切换、让位给弹窗等被动销毁不算完成，
 * 条件恢复后仍会重新触发。
 */
export function useOnboardingTour(options: UseOnboardingTourOptions): OnboardingTourControls {
  const { t } = useI18n()
  const modalStore = useModalStore()
  const completedVersion = useStorage(options.persistence.storageKey, '')

  let activeDriver: Driver | undefined
  let isAborting = false
  let isStarting = false
  let isUnmounting = false

  function isReady(): boolean {
    return options.ready() && !modalStore.hasOpenModal
  }

  function canStart(): boolean {
    return !isUnmounting
      && !activeDriver
      && completedVersion.value !== options.persistence.version
      && isReady()
  }

  function abortTour(): void {
    const driver = activeDriver
    if (!driver) {
      return
    }

    activeDriver = undefined
    isAborting = true
    driver.destroy()
    isAborting = false
  }

  function handleDestroyed(): void {
    activeDriver = undefined
    options.onDriverDestroyed?.()
    if (!isUnmounting && !isAborting) {
      completedVersion.value = options.persistence.version
    }
  }

  async function startTour(): Promise<void> {
    if (isStarting || !canStart()) {
      return
    }

    isStarting = true
    try {
      await options.prepare?.()

      // 准备期间环境可能变化（弹窗打开、目标消失等），重新确认后再启动
      if (!canStart()) {
        return
      }

      activeDriver = createTourDriver({
        labels: createTourLabels(t),
        onDestroyed: handleDestroyed,
        overrides: options.overrides,
        steps: options.steps(t, { moveNext: () => activeDriver?.moveNext() }),
      })
      activeDriver.drive()
    } finally {
      isStarting = false
      // 启动耗时期间条件反复过：就绪时的再次触发被并发守卫吞掉，这里补上
      if (!activeDriver && canStart()) {
        void startTour()
      }
    }
  }

  watch(isReady, (ready) => {
    if (ready) {
      void startTour()
      return
    }

    abortTour()
  }, { immediate: true })

  onBeforeUnmount(() => {
    isUnmounting = true
    abortTour()
  })

  return {
    complete: () => activeDriver?.destroy(),
  }
}
