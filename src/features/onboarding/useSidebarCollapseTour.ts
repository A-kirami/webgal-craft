import { TOUR_LAYOUT_SETTLE_DELAY_MS } from '~/features/onboarding/tour'
import { TOUR_PERSISTENCE } from '~/features/onboarding/tour-version'
import { useOnboardingTour } from '~/features/onboarding/useOnboardingTour'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { useEditorStore } from '~/stores/editor'
import { usePreferenceStore } from '~/stores/preference'

import type { DriveStep } from 'driver.js'
import type { I18nT } from '~/utils/i18n-like'

export function createSidebarCollapseTourSteps(t: I18nT): DriveStep[] {
  return [
    {
      // 变化发生在整个编辑区：卡片全部折叠
      element: '[data-tour="editor-area"]',
      popover: {
        description: t('tour.sidebarCollapse.description'),
        // 单步说明不需要「跳过」，只留一个确认按钮；覆盖共享的「完成」文案，
        // 用「知道了」表明这不是一条流程的结束
        doneBtnText: t('tour.common.gotIt'),
        showButtons: ['next'],
        title: t('tour.sidebarCollapse.title'),
      },
    },
  ]
}

/**
 * 辅助面板折叠提示：可视化模式下打开辅助面板会折叠全部语句卡片，
 * 而关掉这个行为的开关在设置里，所以在用户处在这个状态时讲一次。
 *
 * 就绪条件用持久状态而不是「打开面板」这个动作：状态本来就停在可视化 + 面板已开的用户
 * 不会重新触发动作，只按动作触发就永远看不到这条说明。
 */
export function useSidebarCollapseTour(): void {
  const preferenceStore = usePreferenceStore()
  const editSettingsStore = useEditSettingsStore()
  const editorStore = useEditorStore()

  useOnboardingTour({
    persistence: TOUR_PERSISTENCE.sidebarCollapse,
    // 先让用户看清编辑区的折叠结果，再压上遮罩解释，避免遮罩和布局变化挤在一起
    prepare: () => new Promise<void>(resolve => setTimeout(resolve, TOUR_LAYOUT_SETTLE_DELAY_MS)),
    ready: () => preferenceStore.editorMode === 'visual'
      && preferenceStore.showSidebar
      && editSettingsStore.collapseStatementsOnSidebarOpen
      && editorStore.isCurrentSceneFile,
    steps: translate => createSidebarCollapseTourSteps(translate),
  })
}
