import { TOUR_FIRST_STEP_BUTTONS } from '~/features/onboarding/tour'
import { TOUR_PERSISTENCE } from '~/features/onboarding/tour-version'
import { useOnboardingTour } from '~/features/onboarding/useOnboardingTour'

/**
 * 在 Sheet 的最终落点放一个隐形锚点并返回它，找不到 Sheet 时返回 undefined。
 *
 * Sheet 滑入期间元素仍部分在屏幕外：直接高亮会让 driver.js scrollIntoView 把外层容器滚歪，
 * 弹窗也会落在动画中的瞬时位置。滑入是 transform 驱动的，矩形扣掉 computed transform 的
 * 位移即最终落点；锚点静止且在视口内，Sheet 滑入就「落进」高亮框。
 */
export function createEffectEditorSheetAnchor(): HTMLElement | undefined {
  if (typeof document === 'undefined') {
    return undefined
  }

  const sheet = document.querySelector<HTMLElement>('[data-tour="effect-editor"]')
  if (!sheet) {
    return undefined
  }

  const rect = sheet.getBoundingClientRect()
  const transform = globalThis.getComputedStyle(sheet).transform
  let offsetX = 0
  let offsetY = 0
  if (transform.startsWith('matrix(')) {
    const values = transform.slice('matrix('.length, -1).split(',').map(Number)
    offsetX = values[4] ?? 0
    offsetY = values[5] ?? 0
  } else if (transform.startsWith('matrix3d(')) {
    const values = transform.slice('matrix3d('.length, -1).split(',').map(Number)
    offsetX = values[12] ?? 0
    offsetY = values[13] ?? 0
  }

  const anchor = document.createElement('div')
  anchor.style.position = 'fixed'
  anchor.style.left = `${rect.left - offsetX}px`
  anchor.style.top = `${rect.top - offsetY}px`
  anchor.style.width = `${rect.width}px`
  anchor.style.height = `${rect.height}px`
  anchor.style.pointerEvents = 'none'
  document.body.append(anchor)
  return anchor
}

export interface EffectEditorTourOptions {
  /** TransformOverlay 是否已激活：效果编辑器打开、有可拖拽目标且预览就绪 */
  enabled(): boolean
  /** 用户是否已经在预览里拖拽过：已用行动学会，引导应自动退场 */
  hasInteracted(): boolean
}

/**
 * 效果编辑器引导：TransformOverlay 首次激活时，依次介绍效果编辑器和预览拖拽。
 *
 * 触发时机锚定 overlay 激活而非效果编辑器打开：目标未定位时预览不可拖拽，会误导用户。
 */
export function useEffectEditorTour(options: EffectEditorTourOptions): void {
  let sheetAnchor: HTMLElement | undefined

  const tour = useOnboardingTour({
    onDriverDestroyed: () => {
      sheetAnchor?.remove()
      sheetAnchor = undefined
    },
    // 情境引导要快：默认 400ms 的淡入在体感上是明显延迟，这里收紧
    overrides: { duration: 150 },
    persistence: TOUR_PERSISTENCE.effectEditor,
    prepare: () => {
      sheetAnchor = createEffectEditorSheetAnchor()
    },
    ready: () => options.enabled(),
    steps: t => [
      {
        element: sheetAnchor ?? '[data-tour="effect-editor"]',
        popover: {
          description: t('tour.effectEditor.panel.description'),
          showButtons: TOUR_FIRST_STEP_BUTTONS,
          title: t('tour.effectEditor.panel.title'),
        },
      },
      {
        element: '[data-tour="preview-panel"]',
        // 用户首次真实拖拽后引导自动退场，必须保持可交互
        disableActiveInteraction: false,
        popover: {
          description: t('tour.effectEditor.previewDrag.description'),
          title: t('tour.effectEditor.previewDrag.title'),
        },
      },
    ],
  })

  watch(() => options.hasInteracted(), (interacted) => {
    if (interacted) {
      tour.complete()
    }
  })
}
