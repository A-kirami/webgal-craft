import { createTourDriver, createTourLabels } from '~/features/onboarding/tour'
import { publishTourCompletion, registerTourReset } from '~/features/onboarding/tour-state'
import { useModalStore } from '~/stores/modal'

import type { Driver, DriveStep } from 'driver.js'
import type { TourOverrides } from '~/features/onboarding/tour'
import type { TourPersistence } from '~/features/onboarding/tour-version'
import type { I18nT } from '~/utils/i18n-like'

/**
 * 同屏只允许一条引导。多条引导同时就绪时（例如重置引导进度会同时清掉编辑器内几条
 * 引导的完成记录）靠它按挂载顺序排队，否则两条 driver 遮罩会叠在一起。
 */
const activeTourCount = ref(0)

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
  /**
   * 引导自己打开弹窗时返回 true。此时「有弹窗打开」是引导的预期状态，不能按让位处理：
   * 让位销毁不写完成版本，弹窗一关引导就会从头再来。只对主动演示弹窗的引导开放此出口。
   */
  ownsOpenModal?(): boolean
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

  // 设置里的「重置全部引导进度」要让已挂载的引导立即复位：完成记录存在这里的 ref 上，
  // 同文档内改写 localStorage 不会传播过来，所以由 tour-state 反向回调
  onScopeDispose(registerTourReset(options.persistence.storageKey, () => {
    completedVersion.value = ''
  }))

  // 广播给同文档内的其它引导，供引导之间的顺序编排（useStorage 不跨实例同步）
  watch(completedVersion, (version) => {
    publishTourCompletion(options.persistence.storageKey, version)
  }, { immediate: true })

  let activeDriver: Driver | undefined
  let isAborting = false
  let isStarting = false
  let isUnmounting = false

  function isReady(): boolean {
    if (!options.ready()) {
      return false
    }

    if (options.ownsOpenModal?.() !== true && modalStore.hasOpenModal) {
      return false
    }

    // 本引导已经在运行时忽略计数：否则它会被自己算出来的「有引导在显示」挤掉
    return activeDriver ? true : activeTourCount.value === 0
  }

  /** 清掉当前驱动并释放占位，保证计数只减一次 */
  function clearActiveDriver(): void {
    if (!activeDriver) {
      return
    }

    activeDriver = undefined
    activeTourCount.value -= 1
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

    clearActiveDriver()
    isAborting = true
    driver.destroy()
    isAborting = false
  }

  function handleDestroyed(): void {
    clearActiveDriver()
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
      activeTourCount.value += 1
      activeDriver.drive()
    } finally {
      isStarting = false
    }
  }

  // completedVersion 也要作为依赖：清空完成记录不会改变就绪条件，
  // 只监听 isReady 的话引导不会重新启动
  watch([isReady, completedVersion], ([ready]) => {
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
