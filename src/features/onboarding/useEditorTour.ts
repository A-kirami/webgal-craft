import { TOUR_FIRST_STEP_BUTTONS, TOUR_LAYOUT_SETTLE_DELAY_MS } from '~/features/onboarding/tour'
import { TOUR_PERSISTENCE } from '~/features/onboarding/tour-version'
import { useOnboardingTour } from '~/features/onboarding/useOnboardingTour'
import { usePreferenceStore } from '~/stores/preference'
import { detectSystemPlatform } from '~/utils/platform'

import type { DriveStep } from 'driver.js'
import type { I18nT } from '~/utils/i18n-like'

export interface EditorTourStepHooks {
  onResourceStepHighlighted(): void
  onSceneStepHighlighted(): void
}

export function createEditorTourSteps(t: I18nT, hooks: EditorTourStepHooks): DriveStep[] {
  return [
    {
      element: '[data-tour="preview-panel"]',
      popover: {
        description: t('tour.editor.previewPanel.description', { modifier: detectSystemPlatform() === 'mac' ? '⌘' : 'Ctrl' }),
        showButtons: TOUR_FIRST_STEP_BUTTONS,
        title: t('tour.editor.previewPanel.title'),
      },
    },
    {
      // 两步共用同一个面板容器：容器尺寸不随标签切换变化，高亮框不会落在旧布局上
      element: '[data-tour="scene-resource-panel"]',
      onHighlightStarted: hooks.onResourceStepHighlighted,
      popover: {
        description: t('tour.editor.resource.description'),
        title: t('tour.editor.resource.title'),
      },
    },
    {
      element: '[data-tour="scene-resource-panel"]',
      onHighlightStarted: hooks.onSceneStepHighlighted,
      popover: {
        description: t('tour.editor.scene.description'),
        title: t('tour.editor.scene.title'),
      },
    },
  ]
}

/**
 * 编辑器引导：进入编辑页时介绍左栏的预览面板，以及场景/资源面板的两个标签。
 *
 * 只覆盖打开场景文件前就存在的区域，所以不要求已打开场景文件；
 * 编辑区、模式切换和命令面板由 useEditorWorkspaceTour 在场景文件打开后介绍。
 *
 * 场景排在资源之后，让引导结束时停在用户接下来要动手的那一栏（场景），
 * 省掉一步「切回场景」。
 */
export function useEditorTour(): void {
  const preferenceStore = usePreferenceStore()

  useOnboardingTour({
    persistence: TOUR_PERSISTENCE.editor,
    // 预览面板默认可能被收起，先展开保证高亮目标可见
    prepare: async () => {
      preferenceStore.showPreviewPanel = true
      await nextTick()
      await new Promise<void>(resolve => setTimeout(resolve, TOUR_LAYOUT_SETTLE_DELAY_MS))
    },
    ready: () => true,
    steps: t => createEditorTourSteps(t, {
      onResourceStepHighlighted: () => {
        preferenceStore.leftPanelView = 'resource'
      },
      onSceneStepHighlighted: () => {
        preferenceStore.leftPanelView = 'scene'
      },
    }),
  })
}
