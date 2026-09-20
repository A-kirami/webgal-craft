import { TOUR_FIRST_STEP_BUTTONS, TOUR_LAYOUT_SETTLE_DELAY_MS } from '~/features/onboarding/tour'
import { TOUR_PERSISTENCE } from '~/features/onboarding/tour-version'
import { useOnboardingTour } from '~/features/onboarding/useOnboardingTour'
import { useEditorStore } from '~/stores/editor'

import type { DriveStep } from 'driver.js'
import type { I18nT } from '~/utils/i18n-like'

export function createEditorWorkspaceTourSteps(t: I18nT): DriveStep[] {
  return [
    {
      element: '[data-tour="mode-switch"]',
      popover: {
        description: t('tour.editorWorkspace.modeSwitch.description'),
        // 首步没有可返回的上一步，只保留「下一步 / 跳过」
        showButtons: TOUR_FIRST_STEP_BUTTONS,
        title: t('tour.editorWorkspace.modeSwitch.title'),
      },
    },
    {
      // 上一步只指认模式按钮，这一步交代编辑区本身；文本与可视化两种模式下
      // 高亮目标都是同一个容器，不受用户当前模式偏好影响
      element: '[data-tour="editor-area"]',
      popover: {
        description: t('tour.editorWorkspace.editorArea.description'),
        title: t('tour.editorWorkspace.editorArea.title'),
      },
    },
    {
      element: '[data-tour="command-panel"]',
      popover: {
        description: t('tour.editorWorkspace.commandPanel.description'),
        title: t('tour.editorWorkspace.commandPanel.title'),
      },
    },
  ]
}

export interface EditorWorkspaceTourOptions {
  /** 命令面板的折叠态由 reka-ui 面板自身维护，外部只能委托编辑器面板展开 */
  expandCommandPanel(): void
}

/**
 * 场景编辑引导：打开任意场景文件后介绍模式切换、编辑区与命令面板。
 *
 * 不演示点击模式切换：引导统一屏蔽高亮区域的交互，用户不会预期这里能点；
 * 而代替用户切换会真的改掉全局编辑模式偏好，代价高于直接说明这个按钮的作用。
 */
export function useEditorWorkspaceTour(options: EditorWorkspaceTourOptions): void {
  const editorStore = useEditorStore()

  useOnboardingTour({
    persistence: TOUR_PERSISTENCE.editorWorkspace,
    prepare: async () => {
      options.expandCommandPanel()
      await nextTick()
      await new Promise<void>(resolve => setTimeout(resolve, TOUR_LAYOUT_SETTLE_DELAY_MS))
    },
    ready: () => editorStore.isCurrentSceneFile,
    steps: t => createEditorWorkspaceTourSteps(t),
  })
}
