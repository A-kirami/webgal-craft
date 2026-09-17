import { TOUR_FIRST_STEP_BUTTONS } from '~/features/onboarding/tour'
import { TOUR_PERSISTENCE } from '~/features/onboarding/tour-version'
import { useOnboardingTour } from '~/features/onboarding/useOnboardingTour'
import { useEditorStore } from '~/stores/editor'
import { usePreferenceStore } from '~/stores/preference'
import { detectSystemPlatform } from '~/utils/platform'

import type { DriveStep } from 'driver.js'
import type { OnboardingTourStepControls } from '~/features/onboarding/useOnboardingTour'
import type { I18nT } from '~/utils/i18n-like'

/** 面板展开与尺寸动画结束后再定位高亮区域，避免高亮框落在旧布局上 */
export const EDITOR_TOUR_LAYOUT_SETTLE_DELAY_MS = 300

export interface EditorTourStepHooks {
  onModeSwitchDeselected(): void
  onModeSwitchHighlighted(): void
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
      element: '[data-tour="scene-resource-panel"]',
      popover: {
        description: t('tour.editor.sceneResource.description'),
        title: t('tour.editor.sceneResource.title'),
      },
    },
    {
      element: '[data-tour="mode-switch"]',
      // 用户点了高亮的切换按钮会自动前进，必须保持可交互
      disableActiveInteraction: false,
      onDeselected: hooks.onModeSwitchDeselected,
      onHighlightStarted: hooks.onModeSwitchHighlighted,
      popover: {
        description: t('tour.editor.modeSwitch.description'),
        // 保留默认按钮里的「下一步」：用户点了高亮按钮会自动前进，
        // 但按钮不可用或用户不想切换时不能卡在这一步
        title: t('tour.editor.modeSwitch.title'),
      },
    },
    {
      // 模式切换会整体改变编辑区显示，单独停一步让用户看清切换结果；
      // 两种模式下高亮目标是同一个容器，位置不随切换变化
      element: '[data-tour="editor-area"]',
      popover: {
        description: t('tour.editor.editorArea.description'),
        title: t('tour.editor.editorArea.title'),
      },
    },
    {
      element: '[data-tour="command-panel"]',
      popover: {
        description: t('tour.editor.commandPanel.description'),
        title: t('tour.editor.commandPanel.title'),
      },
    },
  ]
}

export interface EditorTourOptions {
  /** 命令面板的折叠态由 reka-ui 面板自身维护，只能由编辑器面板展开 */
  expandCommandPanel(): void
}

/**
 * 编辑器引导：首次打开场景文件时介绍编辑器的主要区域。
 *
 * 触发时机不是编辑页挂载，因为首次使用时还没有打开任何场景文件，
 * 此时命令面板还不存在。
 */
export function useEditorTour(options: EditorTourOptions): void {
  const editorStore = useEditorStore()
  const preferenceStore = usePreferenceStore()

  let stopModeWatch: (() => void) | undefined

  function stopWatchingMode(): void {
    stopModeWatch?.()
    stopModeWatch = undefined
  }

  /** 用户在模式切换步骤真的切换了模式，就代替「下一步」自动前进 */
  function startWatchingMode(moveNext: () => void): void {
    stopWatchingMode()

    const modeBeforeHighlight = preferenceStore.editorMode
    stopModeWatch = watch(() => preferenceStore.editorMode, (mode) => {
      if (mode === modeBeforeHighlight) {
        return
      }

      stopWatchingMode()
      moveNext()
    }, { flush: 'post' })
  }

  useOnboardingTour({
    onDriverDestroyed: stopWatchingMode,
    persistence: TOUR_PERSISTENCE.editor,
    // 预览面板默认可能被收起，先展开保证高亮目标可见
    prepare: async () => {
      preferenceStore.showPreviewPanel = true
      await nextTick()
      options.expandCommandPanel()
      await nextTick()
      await new Promise<void>(resolve => setTimeout(resolve, EDITOR_TOUR_LAYOUT_SETTLE_DELAY_MS))
    },
    ready: () => editorStore.isCurrentSceneFile,
    steps: (t, controls: OnboardingTourStepControls) => createEditorTourSteps(t, {
      onModeSwitchDeselected: stopWatchingMode,
      onModeSwitchHighlighted: () => startWatchingMode(controls.moveNext),
    }),
  })
}
