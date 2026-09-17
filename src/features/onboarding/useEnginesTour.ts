import { TOUR_FIRST_STEP_BUTTONS } from '~/features/onboarding/tour'
import { TOUR_PERSISTENCE } from '~/features/onboarding/tour-version'
import { useOnboardingTour } from '~/features/onboarding/useOnboardingTour'
import { useWorkspaceStore } from '~/stores/workspace'

import type { DriveStep } from 'driver.js'
import type { I18nT } from '~/utils/i18n-like'

export function createEnginesTourSteps(t: I18nT): DriveStep[] {
  return [
    {
      element: '[data-tour="official-engine"]',
      popover: {
        description: t('tour.engines.official.description'),
        showButtons: TOUR_FIRST_STEP_BUTTONS,
        title: t('tour.engines.official.title'),
      },
    },
    {
      element: '[data-tour="custom-engine-import"]',
      popover: {
        description: t('tour.engines.customImport.description'),
        title: t('tour.engines.customImport.title'),
      },
    },
  ]
}

/** 引擎页引导：首次切换到引擎 Tab 时，介绍官方引擎一键安装与自定义引擎导入。 */
export function useEnginesTour(): void {
  const workspaceStore = useWorkspaceStore()

  useOnboardingTour({
    persistence: TOUR_PERSISTENCE.engines,
    ready: () => workspaceStore.activeTab === 'engines',
    steps: t => createEnginesTourSteps(t),
  })
}
