import { TOUR_FIRST_STEP_BUTTONS } from '~/features/onboarding/tour'
import { TOUR_PERSISTENCE } from '~/features/onboarding/tour-version'
import { useOnboardingTour } from '~/features/onboarding/useOnboardingTour'
import { useWorkspaceStore } from '~/stores/workspace'

import type { DriveStep } from 'driver.js'
import type { I18nT } from '~/utils/i18n-like'

export function createHomeTourSteps(t: I18nT): DriveStep[] {
  return [
    {
      // 欢迎步骤居中展示，没有高亮目标
      popover: {
        description: t('tour.home.welcome.description'),
        showButtons: TOUR_FIRST_STEP_BUTTONS,
        title: t('tour.home.welcome.title'),
      },
    },
    {
      element: '[data-tour="create-game"]',
      popover: {
        description: t('tour.home.createGame.description'),
        title: t('tour.home.createGame.title'),
      },
    },
    {
      element: '[data-tour="import-game"]',
      popover: {
        description: t('tour.home.importGame.description'),
        title: t('tour.home.importGame.title'),
      },
    },
  ]
}

export interface HomeTourOptions {
  /**
   * 首页首次发现（会打开弹窗）结束后才允许启动：否则遮罩先淡入、再被弹窗顶掉，会闪一下。
   */
  isPageReady(): boolean
}

/** 首页引导：首次进入首页时先欢迎用户，再介绍创建与导入入口。 */
export function useHomeTour(options: HomeTourOptions): void {
  const workspaceStore = useWorkspaceStore()

  useOnboardingTour({
    // 首页首次检查优先于引导；离开游戏 Tab 时让位（引擎页有自己的引导）
    ready: () => options.isPageReady() && workspaceStore.activeTab === 'recent',
    persistence: TOUR_PERSISTENCE.home,
    steps: t => createHomeTourSteps(t),
  })
}
